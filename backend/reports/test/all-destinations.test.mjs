// All source values are synthetic. These tests read the public catalog, use
// one fake output container, and never create Azure credentials or SDK clients.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { readConfig, blobReportReader } from '../azure.mjs';
import { ReportService, createHandler } from '../service.mjs';
import { MAX_REPORT_BYTES, publicCatalog } from '../security.mjs';

const document = JSON.parse(await readFile(new URL('../../../data/report-destinations.json', import.meta.url), 'utf8'));
const staticCatalog = document.destinations;
const ids = staticCatalog.map(place => place.id);
const approval = ids.join(',');
const NOW = Date.parse('2026-09-18T16:30:00Z');
const configuration = () => readConfig({
  REPORTS_ENABLED: 'true', REPORTS_APPROVED_DESTINATIONS: approval,
  REPORTS_BLOB_ENDPOINT: 'https://syntheticaccount.blob.core.windows.net',
  REPORTS_CONTAINER: 'synthetic-output'
});
const fixture = id => ({
  destinationId: id, title: `${id} synthetic report`, reportDate: '2026-09-18T16:00:00.000Z',
  sourceDates: [{ label: 'Synthetic source', date: '2026-09-18T09:00:00.000Z' }],
  radiusNm: 100, text: `Synthetic destination ${id}. A planning tool, not a navigation system.`, status: 'available'
});

function setup({ read = id => fixture(id), enabled = true } = {}) {
  let now = NOW;
  const paths = [], downloads = [];
  // No write, delete, list, container-creation or credential capability exists.
  // Every approved destination shares this exact same container object.
  const container = Object.freeze({ getBlobClient(path) {
    assert.match(path, /^reports\/[a-z0-9]+(?:-[a-z0-9]+)*\/latest\.json$/);
    paths.push(path);
    return Object.freeze({ async download(offset, length, options) {
      downloads.push({ offset, length, options });
      const body = Buffer.from(JSON.stringify(await read(path.split('/')[1])));
      return { readableStreamBody: Readable.from([body]), contentLength: body.length };
    } });
  } });
  const config = { ...configuration(), enabled };
  const approved = new Set(config.approvedIds);
  const catalog = publicCatalog(staticCatalog, config.privateIdentifiers)
    .map(place => ({ ...place, available: approved.has(place.id) }));
  const reader = blobReportReader(container, config.approvedIds);
  const service = new ReportService({ config, catalog, reports: reader, now: () => now });
  return { reader, service, handle: createHandler(service), paths, downloads,
    advance: milliseconds => { now += milliseconds; } };
}
const get = (handle, id) => handle({ method: 'GET', action: 'report', destination: id });

test('the canonical 76-ID approval fits existing bounded configuration without enabling the static catalog', () => {
  assert.equal(staticCatalog.length, 76);
  assert.equal(new Set(ids).size, 76);
  assert.ok(staticCatalog.every(place => place.available === false));
  assert.match(approval, /^[a-z0-9]+(?:-[a-z0-9]+)*(?:,[a-z0-9]+(?:-[a-z0-9]+)*)*$/);
  const config = configuration();
  assert.equal(config.enabled, true);
  assert.deepEqual(config.approvedIds, ids);
  assert.equal(config.approvedIds.join(','), approval);
  assert.equal(config.readsPerWindow, 60, 'Approval does not raise the read budget');
  assert.equal(config.requestsPerWindow, 300);
  assert.throws(() => readConfig({ REPORTS_APPROVED_DESTINATIONS: approval + ',../escape' }), /invalid-report-configuration/);
  assert.throws(() => readConfig({ REPORTS_APPROVED_DESTINATIONS: Array.from({ length: 257 }, (_, i) => `place-${i}`).join(',') }), /invalid-report-configuration/);
});

test('all 76 approved IDs use one fixed output reader and exactly one destination-bound latest path', async () => {
  const { reader, paths, downloads } = setup();
  const controller = new AbortController();
  for (const id of ids) {
    const raw = await reader.read({ id, endpoint: 'https://ignored.invalid', container: 'ignored-input', path: '../ignored' }, { signal: controller.signal });
    assert.deepEqual(raw, fixture(id));
  }
  assert.deepEqual(paths, ids.map(id => `reports/${id}/latest.json`));
  assert.equal(new Set(paths).size, 76);
  assert.equal(downloads.length, 76);
  for (const { offset, length, options } of downloads) {
    assert.equal(offset, 0);
    assert.equal(length, MAX_REPORT_BYTES + 1);
    assert.deepEqual(options, { abortSignal: controller.signal, maxRetryRequests: 0 });
  }
});

test('one enabled relay exposes exactly 76 safe lookup approvals without revealing storage configuration', async () => {
  const { handle, paths } = setup();
  const response = await handle({ method: 'GET', action: 'catalog' });
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.jsonBody), ['destinations']);
  assert.deepEqual(response.jsonBody.destinations, staticCatalog.map(({ id, name, admin }) => ({ id, name, admin, available: true })));
  assert.ok(response.jsonBody.destinations.every(place => Object.keys(place).sort().join(',') === 'admin,available,id,name'));
  assert.doesNotMatch(JSON.stringify(response), /syntheticaccount|synthetic-output|blob\.core|endpoint|container|timeZone|coast/);
  assert.equal(paths.length, 0, 'Catalog does not need any Blob reads');
  const disabled = setup({ enabled: false });
  assert.ok((await disabled.handle({ method: 'GET', action: 'catalog' })).jsonBody.destinations.every(place => place.available === false));
  assert.equal((await get(disabled.handle, ids[0])).status, 404);
  assert.equal(disabled.paths.length, 0);
});

test('all 76 report responses and cached copies remain isolated by destination in the same relay', async () => {
  const { handle, paths, advance, service } = setup();
  for (const [index, id] of ids.entries()) {
    // Keep production defaults intact: the 61st distinct read belongs to the
    // next budget window, rather than increasing quotas for a larger catalog.
    if (index === 60) advance(60_001);
    const first = await get(handle, id);
    assert.equal(first.status, 200, id);
    assert.deepEqual(first.jsonBody, fixture(id));
    first.jsonBody.destinationId = ids[(index + 1) % ids.length];
    first.jsonBody.text = 'Mutated by the response consumer';
    const cached = await get(handle, id);
    assert.equal(cached.status, 200);
    assert.deepEqual(cached.jsonBody, fixture(id));
  }
  assert.deepEqual(paths, ids.map(id => `reports/${id}/latest.json`));
  assert.equal(service.cache.size, 76);
});

test('a report bearing another approved destination ID is rejected for every destination', async () => {
  const { handle, paths, advance } = setup({ read: id => fixture(ids[(ids.indexOf(id) + 1) % ids.length]) });
  for (const [index, id] of ids.entries()) {
    if (index === 60) advance(60_001);
    const result = await get(handle, id);
    assert.equal(result.status, 404, id);
    assert.deepEqual(result.jsonBody, { error: 'No current report is available for this destination.' });
    assert.doesNotMatch(JSON.stringify(result), /Synthetic source|synthetic report|destinationId/);
  }
  assert.deepEqual(paths, ids.map(id => `reports/${id}/latest.json`));
});

test('approving 76 locations preserves the 60-read budget and recovers in the next window', async () => {
  const { handle, paths, advance } = setup();
  for (const id of ids.slice(0, 60)) assert.equal((await get(handle, id)).status, 200);
  assert.equal((await get(handle, ids[60])).status, 503);
  assert.equal(paths.length, 60);
  assert.equal((await get(handle, ids[0])).status, 200, 'An existing fresh cache hit still works');
  assert.equal(paths.length, 60);
  advance(60_001);
  assert.equal((await get(handle, ids[60])).status, 200);
  assert.equal(paths.length, 61);
});

test('all-location approval creates no mutation routes or arbitrary Blob paths', async () => {
  const { reader, handle, paths } = setup();
  for (const id of ids) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const result = await handle({ method, action: 'report', destination: id, body: { path: '../private', text: 'untrusted' } });
      assert.equal(result.status, 405);
      assert.equal(result.headers.Allow, 'GET');
    }
  }
  for (const id of [null, undefined, '', 'unknown-destination', '../private', '%2e%2e%2fprivate', `${ids[0]}/latest.json`,
    `${ids[0]}?container=private`, `${ids[0]}#private`, ids[0].toUpperCase(), 'https://ignored.invalid', 'a'.repeat(81)]) {
    assert.equal(await reader.read({ id }), null);
    assert.equal((await get(handle, id)).status, 404);
  }
  for (const action of ['subscribe', 'request', 'marina', 'confirm', 'unsubscribe', 'operator']) {
    assert.equal((await handle({ method: 'GET', action })).status, 404);
  }
  assert.equal(paths.length, 0);
});
