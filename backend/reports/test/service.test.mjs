import test from 'node:test';
import assert from 'node:assert/strict';
import { ReportService, createHandler } from '../service.mjs';
import { publicReport, publicCatalog, isoDate } from '../security.mjs';

const NOW = Date.parse('2026-09-17T12:00:00.000Z');
const destination = { id: 'test-inlet', name: 'Test Inlet', admin: 'NC', available: true };
const fixture = (id = destination.id) => ({
  destinationId: id, title: 'Test Inlet report', reportDate: '2026-09-17T11:00:00.000Z',
  sourceDates: [{ label: 'Published analysis', date: '2026-09-16' }], radiusNm: 100,
  text: 'Satellite data suggests possible sargassum in the general area. This is not a confirmed weed line.',
  status: 'available'
});
function setup(options = {}) {
  let calls = 0, now = options.now ?? NOW;
  const service = new ReportService({
    catalog: options.catalog || [destination],
    reports: { read: async (...args) => { calls += 1; return options.read ? options.read(...args) : fixture(args[0].id); } },
    now: () => now, config: { enabled: true, ...options.config }
  });
  return { service, handle: createHandler(service), calls: () => calls, advance: amount => { now += amount; } };
}
const get = (handle, id = destination.id) => handle({ method: 'GET', action: 'report', destination: id });

test('disabled relay lists candidates unavailable and never reads storage', async () => {
  const { handle, calls } = setup({ config: { enabled: false } });
  const catalog = await handle({ method: 'GET', action: 'catalog' });
  assert.deepEqual(catalog.jsonBody, { destinations: [{ ...destination, available: false }] });
  assert.equal((await get(handle)).status, 404);
  assert.equal(calls(), 0);
});
test('only GET catalog and report exist; former write actions cannot read or save', async () => {
  const { handle, calls } = setup();
  for (const action of ['subscribe', 'request', 'marina', 'confirm', 'unsubscribe', 'operator']) {
    assert.equal((await handle({ method: 'GET', action })).status, 404);
    assert.equal((await handle({ method: 'POST', action, body: '{\"email\":\"not-collected\"}' })).status, 405);
  }
  for (const method of ['PUT', 'PATCH', 'DELETE', 'HEAD']) assert.equal((await handle({ method, action: 'report' })).status, 405);
  assert.equal(calls(), 0);
});
test('unknown, unapproved and path-like IDs cannot reach Blob', async () => {
  const { handle, calls } = setup({ catalog: [destination, { ...destination, id: 'not-approved', available: false }] });
  for (const id of [undefined, null, '', '../private', '%2e%2e', 'https://example.org', 'test-inlet/latest.json', 'TEST-INLET', 'unknown', 'not-approved', 'a'.repeat(81)]) assert.equal((await handle({ method: 'GET', action: 'report', destination: id })).status, 404);
  assert.equal(calls(), 0);
});
test('valid report retains exact published text, source dates and measured radius', async () => {
  const { handle, calls } = setup();
  const result = await get(handle);
  assert.equal(result.status, 200);
  assert.deepEqual(result.jsonBody, fixture());
  assert.equal(calls(), 1);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(result.headers['Referrer-Policy'], 'no-referrer');
});
test('fresh memory cache avoids reads, expires, and cannot be mutated by a response consumer', async () => {
  const { handle, calls, advance } = setup();
  const first = await get(handle);
  first.jsonBody.text = 'changed by caller';
  assert.deepEqual((await get(handle)).jsonBody, fixture());
  assert.equal(calls(), 1);
  advance(60_001);
  assert.equal((await get(handle)).status, 200);
  assert.equal(calls(), 2);
});
test('report freshness is checked on cache hits, never extended by cache TTL', async () => {
  const raw = fixture(); raw.reportDate = new Date(NOW - 999).toISOString();
  const { handle, advance, calls } = setup({ read: async () => raw, config: { maxReportAgeMs: 1000 } });
  assert.equal((await get(handle)).status, 200);
  advance(1001);
  assert.equal((await get(handle)).status, 404);
  assert.equal(calls(), 2);
});
test('simultaneous callers for one destination share one upstream read', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const { handle, calls } = setup({ read: () => pending });
  const requests = Array.from({ length: 20 }, () => get(handle));
  assert.equal(calls(), 1);
  resolve(fixture());
  const results = await Promise.all(requests);
  assert.ok(results.every(result => result.status === 200));
  assert.equal(calls(), 1);
});
test('negative cache is short and prevents retry storms for absent reports', async () => {
  const { handle, calls, advance } = setup({ read: async () => null });
  assert.equal((await get(handle)).status, 404);
  assert.equal((await get(handle)).status, 404);
  assert.equal(calls(), 1);
  advance(15_001);
  assert.equal((await get(handle)).status, 404);
  assert.equal(calls(), 2);
});
test('upstream errors are generic and briefly cached without their private message', async () => {
  const { handle, calls } = setup({ read: async () => { throw new Error('privateaccount.blob.core.windows.net/privatecontainer'); } });
  const result = await get(handle);
  assert.equal(result.status, 503);
  assert.equal(JSON.stringify(result).includes('privateaccount'), false);
  assert.equal((await get(handle)).status, 503);
  assert.equal(calls(), 1);
});
test('a hung read is aborted and inflight capacity is released', async () => {
  let signal;
  const { handle, service } = setup({ config: { readTimeoutMs: 10 }, read: (_destination, options) => { signal = options.signal; return new Promise(() => {}); } });
  assert.equal((await get(handle)).status, 503);
  assert.equal(signal.aborted, true);
  assert.equal(service.inflight.size, 0);
});
test('per-instance request budget includes cache/catalog hits and ignores supplied IPs', async () => {
  const { handle, advance, calls } = setup({ config: { requestsPerWindow: 2 } });
  assert.equal((await handle({ method: 'GET', action: 'catalog', ip: 'first' })).status, 200);
  assert.equal((await get(handle)).status, 200);
  const limited = await handle({ method: 'GET', action: 'catalog', ip: 'another-spoofed-address' });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['Retry-After'], '60');
  assert.equal(calls(), 1);
  advance(60_001);
  assert.equal((await get(handle)).status, 200);
});
test('upstream-read budget is separate and existing cached reports remain available', async () => {
  const other = { ...destination, id: 'other-inlet' };
  const { handle, calls, advance } = setup({ catalog: [destination, other], config: { readsPerWindow: 1 } });
  assert.equal((await get(handle)).status, 200);
  assert.equal((await get(handle, other.id)).status, 503);
  assert.equal((await get(handle)).status, 200);
  assert.equal(calls(), 1);
  advance(60_001);
  assert.equal((await get(handle, other.id)).status, 200);
});
test('inflight reads and cached entries have fixed size bounds', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const other = { ...destination, id: 'other-inlet' };
  const { service, handle, calls } = setup({ catalog: [destination, other], config: { maxInflight: 1, maxCacheEntries: 1 }, read: item => item.id === destination.id ? pending : fixture(item.id) });
  const first = get(handle);
  assert.equal((await get(handle, other.id)).status, 503);
  assert.equal(calls(), 1);
  resolve(fixture());
  await first;
  assert.equal((await get(handle, other.id)).status, 200);
  assert.equal(service.cache.size, 1);
});
test('disabled operation cannot leak a previously cached report', async () => {
  const { handle, service, calls } = setup();
  assert.equal((await get(handle)).status, 200);
  service.config.enabled = false;
  assert.equal((await get(handle)).status, 404);
  assert.equal(calls(), 1);
});
test('strict report validation rejects stale, future, malformed and extra fields', () => {
  const variants = [
    null, {}, [], { ...fixture(), destinationId: 'wrong-inlet' }, { ...fixture(), status: 'error' },
    { ...fixture(), reportDate: '2026-09-01' }, { ...fixture(), reportDate: '2026-09-18' }, { ...fixture(), reportDate: '2026-09-17' },
    { ...fixture(), reportDate: '2026-09-17 https://private.example' }, { ...fixture(), radiusNm: '100' },
    { ...fixture(), radiusNm: 301 }, { ...fixture(), text: 'short' }, { ...fixture(), text: 'a'.repeat(24001) },
    { ...fixture(), sourceDates: [null] }, { ...fixture(), sourceDates: [] }, { ...fixture(), sourceDates: [{}] },
    { ...fixture(), sourceDates: [{ label: 'Analysis', date: '2026-09-18' }] },
    { ...fixture(), sourceDates: [{ label: 'Analysis', date: '2026-09-16', privatePath: 'secret' }] },
    { ...fixture(), privatePath: 'secret' }
  ];
  for (const raw of variants) assert.equal(publicReport(raw, destination, NOW), null);
});
test('crossing an Eastern publication slot rejects cached earlier-slot data', async () => {
  const { handle, advance, calls } = setup({ now: Date.parse('2026-09-17T15:59:59.000Z') });
  const before = await get(handle);
  assert.equal(before.status, 200);
  assert.deepEqual(before.jsonBody.sourceDates, fixture().sourceDates);
  advance(1000);
  assert.equal((await get(handle)).status, 404);
  assert.equal(calls(), 2);
});
test('new-slot reports retain their source ages rather than inheriting publication time', async () => {
  const raw = { ...fixture(), reportDate: '2026-09-17T16:00:00.000Z' };
  const { handle } = setup({ now: Date.parse('2026-09-17T16:00:05.000Z'), read: async () => raw });
  assert.deepEqual((await get(handle)).jsonBody.sourceDates, raw.sourceDates);
  assert.deepEqual((await get(handle)).jsonBody.sourceDates, raw.sourceDates);
});
test('report text, titles, source labels and all configured private identifiers are protected', () => {
  for (const value of ['https://private.example/path', 'www.private.example', 'account.blob.core.windows.net', '<img src=x>', '?sig=secret', 'PRIVATECONTAINER', 'privateaccount']) {
    for (const location of ['text', 'title', 'label']) {
      const raw = fixture();
      if (location === 'label') raw.sourceDates[0].label = value;
      else raw[location] = value + ' data in the general area';
      assert.equal(publicReport(raw, destination, NOW, undefined, ['privatecontainer', 'privateaccount']), null);
    }
  }
});
test('UTF-8 byte bounds, invalid controls and canonical dates reject ambiguous data', () => {
  assert.equal(publicReport({ ...fixture(), text: '海'.repeat(12000) }, destination, NOW), null);
  assert.equal(publicReport({ ...fixture(), text: fixture().text + '\u001b[0m' }, destination, NOW), null);
  for (const date of ['2026-02-30', '2026-09-17T24:00:00Z', '2026-09-17 (secret)', '2026-09-17T11:00:00+00:00']) assert.equal(isoDate(date), null);
  assert.equal(isoDate('2026-09-17T11:00:00Z'), '2026-09-17T11:00:00.000Z');
  assert.equal(isoDate('2026-09-17'), '2026-09-17');
});
test('catalog strips extras and filters malformed, duplicate and private entries', () => {
  const candidates = [destination, null, destination, { ...destination, id: '../x' }, { ...destination, id: 'bad-name', name: 'https://private.example' }, { ...destination, id: 'private', admin: 'privatecontainer' }];
  assert.deepEqual(publicCatalog(candidates, ['privatecontainer']), [destination]);
  assert.deepEqual(publicCatalog([{ ...destination, internalPath: 'not-public' }]), [destination]);
  assert.throws(() => publicCatalog(Array(257).fill(destination)));
});
