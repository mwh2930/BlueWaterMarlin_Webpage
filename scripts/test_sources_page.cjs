/* Local-only source-page regression. No provider fetches or cloud mutations. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const origin = new URL(process.env.REPORT_TEST_ORIGIN || 'http://127.0.0.1:8889').origin;
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Use a loopback preview');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
  const errors = [], unexpected = [];
  try {
    for (const width of [320, 390, 1280]) {
      for (const scale of [1, 2]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
          if (new URL(route.request().url()).origin !== origin) {
            unexpected.push(route.request().url()); return route.abort();
          }
          return route.continue();
        });
        await page.goto(origin + '/sources/');
        if (scale === 2) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
        const widthState = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
        assert.ok(widthState.document <= widthState.viewport + 1, `${width}px at ${scale * 100}%: no overflow`);
        assert.match(await page.locator('#report-services').innerText(), /noon and midnight Eastern/);
        assert.match(await page.locator('#report-services').innerText(), /not the time every measurement was taken/);
        assert.match(await page.locator('#source-review').innerText(), /not a verified production report source/i);
        assert.match(await page.locator('#source-review').innerText(), /does not mean it supplies your report/);
        assert.match(await page.locator('#emodnet-title').locator('..').innerText(), /not a weather forecast or a source for the U.S. destination reports/);
        assert.match(await page.locator('#emodnet-title').locator('..').innerText(), /CC BY 4.0/);
        assert.ok(await page.getByRole('link', { name: 'MET licensing', exact: true }).count());
        assert.ok(await page.locator('a[href="https://doi.org/10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa"]').count());
        assert.match(await page.locator('#safety-title').locator('..').innerText(), /BlueWater Marlin is a planning tool, not a navigation system\./);
        assert.equal(await page.locator('.s-motion-toggle').isDisabled(), true);
        assert.equal(await page.locator('.s-motion-toggle').getAttribute('aria-pressed'), 'true');
        for (const figure of await page.locator('svg[role="img"]').all()) {
          assert.ok((await figure.locator('title').textContent()).trim());
          assert.ok((await figure.locator('desc').textContent()).trim());
        }
        const brokenFragments = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')]
          .filter(link => !document.getElementById(link.hash.slice(1))).map(link => link.hash));
        assert.deepEqual(brokenFragments, []);
        await context.close();
        console.log(`Sources: ${width}px at ${scale * 100}% passed`);
      }
    }
    const motion = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
    await motion.goto(origin + '/sources/');
    const toggle = motion.locator('.s-motion-toggle');
    assert.equal(await motion.locator('body').getAttribute('data-motion'), 'running');
    await toggle.focus(); await toggle.press('Space');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(await motion.locator('body').getAttribute('data-motion'), 'paused');
    await toggle.press('Enter');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    await motion.emulateMedia({ reducedMotion: 'reduce' });
    await motion.waitForFunction(() => document.querySelector('.s-motion-toggle').disabled);
    assert.equal(await motion.locator('body').getAttribute('data-motion'), 'paused');
    await motion.close();
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
    const staticPage = await context.newPage();
    await staticPage.goto(origin + '/sources/');
    assert.equal(await staticPage.locator('#report-services').isVisible(), true);
    assert.equal(await staticPage.locator('#source-review').isVisible(), true);
    assert.equal(await staticPage.locator('#emodnet-title').isVisible(), true);
    assert.equal(await staticPage.locator('.s-motion-toggle').isVisible(), false);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    await context.close();
    console.log('Source credits, candidate distinction, keyboard motion control, reduced motion, no-script and local-only assets passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
