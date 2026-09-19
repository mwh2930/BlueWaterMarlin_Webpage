/* Read-only, loopback-only schedule transition regression. All API responses
   are synthetic; no provider, private storage or publisher is contacted. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const origin = new URL(process.env.REPORT_TEST_ORIGIN || 'http://127.0.0.1:8878').origin;
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Use a loopback preview');
const places = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/report-destinations.json'), 'utf8')).destinations.map(place => ({ ...place, available: true }));
const destination = places.find(place => place.id === 'miami-fl');
assert.ok(destination, 'Use a real approved U.S. destination');
const sourceDates = [{ label: 'Synthetic weather forecast', date: '2026-09-18T09:00:00.000Z' }, { label: 'Synthetic ocean analysis', date: '2026-09-17' }];
const fixture = reportDate => ({ destinationId: destination.id, title: `${destination.name}, ${destination.admin}`, status: 'available', reportDate, sourceDates, radiusNm: 100, text: 'CURRENT_ISSUE_TEXT\n\nSynthetic destination data. A planning tool, not a navigation system.' });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function nextReportRequest(state) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Expected a scheduled report request')), 10000);
    state.onRequest = () => { clearTimeout(timeout); state.onRequest = null; resolve(); };
  });
}
const published = page => page.waitForFunction(() => document.getElementById('report-kind').textContent === 'Published report');
const settled = page => page.waitForFunction(() => document.getElementById('report-sheet').getAttribute('aria-busy') === 'false');
async function advanceTo(page, date) {
  const target = typeof date === 'string' ? Date.parse(date) : date;
  const delta = target - await page.evaluate(() => Date.now());
  assert.ok(delta >= -1000, 'Scenario clock must not accidentally travel backward');
  if (delta > 0) await page.clock.fastForward(delta);
}
async function sourceAgesUnchanged(page) {
  for (const source of sourceDates) assert.ok((await page.locator('.source-dates').innerText()).includes(source.date));
}
async function failClosed(page) {
  const text = await page.locator('#report-body').innerText();
  assert.doesNotMatch(text, /CURRENT_ISSUE_TEXT|NEW_ISSUE_TEXT|approximately 14 nm ENE|Synthetic weather forecast/);
  assert.equal(await page.locator('#report-meta time').count(), 0);
  assert.equal(await page.locator('.source-dates').count(), 0);
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
  const errors = [], forbidden = [];
  async function harness(start, issue, { status = 200, width = 390, invalid = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const state = { count: 0, report: fixture(issue), status, gate: null };
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date(start) });
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin || request.method() !== 'GET') { forbidden.push(`${request.method()} ${url.pathname}`); return route.abort(); }
      if (url.pathname === '/api/reports/catalog') return route.fulfill({ json: { destinations: places } });
      if (url.pathname === '/api/reports/report') {
        assert.equal(url.searchParams.get('destination'), destination.id);
        state.count += 1;
        state.onRequest?.();
        const payload = state.report, responseStatus = state.status, gate = state.gate;
        if (gate) await gate.promise;
        return route.fulfill({ status: responseStatus, json: payload }).catch(() => {});
      }
      if (url.pathname.startsWith('/api/')) { forbidden.push(url.pathname); return route.abort(); }
      return route.continue();
    });
    await page.goto(origin + '/report/?destination=' + destination.id);
    await page.waitForFunction(() => document.getElementById('service-status').textContent.startsWith('Reports are read'));
    await settled(page);
    if (status === 200 && !invalid) await published(page);
    assert.equal(state.count, 1);
    return { context, page, state };
  }
  async function crossBoundary(test, next) {
    const { page, state } = test;
    const count = state.count;
    state.report = { ...fixture(next), text: 'NEW_ISSUE_TEXT\n\nSynthetic daily report. A planning tool, not a navigation system.' };
    state.gate = deferred();
    await advanceTo(page, Date.parse(next) - 1000);
    assert.equal(state.count, count, 'No premature fetch before the publication instant');
    const requested = nextReportRequest(state);
    await advanceTo(page, Date.parse(next) + 20);
    await requested;
    await page.waitForFunction(() => document.getElementById('report-sheet').getAttribute('aria-busy') === 'true');
    assert.equal(state.count, count + 1);
    await failClosed(page);
    state.gate.resolve();
    state.gate = null;
    await published(page);
    assert.equal(await page.locator('#report-meta time').getAttribute('datetime'), next);
    assert.match(await page.locator('#report-body').innerText(), /NEW_ISSUE_TEXT/);
    await sourceAgesUnchanged(page);
  }
  try {
    // A tab already open today still receives noon's issue, then the first
    // daily issue at the exact transition. It must not switch a day early.
    const transition = await harness('2026-09-19T15:59:30Z', '2026-09-19T04:00:00.000Z', { width: 320 });
    await crossBoundary(transition, '2026-09-19T16:00:00.000Z');
    await advanceTo(transition.page, '2026-09-20T00:00:00Z');
    assert.equal(transition.state.count, 2, 'UTC midnight alone is not the cutover');
    await crossBoundary(transition, '2026-09-20T04:00:00.000Z');
    await transition.context.close();
    console.log('Today noon is preserved; an already-open page crosses the exact September20 04:00UTC transition');

    for (const { start, checkpoints, next } of [
      { start: '2026-09-20T04:00:00.000Z', checkpoints: ['2026-09-20T16:00:00Z', '2026-09-21T00:00:00Z'], next: '2026-09-21T04:00:00.000Z' },
      { start: '2026-09-30T04:00:00.000Z', checkpoints: ['2026-09-30T16:00:00Z', '2026-10-01T00:00:00Z'], next: '2026-10-01T04:00:00.000Z' },
      { start: '2026-11-01T04:00:00.000Z', checkpoints: ['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z', '2026-11-01T17:00:00Z', '2026-11-02T00:00:00Z'], next: '2026-11-02T04:00:00.000Z' },
      { start: '2026-12-31T04:00:00.000Z', checkpoints: ['2026-12-31T05:00:00Z', '2026-12-31T17:00:00Z', '2027-01-01T00:00:00Z'], next: '2027-01-01T04:00:00.000Z' },
      { start: '2027-03-14T04:00:00.000Z', checkpoints: ['2027-03-14T05:00:00Z', '2027-03-14T06:59:59Z', '2027-03-14T07:00:00Z', '2027-03-14T16:00:00Z'], next: '2027-03-15T04:00:00.000Z' }
    ]) {
      const daily = await harness(new Date(Date.parse(start) + 25 * 60000).toISOString(), start, { width: 1280 });
      for (const checkpoint of checkpoints) {
        await advanceTo(daily.page, checkpoint);
        await daily.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
        assert.equal(daily.state.count, 1, `Former Eastern slot or UTC midnight must not trigger publication at ${checkpoint}`);
        assert.equal(await daily.page.locator('#report-meta time').getAttribute('datetime'), start);
        await sourceAgesUnchanged(daily.page);
      }
      await crossBoundary(daily, next);
      await daily.context.close();
      console.log(`${start}: daily issue stays current across noon/calendar/DST boundaries until next04:00UTC`);
    }

    // The new schedule changes the slot, not the bounded four-retry budget.
    const firstSlot = Date.parse('2026-09-20T04:00:00.000Z');
    const waiting = await harness('2026-09-20T04:00:30Z', '2026-09-19T16:00:00.000Z', { status: 404 });
    assert.equal(await waiting.page.locator('#report-kind').textContent(), 'Scheduled update window');
    assert.match(await waiting.page.locator('#report-body').innerText(), /04:00 UTC/);
    assert.match(await waiting.page.locator('#report-body').innerText(), /once daily/);
    for (const [index, minute] of [5, 10, 15, 20].entries()) {
      await advanceTo(waiting.page, firstSlot + minute * 60000 - 1000);
      assert.equal(waiting.state.count, index + 1);
      const response = waiting.page.waitForResponse(item => new URL(item.url()).pathname === '/api/reports/report');
      await advanceTo(waiting.page, firstSlot + minute * 60000 + 20);
      await response;
      await settled(waiting.page);
      assert.equal(waiting.state.count, index + 2);
      await failClosed(waiting.page);
    }
    assert.doesNotMatch(await waiting.page.locator('#report-body').innerText(), /Scheduled update window/);
    await advanceTo(waiting.page, '2026-09-20T16:01:00Z');
    assert.equal(waiting.state.count, 5, 'No endless retries or obsolete noon retry window');
    await waiting.context.close();

    const recovered = await harness('2026-09-20T04:00:30Z', '2026-09-19T16:00:00.000Z', { status: 404 });
    recovered.state.status = 200;
    recovered.state.report = fixture('2026-09-20T04:00:00.000Z');
    const response = recovered.page.waitForResponse(item => new URL(item.url()).pathname === '/api/reports/report');
    await advanceTo(recovered.page, '2026-09-20T04:05:00.020Z');
    await response;
    await published(recovered.page);
    await advanceTo(recovered.page, '2026-09-20T04:25:00Z');
    assert.equal(recovered.state.count, 2, 'A successful current issue stops the remaining retries');
    await sourceAgesUnchanged(recovered.page);
    await recovered.context.close();

    for (const options of [
      { status: 503 },
      { status: 200, invalid: true }
    ]) {
      const failed = await harness('2026-09-21T04:02:00Z', '2026-09-20T04:00:00.000Z', options);
      await failClosed(failed.page);
      assert.doesNotMatch(await failed.page.locator('#report-body').innerText(), /Scheduled update window/);
      assert.match(await failed.page.locator('#report-notice').innerText(), /could not be loaded/);
      await failed.context.close();
    }

    const hidden = await harness('2026-09-19T17:00:00Z', '2026-09-19T16:00:00.000Z');
    await hidden.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await advanceTo(hidden.page, '2026-09-22T05:00:00Z');
    assert.equal(hidden.state.count, 1);
    hidden.state.report = fixture('2026-09-22T04:00:00.000Z');
    hidden.state.gate = deferred();
    const resumed = nextReportRequest(hidden.state);
    await hidden.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    await resumed;
    assert.equal(hidden.state.count, 2, 'Resume events share one fetch for the actual daily slot');
    await failClosed(hidden.page);
    hidden.state.gate.resolve();
    await published(hidden.page);
    assert.equal(await hidden.page.locator('#report-meta time').getAttribute('datetime'), '2026-09-22T04:00:00.000Z');
    await sourceAgesUnchanged(hidden.page);
    await hidden.context.close();

    const cancelled = await harness('2026-09-20T04:00:30Z', '2026-09-19T16:00:00.000Z', { status: 404 });
    await cancelled.page.locator('#destination-search').fill('Montauk');
    await advanceTo(cancelled.page, '2026-09-20T04:21:00Z');
    assert.equal(cancelled.state.count, 1, 'A new destination search cancels the old daily retry timer');
    await cancelled.context.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(forbidden, []);
    console.log('Bounded retries, success cancellation,503 distinction,stale-data rejection,source ages and hidden-tab transition recovery passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
