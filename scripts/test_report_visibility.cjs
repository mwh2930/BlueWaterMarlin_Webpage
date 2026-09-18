/* Loopback-only regression: an explicit destination choice reveals its readout.
   Synthetic responses never leave this test or become published reports. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const origin = process.env.REPORT_TEST_ORIGIN || 'http://127.0.0.1:8892';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Use a loopback preview');
const destinations = [
  { id: 'miami-fl', name: 'Miami', admin: 'FL', available: true },
  { id: 'montauk-ny', name: 'Montauk', admin: 'NY', available: true }
];
const fixture = place => ({
  destinationId: place.id, title: `${place.name}, ${place.admin}`, status: 'available',
  reportDate: '2026-09-18T12:40:00.000Z', radiusNm: 100,
  sourceDates: [{ label: 'Synthetic weather source', date: '2026-09-18T11:20:00.000Z' }],
  text: `Weather forecast\n\nSynthetic weather for ${place.id}. Wind speed: ${place.id === 'miami-fl' ? '5' : '12'} knots.\n\nA planning tool, not a navigation system.`
});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const position = page => page.evaluate(() => ({
  scroll: scrollY, active: document.activeElement.id,
  top: document.getElementById('report-title').getBoundingClientRect().top,
  bottom: document.getElementById('report-title').getBoundingClientRect().bottom,
  height: innerHeight, width: innerWidth, documentWidth: document.documentElement.scrollWidth
}));
async function revealed(page, name) {
  assert.match(await page.locator('#report-title').innerText(), new RegExp(name));
  const state = await position(page);
  assert.equal(state.active, 'report-title', 'The explicit choice moves keyboard focus to the selected report');
  assert.ok(state.top >= 0 && state.bottom < state.height, 'The destination heading is visible without another scroll');
  assert.ok(state.scroll > 0, 'The previously off-screen report has been brought into view');
  assert.ok(state.documentWidth <= state.width + 1, 'No horizontal overflow');
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
  try {
    for (const config of [
      { width: 1440, height: 1000, touch: false, mode: 'mouse', motion: 'no-preference' },
      { width: 390, height: 844, touch: true, mode: 'touch', motion: 'reduce' },
      { width: 320, height: 740, touch: true, mode: 'keyboard', motion: 'reduce' }
    ]) {
      const context = await browser.newContext({
        viewport: { width: config.width, height: config.height },
        hasTouch: config.touch, isMobile: config.touch, reducedMotion: config.motion
      });
      const page = await context.newPage();
      const errors = [], requests = [], forbidden = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.install({ time: new Date('2026-09-18T13:30:00Z') });
      const reportGate = deferred();
      let holdFirst = true;
      let status = 200;
      let issueDate = '2026-09-18T12:40:00.000Z';
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin || request.method() !== 'GET') { forbidden.push(url.pathname); return route.abort(); }
        if (url.pathname === '/api/reports/catalog') return route.fulfill({ json: { destinations } });
        if (url.pathname === '/api/reports/report') {
          const id = url.searchParams.get('destination');
          requests.push(id);
          if (holdFirst) { holdFirst = false; await reportGate.promise; }
          return route.fulfill({ status, json: status === 200 ? { ...fixture(destinations.find(place => place.id === id)), reportDate: issueDate } : { error: 'Synthetic failure' } }).catch(() => {});
        }
        return route.continue();
      });
      await page.goto(origin + '/report/');
      await page.waitForFunction(() => document.getElementById('service-status').textContent.startsWith('Reports are read'));
      assert.equal((await position(page)).scroll, 0, 'Catalog arrival does not move the page');
      assert.equal(await page.locator('#view-report').isVisible(), false);
      const search = page.locator('#destination-search');
      const choose = async name => {
        await search.fill(name);
        if (config.mode === 'keyboard') await search.press('Enter');
        else if (config.touch) await page.getByRole('option').first().tap();
        else await page.getByRole('option').first().click();
      };

      await choose('Miami');
      await revealed(page, 'Miami');
      assert.equal(await page.locator('#report-sheet').getAttribute('aria-busy'), 'true');
      assert.match(await page.locator('#selection-status').innerText(), /Loading report for Miami/);
      assert.equal(await page.locator('#view-report').isVisible(), true);

      // A delayed response cannot drag the visitor back after they return to search.
      await search.click();
      const before = await position(page);
      reportGate.resolve();
      await page.waitForFunction(() => document.getElementById('report-kind').textContent === 'Published report');
      const after = await position(page);
      assert.equal(after.active, 'destination-search');
      assert.ok(Math.abs(before.scroll - after.scroll) <= 1, 'Report completion does not scroll or steal focus');
      assert.equal(await page.locator('.report-text').innerText(), fixture(destinations[0]).text);
      assert.equal(await page.locator('#report-meta time').getAttribute('datetime'), fixture(destinations[0]).reportDate);
      assert.match(await page.locator('.source-dates').innerText(), /2026-09-18T11:20:00.000Z/);
      assert.match(await page.locator('#selection-status').innerText(), /Report ready for Miami/);

      await choose('Montauk');
      await page.waitForFunction(() => document.getElementById('report-kind').textContent === 'Published report');
      await revealed(page, 'Montauk');
      assert.equal(await page.locator('.report-text').innerText(), fixture(destinations[1]).text);
      assert.doesNotMatch(await page.locator('#report-body').innerText(), /miami-fl|14 nm ENE/);
      assert.deepEqual(requests, ['miami-fl', 'montauk-ny']);

      // The explicit return link reveals existing data without another request.
      await page.locator('#view-report').click();
      await revealed(page, 'Montauk');
      assert.equal(requests.length, 2);

      status = 503;
      await choose('Miami');
      await page.waitForFunction(() => document.getElementById('report-sheet').getAttribute('aria-busy') === 'false');
      await revealed(page, 'Miami');
      assert.match(await page.locator('#selection-status').innerText(), /Could not load the report for Miami/);
      assert.doesNotMatch(await page.locator('#selection-status').innerText(), /not.*published/i);
      assert.doesNotMatch(await page.locator('#report-body').innerText(), /Synthetic weather for montauk/);

      await search.fill('Montauk');
      assert.equal(await page.locator('#view-report').isVisible(), false, 'Typing invalidates the previous report link');
      assert.equal((await position(page)).active, 'destination-search');

      // A bookmarked destination is automatic, not permission to move focus.
      status = 200;
      await page.goto(origin + '/report/?destination=montauk-ny');
      await page.waitForFunction(() => document.getElementById('report-kind').textContent === 'Published report');
      assert.equal((await position(page)).scroll, 0);
      assert.notEqual((await position(page)).active, 'report-title');
      await page.locator('#refresh-report').click();
      await page.waitForFunction(() => document.getElementById('report-sheet').getAttribute('aria-busy') === 'false');
      assert.notEqual((await position(page)).active, 'report-title', 'Refresh never moves focus to the report');
      assert.equal(await page.locator('#view-report').isVisible(), true);

      // A scheduled issue check is not a new user request to move the viewport.
      await search.click();
      const beforeScheduled = await position(page);
      issueDate = '2026-09-18T16:00:00.000Z';
      await page.clock.setSystemTime(new Date(issueDate));
      await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
      await page.waitForFunction(() => document.querySelector('#report-meta time')?.dateTime === '2026-09-18T16:00:00.000Z');
      const afterScheduled = await position(page);
      assert.equal(afterScheduled.active, 'destination-search');
      assert.ok(Math.abs(beforeScheduled.scroll - afterScheduled.scroll) <= 1, 'Scheduled refresh preserves the viewport');

      await page.locator('#sample-button').click();
      assert.equal(await page.locator('#view-report').isVisible(), false);
      assert.equal(await page.locator('#report-kind').textContent(), 'Historical example');
      assert.deepEqual(errors, []);
      assert.deepEqual(forbidden, []);
      console.log(`${config.width}px ${config.mode}: explicit selection reveals the correct data; automatic completion, URL loading and refresh preserve focus; errors stay visible`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
