/* Loopback-only report reader checks. Published responses are intercepted
   fixtures, never private storage reads or actual report publication. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const origin = process.env.REPORT_TEST_ORIGIN || 'http://127.0.0.1:8878';
const parsedOrigin = new URL(origin);
if (!['127.0.0.1', 'localhost'].includes(parsedOrigin.hostname)) throw new Error('Browser tests must use a loopback preview');
const catalog = { destinations: [
  { id: 'montauk-ny', name: 'Montauk', admin: 'NY', available: true },
  { id: 'venice-la', name: 'Venice', admin: 'LA', available: false }
] };
const report = { destinationId: 'montauk-ny', title: 'Montauk, NY', status: 'available', reportDate: new Date().toISOString(), radiusNm: 100,
  sourceDates: [{ label: 'Example source', date: '2026-09-12' }],
  text: 'SARGASSUM (WEED)\n\nNo usable sargassum data for this report.\n\nA planning tool, not a navigation system.' };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
async function choose(page, name) {
  const search = page.locator('#destination-search');
  await search.fill(name);
  await search.press('ArrowDown');
  await search.press('Enter');
}
async function ready(page) {
  await page.waitForFunction(() => !document.getElementById('destination-search').disabled);
}
async function settled(page) {
  await page.waitForFunction(() => document.getElementById('report-sheet').getAttribute('aria-busy') === 'false');
}
async function published(page) {
  await page.waitForFunction(() => document.getElementById('report-kind').textContent === 'Published report');
}
async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(dimensions.document <= dimensions.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(dimensions)}`);
}
async function noContactControls(page) {
  assert.equal(await page.locator('form,input[type=email],textarea,[name=email],#account-panel').count(), 0);
  assert.equal(await page.locator('input').count(), 1, 'Only the destination search accepts input');
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  try {
    const context = await browser.newContext();
    const errors = [], foreignRequests = [], mutations = [], apiRequests = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    context.on('request', request => {
      if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.method());
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) apiRequests.push(url);
    });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== parsedOrigin.origin) { foreignRequests.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    await page.clock.install({ time: new Date() });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin + '/report/');
      await ready(page);
      await noContactControls(page);
      await noOverflow(page, `${width}px report`);
      assert.match(await page.locator('#report-notice').innerText(), /Not current conditions/);
      assert.equal(await page.locator('#report-meta time').getAttribute('datetime'), '2026-09-02');
      assert.match(await page.locator('#report-body').innerText(), /general area approximately 14 nm ENE/);
      assert.match(await page.locator('#report-body').innerText(), /Sea surface temperature: 3 days old\. Water colour: 3 days old\./);
      await page.locator('.report-details summary').click();
      await noOverflow(page, `${width}px expanded source limitations`);
    }
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body,body *')].map(node => {
        const style = getComputedStyle(node); return { node, font: parseFloat(style.fontSize), line: parseFloat(style.lineHeight) };
      });
      for (const { node, font, line } of sizes) { node.style.fontSize = font * 2 + 'px'; if (Number.isFinite(line)) node.style.lineHeight = line * 2 + 'px'; }
    });
    await noOverflow(page, '320px with 200% text and source limitations');

    await page.goto(origin + '/report/');
    await ready(page);
    await choose(page, 'montauk');
    await settled(page);
    assert.equal(await page.locator('#report-title').innerText(), 'Montauk, NY');
    assert.match(await page.locator('#report-body').innerText(), /Connection unavailable/);
    assert.doesNotMatch(await page.locator('#report-body').innerText(), /14 nm ENE/);
    assert.match(page.url(), /destination=montauk-ny/);
    await page.locator('#sample-button').click();
    assert.equal(await page.locator('#report-title').innerText(), 'Oregon Inlet, NC');
    await page.locator('#destination-search').fill('unlisted port example');
    assert.match(await page.locator('#destination-options').innerText(), /No matching destination/);
    assert.doesNotMatch(await page.locator('#destination-options').innerText(), /request|submit/i);
    await page.locator('#destination-search').press('Escape');
    assert.equal(await page.locator('#destination-search').getAttribute('aria-expanded'), 'false');

    let reportResponse = report;
    let contentType = 'application/json';
    await page.route('**/api/reports/**', async route => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({ status: 200, contentType, body: JSON.stringify(path.endsWith('/catalog') ? catalog : reportResponse) });
    });
    await page.goto(origin + '/report/?destination=montauk-ny');
    await published(page);
    assert.equal(await page.locator('#report-title').innerText(), 'Montauk, NY');
    assert.equal(await page.locator('#report-meta time').getAttribute('datetime'), report.reportDate);
    assert.equal(await page.locator('#report-meta time').innerText(), new Date(report.reportDate).toLocaleString('en-US', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' }));
    assert.match(await page.locator('.source-dates').innerText(), /Example source: 2026-09-12/);
    assert.doesNotMatch(await page.locator('#report-body').innerText(), /14 nm ENE/);
    for (const [reportDate, expectedTime] of [['2026-09-17T16:00:00.000Z', '12:00 PM EDT'], ['2026-12-17T17:00:00.000Z', '12:00 PM EST'], ['2026-09-17T04:00:00.000Z', '12:00 AM EDT']]) {
      reportResponse = { ...report, reportDate };
      await page.clock.setSystemTime(new Date(reportDate));
      const response = page.waitForResponse(url => new URL(url.url()).pathname === '/api/reports/report');
      await page.locator('#refresh-report').click();
      await response;
      await published(page);
      assert.ok((await page.locator('#report-meta time').innerText()).endsWith(expectedTime));
      assert.equal(await page.locator('#report-meta time').getAttribute('datetime'), reportDate);
      await noOverflow(page, '320px published Eastern timestamp');
    }
    await page.clock.setSystemTime(new Date());
    reportResponse = report;
    await page.locator('#destination-search').fill('montauk');
    assert.match(await page.locator('#destination-options').innerText(), /Check report/);
    await choose(page, 'venice');
    await settled(page);
    assert.equal(await page.locator('#report-title').innerText(), 'Venice, LA');
    assert.doesNotMatch(await page.locator('#report-body').innerText(), /Example source|No usable sargassum/);
    assert.equal(await page.locator('#report-meta time').count(), 0);
    assert.equal(await page.locator('#refresh-report').isVisible(), false);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);

    for (const invalid of [
      { ...report, destinationId: 'venice-la' },
      { ...report, reportDate: '2026-02-30' },
      { ...report, reportDate: '2026-09-17' },
      { ...report, reportDate: '2026-09-12 /* https://example.invalid/ */' },
      { ...report, reportDate: '2000-01-01T12:00:00Z' },
      { ...report, reportDate: '2100-01-01T12:00:00Z' },
      { ...report, text: 'A private URL https://example.invalid/ must not be rendered.' },
      { ...report, radiusNm: 301 },
      { ...report, sourceDates: [] },
      { ...report, sourceDates: [{ label: 'Example source', date: 'not a date' }] },
      { ...report, sourceDates: [{ label: '<img src=x onerror=alert(1)>', date: '2026-09-12' }] }
    ]) {
      reportResponse = invalid;
      await choose(page, 'montauk');
      await settled(page);
      assert.match(await page.locator('#report-body').innerText(), /Report unavailable/);
      assert.equal(await page.locator('#report-body img').count(), 0);
      assert.doesNotMatch(await page.locator('#report-body').innerText(), /example\.invalid|14 nm ENE/);
    }
    reportResponse = report;
    contentType = 'text/html';
    await choose(page, 'montauk');
    await settled(page);
    assert.match(await page.locator('#report-body').innerText(), /Report unavailable/);
    contentType = 'application/json';

    for (const action of ['confirm', 'unsubscribe']) {
      await page.goto(origin + '/report/?action=' + action + '#token=obsolete-test-token');
      await ready(page);
      await noContactControls(page);
      assert.equal(new URL(page.url()).hash, '');
      assert.equal(new URL(page.url()).search, '');
      assert.equal(mutations.length, 0, 'Obsolete account links cannot submit any action');
    }

    // A late response must not restore a report after the user starts a search.
    const race = await context.newPage();
    const reportGate = deferred();
    await race.route('**/api/reports/**', async route => {
      if (new URL(route.request().url()).pathname.endsWith('/catalog')) return route.fulfill({ json: catalog });
      await reportGate.promise;
      await route.fulfill({ json: report }).catch(() => {}); // Cancellation is expected.
    });
    await race.goto(origin + '/report/');
    await race.waitForFunction(() => document.getElementById('service-status').textContent.startsWith('Reports are read'));
    await choose(race, 'montauk');
    await race.waitForFunction(() => document.getElementById('report-sheet').getAttribute('aria-busy') === 'true');
    await race.locator('#destination-search').fill('venice');
    reportGate.resolve();
    await settled(race);
    await race.waitForTimeout(100);
    assert.equal(await race.locator('#report-kind').textContent(), 'Destination search');
    assert.equal(await race.locator('#report-title').innerText(), 'Choose your destination');
    assert.equal(new URL(race.url()).search, '');
    assert.doesNotMatch(await race.locator('#report-body').innerText(), /No usable sargassum|14 nm ENE/);
    await race.close();

    const delayed = await context.newPage();
    const coldStartTime = '2026-09-17T16:30:00Z';
    await delayed.clock.install({ time: new Date(coldStartTime) });
    const catalogGate = deferred();
    await delayed.route('**/api/reports/**', async route => {
      if (new URL(route.request().url()).pathname.endsWith('/catalog')) { await catalogGate.promise; return route.fulfill({ json: catalog }); }
      return route.fulfill({ json: { ...report, reportDate: coldStartTime } });
    });
    await delayed.goto(origin + '/report/');
    await ready(delayed);
    await delayed.locator('#destination-search').fill('montauk');
    assert.match(await delayed.locator('#destination-options').innerText(), /Checking report connection/);
    assert.doesNotMatch(await delayed.locator('#destination-options').innerText(), /No published report/);
    await choose(delayed, 'montauk');
    assert.equal(await delayed.locator('#report-sheet').getAttribute('aria-busy'), 'true');
    assert.match(await delayed.locator('#report-notice').innerText(), /Connecting.*Montauk.*Availability has not been checked/);
    assert.match(await delayed.locator('#report-body').innerText(), /Checking connection/);
    assert.doesNotMatch(await delayed.locator('#report-body').innerText(), /14 nm ENE/);
    assert.equal(await delayed.locator('#refresh-report').isDisabled(), true);
    // A measured Azure cold start exceeded eight seconds. Keep the safe
    // fallback usable while allowing that healthy catalog request to finish.
    await delayed.clock.fastForward(11000);
    assert.doesNotMatch(await delayed.locator('#service-status').innerText(), /connection is unavailable/);
    catalogGate.resolve();
    await published(delayed);
    assert.equal(await delayed.locator('#refresh-report').innerText(), 'Refresh report');
    await delayed.close();

    // The longer cold-start allowance remains bounded at thirty seconds.
    const hungCatalog = await context.newPage();
    await hungCatalog.clock.install({ time: new Date(coldStartTime) });
    const hungCatalogGate = deferred();
    await hungCatalog.route('**/api/reports/catalog', async route => {
      await hungCatalogGate.promise;
      await route.fulfill({ json: catalog }).catch(() => {}); // Aborted at the deadline.
    });
    await hungCatalog.goto(origin + '/report/');
    await ready(hungCatalog);
    await choose(hungCatalog, 'montauk');
    await hungCatalog.clock.fastForward(29000);
    assert.doesNotMatch(await hungCatalog.locator('#service-status').innerText(), /connection is unavailable/);
    await hungCatalog.clock.fastForward(1100);
    await hungCatalog.waitForFunction(() => document.getElementById('service-status').textContent.includes('connection is unavailable'));
    assert.equal(await hungCatalog.locator('#destination-search').isEnabled(), true, 'The local fallback survives a cold-start timeout');
    assert.equal(await hungCatalog.locator('#report-sheet').getAttribute('aria-busy'), 'false');
    assert.match(await hungCatalog.locator('#report-notice').innerText(), /report service could not be reached for Montauk, NY/);
    assert.match(await hungCatalog.locator('#report-body').innerText(), /Connection unavailable/);
    assert.doesNotMatch(await hungCatalog.locator('#report-notice').innerText(), /No current report has been published/);
    assert.equal(await hungCatalog.locator('#refresh-report').innerText(), 'Retry connection');
    hungCatalogGate.resolve();
    await hungCatalog.waitForTimeout(100);
    assert.match(await hungCatalog.locator('#service-status').innerText(), /connection is unavailable/);
    await hungCatalog.close();
    // Playwright's clock is shared by this browser context. Restore wall time
    // before later pages consume the ordinary current-date report fixture.
    await page.clock.setSystemTime(new Date());

    // An early live catalog must not wait for or be overwritten by fallback.
    const lateFallback = await context.newPage();
    const fallbackGate = deferred();
    await lateFallback.route('**/data/report-destinations.json', async route => {
      await fallbackGate.promise;
      return route.fulfill({ json: { destinations: catalog.destinations.map(place => ({ ...place, available: false })) } });
    });
    await lateFallback.route('**/api/reports/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/catalog') ? catalog : report }));
    await lateFallback.goto(origin + '/report/?destination=montauk-ny');
    await published(lateFallback);
    fallbackGate.resolve();
    await lateFallback.waitForTimeout(100);
    assert.equal(await lateFallback.locator('#report-kind').textContent(), 'Published report');
    await lateFallback.close();

    // Error/HTML responses use the safe local candidate list, never a sample substitution.
    const offline = await context.newPage();
    await offline.route('**/api/reports/**', route => route.fulfill({ status: 503, contentType: 'text/html', body: '<h1>Unavailable</h1>' }));
    await offline.goto(origin + '/report/?destination=montauk-ny');
    await ready(offline);
    await settled(offline);
    assert.match(await offline.locator('#report-body').innerText(), /Connection unavailable/);
    assert.match(await offline.locator('#report-notice').innerText(), /report service could not be reached for Montauk, NY/);
    assert.equal(await offline.locator('#refresh-report').innerText(), 'Retry connection');
    assert.doesNotMatch(await offline.locator('#report-body').innerText(), /14 nm ENE/);
    await offline.close();

    // Failed catalog requests never become "unpublished" claims. Recovery is
    // explicit, bounded and coalesced; it loads only the current selection.
    const recovery = await context.newPage();
    await recovery.clock.install({ time: new Date(coldStartTime) });
    const recoveryGate = deferred();
    let catalogRequests = 0;
    const recoveryReports = [];
    await recovery.route('**/api/reports/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/catalog')) {
        catalogRequests += 1;
        if (catalogRequests === 1) return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
        await recoveryGate.promise;
        return route.fulfill({ json: { destinations: catalog.destinations.map(place => ({ ...place, available: true })) } });
      }
      const id = url.searchParams.get('destination');
      recoveryReports.push(id);
      return route.fulfill({ json: { ...report, destinationId: id, title: 'Venice, LA', reportDate: coldStartTime, text: 'Recovered Venice report. A planning tool, not a navigation system.' } });
    });
    await recovery.goto(origin + '/report/?destination=montauk-ny');
    await recovery.waitForFunction(() => document.getElementById('refresh-report').textContent === 'Retry connection');
    await recovery.locator('#destination-search').fill('montauk');
    assert.match(await recovery.locator('#destination-options').innerText(), /Report connection unavailable/);
    assert.doesNotMatch(await recovery.locator('#destination-options').innerText(), /No published report/);
    await choose(recovery, 'montauk');
    await recovery.clock.fastForward(60000);
    assert.equal(catalogRequests, 1, 'No automatic catalog polling after failure');
    assert.deepEqual(recoveryReports, []);
    await recovery.locator('#refresh-report').click();
    await recovery.waitForFunction(() => document.getElementById('refresh-report').textContent === 'Connecting…');
    await recovery.locator('#refresh-report').evaluate(button => {
      button.dispatchEvent(new Event('click'));
      button.dispatchEvent(new Event('click'));
    });
    await choose(recovery, 'venice');
    assert.match(await recovery.locator('#report-notice').innerText(), /Connecting.*Venice/);
    assert.equal(await recovery.locator('#refresh-report').isDisabled(), true);
    assert.deepEqual(recoveryReports, []);
    recoveryGate.resolve();
    await published(recovery);
    assert.equal(catalogRequests, 2, 'Repeated retry events share one catalog request');
    assert.deepEqual(recoveryReports, ['venice-la'], 'Recovery fetches only the selected destination');
    assert.equal(await recovery.locator('#report-title').innerText(), 'Venice, LA');
    assert.match(await recovery.locator('#report-body').innerText(), /Recovered Venice report/);
    assert.equal(await recovery.locator('#report-meta time').getAttribute('datetime'), coldStartTime);
    assert.equal(await recovery.locator('#refresh-report').innerText(), 'Refresh report');
    await recovery.close();
    await page.clock.setSystemTime(new Date());

    // Noon/midnight are resolved in Eastern time, not by adding twelve UTC
    // hours to the previous update. Old text is removed before a new fetch.
    async function timedPage(start, initial, initialStatus = 200) {
      const tab = await context.newPage();
      await tab.clock.install({ time: new Date(start) });
      const state = { count: 0, report: { ...report, reportDate: initial, text: 'OLD_SLOT_TEXT\n\nA planning tool, not a navigation system.' }, status: initialStatus, gate: null };
      await tab.route('**/api/reports/**', async route => {
        if (new URL(route.request().url()).pathname.endsWith('/catalog')) return route.fulfill({ json: catalog });
        state.count += 1;
        const payload = state.report, status = state.status;
        if (state.gate) await state.gate.promise;
        await route.fulfill({ status, json: payload }).catch(() => {});
      });
      await tab.goto(origin + '/report/?destination=montauk-ny');
      await settled(tab);
      if (initialStatus === 200) await published(tab);
      return { tab, state };
    }
    for (const [start, previous, next] of [
      ['2026-09-17T15:59:59Z', '2026-09-17T04:00:00Z', '2026-09-17T16:00:00Z'],
      ['2026-09-18T03:59:59Z', '2026-09-17T16:00:00Z', '2026-09-18T04:00:00Z']
    ]) {
      const { tab, state } = await timedPage(start, previous);
      state.gate = deferred();
      state.report = { ...report, reportDate: next, text: 'NEW_SLOT_TEXT\n\nA planning tool, not a navigation system.' };
      await tab.clock.fastForward(1100);
      await tab.waitForFunction(() => document.getElementById('report-sheet').getAttribute('aria-busy') === 'true');
      assert.equal(state.count, 2);
      assert.doesNotMatch(await tab.locator('#report-body').innerText(), /OLD_SLOT_TEXT/);
      assert.equal(await tab.locator('#report-meta time').count(), 0);
      state.gate.resolve();
      await published(tab);
      assert.match(await tab.locator('#report-body').innerText(), /NEW_SLOT_TEXT/);
      assert.equal(await tab.locator('#report-meta time').getAttribute('datetime'), next);
      await tab.close();
    }

    // Fall-back noon is thirteen hours after midnight; spring-forward noon
    // is eleven. No premature fetch and no twelve-hour fixed-offset drift.
    for (const [start, next, earlyHours] of [
      ['2026-11-01T04:00:00Z', '2026-11-01T17:00:00Z', 12],
      ['2026-03-08T05:00:00Z', '2026-03-08T16:00:00Z', 10]
    ]) {
      const { tab, state } = await timedPage(start, start);
      state.report = { ...report, reportDate: next };
      await tab.clock.fastForward(earlyHours * 60 * 60 * 1000);
      assert.equal(state.count, 1);
      await tab.clock.fastForward(60 * 60 * 1000 + 100);
      await published(tab);
      assert.equal(state.count, 2);
      assert.equal(await tab.locator('#report-meta time').getAttribute('datetime'), next);
      await tab.close();
    }

    // Only four publication-window retries, and success stops them.
    const bounded = await timedPage('2026-09-17T16:00:00Z', '2026-09-17T04:00:00Z', 404);
    for (let count = 2; count <= 5; count += 1) {
      await bounded.tab.clock.fastForward(5 * 60 * 1000);
      await settled(bounded.tab);
      assert.equal(bounded.state.count, count);
      assert.doesNotMatch(await bounded.tab.locator('#report-body').innerText(), /OLD_SLOT_TEXT/);
    }
    await bounded.tab.clock.fastForward(40 * 60 * 1000);
    assert.equal(bounded.state.count, 5, 'No polling after the publication window');
    await bounded.tab.close();

    const recovered = await timedPage('2026-09-17T16:00:00Z', '2026-09-17T04:00:00Z', 404);
    recovered.state.status = 200;
    recovered.state.report = { ...report, reportDate: '2026-09-17T16:00:00Z' };
    await recovered.tab.clock.fastForward(5 * 60 * 1000);
    await published(recovered.tab);
    await recovered.tab.clock.fastForward(20 * 60 * 1000);
    assert.equal(recovered.state.count, 2, 'Successful report stops publication retries');
    await recovered.tab.close();

    // Hidden tabs do not retry. Returning after multiple slots rechecks the
    // actual clock, including pages restored from the back-forward cache.
    const resumed = await timedPage('2026-09-17T15:59:59Z', '2026-09-17T04:00:00Z');
    await resumed.tab.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await resumed.tab.clock.fastForward(36 * 60 * 60 * 1000 + 1100);
    assert.equal(resumed.state.count, 1, 'No hidden-tab fetches');
    resumed.state.report = { ...report, reportDate: '2026-09-19T04:00:00Z' };
    resumed.state.gate = deferred();
    await resumed.tab.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    await resumed.tab.waitForFunction(() => document.getElementById('report-sheet').getAttribute('aria-busy') === 'true');
    assert.equal(resumed.state.count, 2, 'Resume events share one current-slot fetch');
    assert.doesNotMatch(await resumed.tab.locator('#report-body').innerText(), /OLD_SLOT_TEXT/);
    resumed.state.gate.resolve();
    await published(resumed.tab);
    await resumed.tab.close();

    const cancelled = await timedPage('2026-09-17T16:00:00Z', '2026-09-17T04:00:00Z', 404);
    await cancelled.tab.locator('#destination-search').fill('venice');
    await cancelled.tab.clock.fastForward(21 * 60 * 1000);
    assert.equal(cancelled.state.count, 1, 'Starting a new search cancels all retries');
    await cancelled.tab.close();

    assert.equal(foreignRequests.length, 0, 'No third-party requests or direct storage access');
    assert.deepEqual(mutations, [], 'The report reader only performs reads');
    assert.ok(apiRequests.every(url => ['/api/reports/catalog', '/api/reports/report'].includes(url.pathname)), 'No account or delivery endpoints requested');
    assert.ok(apiRequests.every(url => !url.href.includes('token=')), 'No obsolete tokens forwarded');
    assert.deepEqual(errors, []);
    await context.close();

    const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
    const staticPage = await noScript.newPage();
    await staticPage.goto(origin + '/report/');
    assert.match(await staticPage.locator('#report-body').innerText(), /approximately 14 nm ENE/);
    assert.match(await staticPage.locator('noscript').innerText(), /historical example/);
    await noContactControls(staticPage);
    await staticPage.locator('.report-details summary').click();
    await noOverflow(staticPage, 'No-script report');
    await staticPage.goto(origin + '/report/privacy/');
    await noOverflow(staticPage, '320px report data and privacy');
    await noScript.close();
    console.log('Report browser checks passed: read-only requests, no contact controls, responsive and 200% text layout, keyboard search, historical labeling, source dates, DST-aware boundary refresh, bounded visible-only retries, resume freshness, invalid data rejection, obsolete links inert, race-safe selection, fallback, no-script and no third-party requests.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
