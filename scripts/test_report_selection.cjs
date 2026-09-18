/* Selection regressions use synthetic, destination-bound responses only. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const origin = process.env.REPORT_TEST_ORIGIN || 'http://127.0.0.1:8878';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Use a loopback preview');
const places = [
  { id: 'montauk-ny', name: 'Montauk', admin: 'NY', available: true },
  { id: 'venice-la', name: 'Venice', admin: 'LA', available: true },
  { id: 'miami-fl', name: 'Miami', admin: 'FL', available: true },
  { id: 'montauk-point-ny', name: 'Montauk Point', admin: 'NY', available: true },
  { id: 'newport-ri', name: 'Newport', admin: 'RI', available: true },
  { id: 'newport-or', name: 'Newport', admin: 'OR', available: true },
  { id: 'san-jose-ca', name: 'San José', admin: 'CA', available: true },
  { id: 'san-jose-del-cabo-mx', name: 'San José del Cabo', admin: 'MX', available: true }
];
// Duplicate names and the accented U.S. label are deliberate test fixtures,
// not additions to the reviewed production destination catalog. Cabo appears
// only in the live response, exercising the independent public-scope gate.
const scope = places.filter(place => place.admin !== 'MX').map(place => ({
  ...place, available: false,
  coast: ['CA', 'OR'].includes(place.admin) ? 'west-coast' : place.admin === 'LA' ? 'gulf' : 'atlantic',
  timeZone: ['CA', 'OR'].includes(place.admin) ? 'America/Los_Angeles' : place.admin === 'LA' ? 'America/Chicago' : 'America/New_York'
}));
const now = '2026-09-18T17:30:00.000Z';
const fixture = place => ({
  destinationId: place.id, title: `${place.name}, ${place.admin}`, status: 'available',
  reportDate: '2026-09-18T16:10:00.000Z', radiusNm: 100,
  sourceDates: [{ label: `Synthetic ${place.name} source`, date: '2026-09-18T15:00:00.000Z' }],
  text: `Synthetic report for ${place.name}, ${place.admin} (${place.id}). A planning tool, not a navigation system.`
});

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
  try {
    for (const touch of [false, true]) {
      const context = await browser.newContext({ hasTouch: touch, isMobile: touch, viewport: { width: touch ? 390 : 1280, height: 900 } });
      const page = await context.newPage();
      const errors = [], requests = [];
      let missingStatus = 404;
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.install({ time: new Date(now) });
      await page.route('**/data/report-destinations.json', route => route.fulfill({ json: { schemaVersion: 1, destinations: scope } }));
      await page.route('**/api/reports/**', route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/catalog')) return route.fulfill({ json: { destinations: places } });
        const id = url.searchParams.get('destination');
        requests.push(id);
        const place = places.find(p => p.id === id);
        return id === 'miami-fl'
          ? route.fulfill({ status: missingStatus, json: { error: 'Synthetic unavailable response.' } })
          : route.fulfill({ json: fixture(place) });
      });
      await page.goto(origin + '/report/');
      await page.waitForFunction(() => document.querySelector('#service-status').textContent.startsWith('Reports are read'));
      const search = page.locator('#destination-search');
      for (const name of ['Montauk', 'Venice']) {
        await search.fill(name);
        const option = page.getByRole('option').first();
        if (touch) await option.tap(); else await option.click();
        await page.waitForFunction(() => document.querySelector('#report-kind').textContent === 'Published report');
        assert.match(await page.locator('#report-body').innerText(), new RegExp(`Synthetic report for ${name}`));
        assert.match(await page.locator('#report-title').innerText(), new RegExp(name));
        assert.doesNotMatch(await page.locator('#report-body').innerText(), /14 nm ENE/);
      }
      console.log(`${touch ? 'touch' : 'mouse'} option switching passed`);

      // An exact name wins over other partial matches, without ArrowDown.
      await search.fill('Montauk');
      assert.equal(await page.getByRole('option').count(), 2, 'Montauk and Montauk Point both match the search');
      await search.press('Enter');
      await page.waitForFunction(() => document.querySelector('#report-kind').textContent === 'Published report', undefined, { timeout: 2500 });
      assert.match(await page.locator('#report-body').innerText(), /Synthetic report for Montauk/);
      assert.equal(requests.at(-1), 'montauk-ny');
      assert.doesNotMatch(await page.locator('#report-body').innerText(), /montauk-point-ny/);

      // Ambiguous text must not silently pick the first location.
      await search.fill('m');
      await search.press('Enter');
      assert.equal(requests.length, 3);
      assert.equal(await page.locator('#report-title').innerText(), 'Choose your destination');
      assert.match(await page.locator('#selection-status').innerText(), /matching results/);
      await search.press('ArrowDown');
      await search.press('Enter');
      await page.waitForFunction(() => document.querySelector('#report-kind').textContent === 'Published report');
      assert.match(await page.locator('#report-body').innerText(), /Synthetic report for Montauk/);

      // A sole partial match works, as does an exact label after Escape.
      await search.fill('ven');
      await search.press('Enter');
      await page.waitForFunction(() => document.querySelector('#report-kind').textContent === 'Published report');
      assert.match(await page.locator('#report-body').innerText(), /Synthetic report for Venice/);
      await search.fill('Montauk, NY');
      await search.press('Escape');
      await search.press('Enter');
      await page.waitForFunction(() => document.querySelector('#report-kind').textContent === 'Published report');
      assert.match(await page.locator('#report-body').innerText(), /Synthetic report for Montauk/);

      await search.fill('Miami');
      await search.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
      assert.equal(requests.length, 6, 'An IME composition commit cannot select a destination');
      await search.press('Enter');
      await page.waitForFunction(() => document.querySelector('#report-sheet').getAttribute('aria-busy') === 'false');
      assert.equal(await page.locator('#report-title').innerText(), 'Miami, FL');
      assert.match(await page.locator('#report-body').innerText(), /Miami, FL/);
      assert.match(await page.locator('#report-notice').innerText(), /No current report has been published for Miami, FL/);
      assert.doesNotMatch(await page.locator('#report-body').innerText(), /Synthetic report|14 nm ENE/);
      missingStatus = 503;
      await page.locator('#refresh-report').click();
      await page.waitForFunction(() => document.querySelector('#report-sheet').getAttribute('aria-busy') === 'false');
      assert.match(await page.locator('#report-notice').innerText(), /report for Miami, FL could not be loaded/);
      assert.match(await page.locator('#report-body').innerText(), /Miami, FL/);
      assert.doesNotMatch(await page.locator('#report-body').innerText(), /Synthetic report|14 nm ENE/);

      // Identical place names are ambiguous even when the typed name is exact.
      // An explicit pointer/touch choice or a complete label disambiguates.
      await search.fill('Newport');
      assert.equal(await page.getByRole('option').count(), 2);
      await search.press('Enter');
      assert.equal(requests.length, 8, 'Duplicate exact names cannot select either destination implicitly');
      assert.equal(await page.locator('#report-title').innerText(), 'Choose your destination');
      assert.match(await page.locator('#selection-status').innerText(), /matching results/);
      const newportOregon = page.getByRole('option', { name: /Newport, OR/ });
      if (touch) await newportOregon.tap(); else await newportOregon.click();
      await page.waitForFunction(() => document.querySelector('#report-kind').textContent === 'Published report');
      assert.equal(requests.at(-1), 'newport-or');
      assert.equal(await page.locator('#report-title').innerText(), 'Newport, OR');
      assert.match(await page.locator('#report-body').innerText(), /newport-or/);
      assert.doesNotMatch(await page.locator('#report-body').innerText(), /newport-ri/);
      await search.fill('Newport, RI');
      await search.press('Enter');
      await page.waitForFunction(() => document.querySelector('#report-kind').textContent === 'Published report');
      assert.equal(requests.at(-1), 'newport-ri');
      assert.equal(await page.locator('#report-title').innerText(), 'Newport, RI');
      assert.match(await page.locator('#report-body').innerText(), /newport-ri/);
      assert.doesNotMatch(await page.locator('#report-body').innerText(), /newport-or/);

      // An upstream international approval cannot expand the U.S. website scope.
      await search.fill('SAN JOSE DEL CABO');
      assert.equal(await page.getByRole('option').count(), 0);
      await search.press('Enter');
      assert.equal(requests.length, 10, 'Out-of-scope locations do not reach the report API');
      assert.equal(await page.locator('#report-title').innerText(), 'Choose your destination');

      // Typing without an accent preserves the catalog's original U.S. label.
      await search.fill('SAN JOSE');
      await search.press('Enter');
      await page.waitForFunction(() => document.querySelector('#report-kind').textContent === 'Published report');
      assert.equal(requests.at(-1), 'san-jose-ca');
      assert.equal(await page.locator('#report-title').innerText(), 'San José, CA');
      assert.match(await page.locator('#report-body').innerText(), /Synthetic report for San José, CA/);
      assert.deepEqual(errors, []);
      assert.deepEqual(requests, ['montauk-ny', 'venice-la', 'montauk-ny', 'montauk-ny', 'venice-la', 'montauk-ny', 'miami-fl', 'miami-fl', 'newport-or', 'newport-ri', 'san-jose-ca']);
      const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(dimensions.scroll <= dimensions.width, 'Destination messages fit the viewport');
      console.log(`${touch ? 'touch' : 'mouse'} Enter, exact-versus-partial matches, duplicate names, accents, composition, and missing/error states passed`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
