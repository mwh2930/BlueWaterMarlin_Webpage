/* Local-only rendering checks. Synthetic report inputs never reach production. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const out=process.env.VISUAL_EVIDENCE||'/private/tmp/bwm-precision-evidence';fs.mkdirSync(out,{recursive:true});
const report={destinationId:'miami-fl',title:'Miami, FL',status:'available',reportDate:'2026-09-18T16:10:00Z',radiusNm:100,sourceDates:[{label:'Synthetic SST observation',date:'2026-09-18T08:00:00Z'},{label:'Synthetic CHL analysis — interpolated product',date:'2026-09-17T00:00:00Z'}],text:'SYNTHETIC VISUAL TEST — NOT FOR NAVIGATION\n\nSEA SURFACE TEMPERATURE\n\nTemperature: 28.4 °C. Approximate area: 24 nm east.\n\nCHLOROPHYLL\n\nChlorophyll-a: 0.23 mg/m³. Gap-filled analysis; not a direct observation at every pixel.\n\nCURRENTS / EDDIES / SARGASSUM\n\nUnavailable. Missing observations are not zero values.\n\nA planning tool, not a navigation system.'};
(async()=>{const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});const results=[];
try{for(const [version,origin] of [['before',process.env.BEFORE_ORIGIN||'http://127.0.0.1:8897'],['after',process.env.REPORT_TEST_ORIGIN||'http://127.0.0.1:8898']]){
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
for(const width of [390,820,1440]){const ctx=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});const page=await ctx.newPage();let mode='published';const errors=[];page.on('pageerror',e=>errors.push(e.message));
await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){if(u.hostname==='unpkg.com' && route.request().resourceType()==='script')return route.continue();return route.abort();}if(u.pathname==='/api/reports/catalog')return route.fulfill({json:{destinations:[{id:'miami-fl',name:'Miami',admin:'FL',available:true}]}});if(u.pathname==='/api/reports/report')return mode==='published'?route.fulfill({json:report}):route.fulfill({status:mode==='scheduled'?404:503,json:{error:'Synthetic unavailable response'}});return route.continue();});
await page.clock.install({time:new Date('2026-09-18T17:30:00Z')});
await page.goto(origin+'/report/');await page.waitForFunction(()=>!document.getElementById('destination-search').disabled);
await page.screenshot({path:path.join(out,`${version}-${width}-picker.png`),fullPage:true});
const input=page.locator('#destination-search');await input.fill('Miami');await input.press('ArrowDown');await input.press('Enter');await page.waitForFunction(()=>document.getElementById('report-kind').textContent==='Published report');
assert.equal(await page.locator('.report-text').textContent(),report.text,'Scientific text must be byte-for-byte unchanged');
assert.match(await page.locator('.source-dates').textContent(),/2026-09-17T00:00:00Z/);
await page.screenshot({path:path.join(out,`${version}-${width}-published.png`),fullPage:true});
async function check(label){const dims=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dims.scroll<=dims.width+1,`${version} ${width} ${label} overflow ${JSON.stringify(dims)}`);results.push({version,width,state:label,overflow:false});}
await check('published');
await page.evaluate(()=>document.documentElement.style.fontSize='200%');await check('200-percent-text');await page.screenshot({path:path.join(out,`${version}-${width}-text200.png`),fullPage:true});await page.evaluate(()=>document.documentElement.style.fontSize='');
mode='unavailable';await page.locator('#refresh-report').click();await page.waitForFunction(()=>document.getElementById('report-sheet').getAttribute('aria-busy')==='false');assert.equal(await page.locator('.report-text').count(),0);await check('unavailable');await page.screenshot({path:path.join(out,`${version}-${width}-unavailable.png`),fullPage:true});
mode='scheduled';await page.clock.setFixedTime(new Date('2026-09-18T04:05:00Z'));await page.locator('#refresh-report').click();await page.waitForFunction(()=>document.getElementById('report-kind').textContent==='Scheduled update window');await check('scheduled');await page.screenshot({path:path.join(out,`${version}-${width}-scheduled.png`),fullPage:true});
await page.goto(origin+'/');await page.screenshot({path:path.join(out,`${version}-${width}-home.png`),fullPage:true});await check('home');
if(version==='after'){assert.equal(await page.locator('.site-nav').evaluate(e=>getComputedStyle(e).backdropFilter),'none');assert.equal(await page.locator('.hero-title').evaluate(e=>getComputedStyle(e).filter),'none');}
assert.deepEqual(errors,[]);await ctx.close();}}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(`PASS ${results.length} responsive/state checks; text and provenance preserved; screenshots at ${out}`);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
