/* Loopback-only destination-first regressions. Use the real static U.S.
   scope; synthetic report responses never read or publish production data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const origin = new URL(process.env.REPORT_TEST_ORIGIN || 'http://127.0.0.1:8878').origin;
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Use a loopback preview');
const scope = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/report-destinations.json'), 'utf8')).destinations;
const allowed = new Set(scope.map(place => place.id));
const international = [
  { id: 'bimini-bs', name: 'Bimini', admin: 'Bahamas', available: true },
  { id: 'cabo-san-lucas-mx', name: 'Cabo San Lucas', admin: 'MX', available: true },
  { id: 'exmouth-wa', name: 'Exmouth', admin: 'WA', available: true },
  { id: 'cairns-qld', name: 'Cairns', admin: 'QLD', available: true },
  { id: 'invented-us-port', name: 'Unapproved Port', admin: 'FL', available: true }
];
assert.equal(scope.length, 60, 'The real static catalog defines the approved 60 U.S. destinations');
assert.equal(allowed.size, 60, 'The scope cannot contain duplicate IDs');
for (const place of international) assert.ok(!allowed.has(place.id), `${place.id} must not be in the static scope`);
for (const id of ['westport-wa', 'ilwaco-wa', 'neah-bay-wa']) assert.ok(allowed.has(id), 'Washington must not be confused with Western Australia');
const places = [...scope.map(place => ({ ...place, available: true })), ...international];
const now = '2026-09-18T17:30:00.000Z';
const samplePattern = /general area approximately 14 nm ENE|Sea surface temperature: 3 days old/;
const placeLabel = place => [place.name, place.admin].filter(Boolean).join(', ');
const fixture = place => ({
  destinationId: place.id, title: placeLabel(place), status: 'available', radiusNm: 100,
  reportDate: '2026-09-18T16:10:00.000Z',
  sourceDates: [{ label: 'Synthetic source for ' + place.name, date: '2026-09-18T15:00:00.000Z' }],
  text: `Synthetic destination-specific report for ${place.id}. A planning tool, not a navigation system.`
});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const ready = page => page.waitForFunction(() => !document.getElementById('destination-search').disabled && document.getElementById('service-status').textContent.startsWith('Reports are read'));
const settled = page => page.waitForFunction(() => document.getElementById('report-sheet').getAttribute('aria-busy') === 'false');
const published = page => page.waitForFunction(() => document.getElementById('report-kind').textContent === 'Published report');
async function choose(page, id, mode = 'keyboard') {
  const place = places.find(item => item.id === id);
  const search = page.locator('#destination-search');
  await search.fill(placeLabel(place));
  if (mode === 'touch') await page.getByRole('option').first().tap();
  else if (mode === 'mouse') await page.getByRole('option').first().click();
  else { await search.press('ArrowDown'); await search.press('Enter'); }
}
async function noSample(page) {
  assert.doesNotMatch(await page.locator('#report-body').innerText(), samplePattern, 'The historical sample cannot substitute for a destination response');
}
async function noOverflow(page, label) {
  const box = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(box.scroll <= box.width + 1, `${label}: horizontal overflow ${JSON.stringify(box)}`);
}
async function advanceTo(page, timestamp) {
  const delta = timestamp - await page.evaluate(() => Date.now());
  if (delta > 0) await page.clock.fastForward(delta);
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
  const errors = [], forbidden = [];
  async function harness({ width = 390, time = now, catalogGate, reportHandler, brokenScope = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date(time) });
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin || request.method() !== 'GET') { forbidden.push(`${request.method()} ${url.pathname}`); return route.abort(); }
      if (brokenScope && url.pathname === '/data/report-destinations.json') return route.fulfill({ status: 503, json: { error: 'Synthetic scope failure' } });
      if (url.pathname === '/api/reports/catalog') {
        if (catalogGate) await catalogGate.promise;
        return route.fulfill({ json: { destinations: places } }).catch(() => {});
      }
      if (url.pathname === '/api/reports/report') {
        const id = url.searchParams.get('destination');
        requests.push(id);
        assert.ok(allowed.has(id), `Unapproved destination escaped to the report API: ${id}`);
        if (reportHandler) return reportHandler(route, id);
        return route.fulfill({ json: fixture(places.find(place => place.id === id)) });
      }
      return route.continue();
    });
    return { context, page, requests };
  }
  try {
    for (const { width, mode } of [{ width: 320, mode: 'keyboard' }, { width: 390, mode: 'touch' }, { width: 1280, mode: 'mouse' }]) {
      const { context, page, requests } = await harness({ width });
      await page.goto(origin + '/report/');
      await ready(page);
      assert.equal(await page.locator('#report-title').innerText(), 'Choose your destination');
      assert.notEqual(await page.locator('#report-kind').textContent(), 'Historical example');
      assert.equal(await page.locator('#sample-button').isVisible(), true);
      assert.equal(await page.locator('#report-meta time').count(), 0);
      assert.equal(requests.length, 0, 'Opening the report page must not auto-select a port');
      await noSample(page);
      await noOverflow(page, `${width}px initial state`);

      // The API intentionally includes out-of-scope records. Static U.S. IDs
      // are authoritative, not country guesses based on an admin abbreviation.
      for (const place of international) {
        await page.locator('#destination-search').fill(place.name);
        assert.equal(await page.getByRole('option').count(), 0, `${place.id} must not be selectable`);
        await page.locator('#destination-search').press('Enter');
      }
      assert.equal(requests.length, 0);
      await choose(page, 'westport-wa', mode);
      await published(page);
      assert.equal(await page.locator('#report-title').innerText(), 'Westport, WA');
      assert.match(await page.locator('#report-body').innerText(), /westport-wa/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'report-title');
      await noSample(page);
      await noOverflow(page, `${width}px Washington report`);

      await page.locator('#sample-button').click();
      assert.equal(await page.locator('#report-kind').textContent(), 'Historical example');
      assert.equal(await page.locator('#report-title').innerText(), 'Oregon Inlet, NC');
      assert.match(await page.locator('#report-notice').innerText(), /Not current conditions/);
      assert.match(await page.locator('#report-body').innerText(), samplePattern);
      assert.equal(new URL(page.url()).search, '');
      await noOverflow(page, `${width}px explicit historical example`);
      await choose(page, 'miami-fl', mode);
      await published(page);
      assert.match(await page.locator('#report-body').innerText(), /miami-fl/);
      await noSample(page);

      await page.goto(origin + '/report/?destination=montauk-ny');
      await published(page);
      assert.match(await page.locator('#report-body').innerText(), /montauk-ny/);
      assert.notEqual(await page.evaluate(() => document.activeElement.id), 'report-title', 'A bookmark must not steal keyboard focus');
      await noSample(page);
      const count = requests.length;
      for (const id of ['exmouth-wa', 'cabo-san-lucas-mx', 'bimini-bs', 'invented-us-port', 'unlisted-destination']) {
        await page.goto(origin + '/report/?destination=' + id);
        await ready(page);
        assert.equal(await page.locator('#report-title').innerText(), 'Choose your destination');
        assert.equal(new URL(page.url()).search, '', 'Rejected bookmarks must not remain selected in the address');
        assert.equal(requests.length, count, `Rejected bookmark ${id} must make no report request`);
        await noSample(page);
      }
      assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
      console.log(`${width}px: destination-first, explicit sample, keyboard/pointer selection, Washington and rejected international bookmarks passed`);
      await context.close();
    }

    // A delayed service catalog cannot bypass the real local scope. The local
    // fallback stays usable while report availability remains unconfirmed.
    const catalogGate = deferred();
    const fallback = await harness({ catalogGate });
    await fallback.page.goto(origin + '/report/');
    await fallback.page.waitForFunction(() => !document.getElementById('destination-search').disabled);
    await fallback.page.locator('#destination-search').fill('Exmouth');
    assert.equal(await fallback.page.getByRole('option').count(), 0);
    await choose(fallback.page, 'westport-wa');
    assert.equal(fallback.requests.length, 0);
    await noSample(fallback.page);
    catalogGate.resolve();
    await published(fallback.page);
    assert.deepEqual(fallback.requests, ['westport-wa']);
    await fallback.context.close();

    // Fail closed if the authoritative scope cannot be obtained. A healthy
    // but broader API catalog must never implicitly become the public scope.
    const broken = await harness({ brokenScope: true });
    await broken.page.goto(origin + '/report/?destination=miami-fl', { waitUntil: 'networkidle' });
    assert.equal(await broken.page.locator('#destination-search').isDisabled(), true);
    assert.equal(broken.requests.length, 0);
    assert.equal(await broken.page.locator('#report-title').innerText(), 'Choose your destination');
    await noSample(broken.page);
    await broken.context.close();
    console.log('Static-scope fallback and scope failure fail-closed checks passed');

    // Late Miami data cannot overwrite a later Montauk selection.
    const reportGate = deferred();
    const race = await harness({ reportHandler: async (route, id) => {
      if (id === 'miami-fl') await reportGate.promise;
      return route.fulfill({ json: fixture(places.find(place => place.id === id)) }).catch(() => {});
    } });
    await race.page.goto(origin + '/report/');
    await ready(race.page);
    await choose(race.page, 'miami-fl');
    await race.page.waitForFunction(() => document.getElementById('report-sheet').getAttribute('aria-busy') === 'true');
    await choose(race.page, 'montauk-ny');
    await published(race.page);
    reportGate.resolve();
    await race.page.waitForTimeout(100);
    assert.match(await race.page.locator('#report-body').innerText(), /montauk-ny/);
    assert.doesNotMatch(await race.page.locator('#report-body').innerText(), /miami-fl/);
    assert.equal(new URL(race.page.url()).searchParams.get('destination'), 'montauk-ny');
    await noSample(race.page);
    await race.context.close();
    console.log('Rapid destination change rejects a late prior response');

    // Every permanent destination page binds its own ID. A conflicting query
    // cannot replace the location advertised in its URL or canonical metadata.
    const leaves = await harness({ width: 390 });
    for (const place of scope) {
      assert.ok(fs.existsSync(path.join(__dirname, '../report', place.id, 'index.html')), `Missing generated page for ${place.id}`);
      const count = leaves.requests.length;
      await leaves.page.goto(`${origin}/report/${place.id}/?destination=exmouth-wa`);
      await published(leaves.page);
      assert.equal(await leaves.page.locator('body').getAttribute('data-report-destination'), place.id);
      assert.equal(await leaves.page.locator('#report-title').innerText(), placeLabel(place));
      assert.match(await leaves.page.locator('#report-body').innerText(), new RegExp(place.id));
      assert.equal(new URL(leaves.page.url()).pathname, `/report/${place.id}/`);
      assert.equal(new URL(leaves.page.url()).search, '');
      assert.equal(await leaves.page.locator('link[rel="canonical"]').getAttribute('href'), `https://www.bluewatermarlin.com/report/${place.id}/`);
      assert.deepEqual(leaves.requests.slice(count), [place.id], 'Only the page-bound destination may be requested');
      await noSample(leaves.page);
      await noOverflow(leaves.page, `${place.id} destination page`);
    }
    await leaves.page.goto(origin + '/report/miami-fl/');
    await published(leaves.page);
    await choose(leaves.page, 'montauk-ny');
    await leaves.page.waitForURL(origin + '/report/montauk-ny/');
    await published(leaves.page);
    assert.equal(await leaves.page.locator('body').getAttribute('data-report-destination'), 'montauk-ny');
    assert.match(await leaves.page.locator('#report-body').innerText(), /montauk-ny/);
    await leaves.page.locator('#sample-button').click();
    await leaves.page.waitForURL(url => url.pathname === '/report/');
    await leaves.page.waitForFunction(() => document.getElementById('report-kind').textContent === 'Historical example');
    assert.equal(await leaves.page.locator('#report-title').innerText(), 'Oregon Inlet, NC');
    assert.match(await leaves.page.locator('#report-notice').innerText(), /Not current conditions/);
    assert.match(await leaves.page.locator('#report-body').innerText(), samplePattern);
    await leaves.context.close();
    console.log('All 60 permanent destination pages bind the correct report, reject conflicting queries, fit mobile, and navigate safely');

    // Verify both Eastern issue slots and the winter offset. Publication
    // window wording is a schedule, never a claim the publisher is running.
    for (const slot of ['2026-09-18T16:00:00.000Z', '2026-09-19T04:00:00.000Z', '2026-12-18T17:00:00.000Z']) {
      const slotTime = Date.parse(slot);
      const pending = await harness({ time: new Date(slotTime + 30000).toISOString(), reportHandler: route => route.fulfill({ status: 404, json: { error: 'Synthetic missing issue' } }) });
      await pending.page.goto(origin + '/report/?destination=miami-fl');
      await ready(pending.page);
      await settled(pending.page);
      assert.equal(pending.requests.length, 1);
      assert.match(await pending.page.locator('#report-sheet').innerText(), /Scheduled update window/);
      assert.doesNotMatch(await pending.page.locator('#report-sheet').innerText(), /publisher is running|publishing now|update in progress/i);
      await noSample(pending.page);
      for (const [index, minutes] of [5, 10, 15, 20].entries()) {
        await advanceTo(pending.page, slotTime + minutes * 60000 - 1000);
        assert.equal(pending.requests.length, index + 1, `No premature retry before :${minutes}`);
        const response = pending.page.waitForResponse(res => new URL(res.url()).pathname === '/api/reports/report');
        await advanceTo(pending.page, slotTime + minutes * 60000 + 20);
        await response;
        await settled(pending.page);
        assert.equal(pending.requests.length, index + 2, `Retry at :${minutes}`);
        await noSample(pending.page);
      }
      await advanceTo(pending.page, slotTime + 21 * 60000);
      assert.doesNotMatch(await pending.page.locator('#report-sheet').innerText(), /Scheduled update window/);
      assert.match(await pending.page.locator('#report-body').innerText(), /Report unavailable/);
      await advanceTo(pending.page, slotTime + 60 * 60000);
      assert.equal(pending.requests.length, 5, 'Retries stop after the bounded publication window');
      await pending.context.close();
      console.log(`${slot}: 404 schedule wording and four bounded Eastern retries passed`);
    }

    for (const { status, time, expected } of [
      { status: 503, time: '2026-09-18T16:02:00.000Z', expected: /could not be loaded|could not load|connection/i },
      { status: 404, time: '2026-09-18T16:21:00.000Z', expected: /No current report has been published|Report unavailable/ }
    ]) {
      const failed = await harness({ time, reportHandler: route => route.fulfill({ status, json: { error: 'Synthetic failure' } }) });
      await failed.page.goto(origin + '/report/?destination=miami-fl');
      await ready(failed.page);
      await settled(failed.page);
      assert.match(await failed.page.locator('#report-sheet').innerText(), expected);
      assert.doesNotMatch(await failed.page.locator('#report-sheet').innerText(), /Scheduled update window/);
      await noSample(failed.page);
      await noOverflow(failed.page, `${status} failure state`);
      await failed.context.close();
    }

    // HTML itself should not show a historical report before JavaScript runs.
    const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
    const staticPage = await noScript.newPage();
    await staticPage.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await staticPage.goto(origin + '/report/');
    assert.equal(await staticPage.locator('#report-title').innerText(), 'Choose your destination');
    await noSample(staticPage);
    await noScript.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(forbidden, []);
    console.log('Connection failures, post-window unavailability, no-script initial state, and safe network boundaries passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
