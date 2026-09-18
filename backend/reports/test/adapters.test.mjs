import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable, PassThrough } from 'node:stream';
import { readConfig, blobReportReader, createAzureService } from '../azure.mjs';
import { createHandler } from '../service.mjs';
import { MAX_REPORT_BYTES } from '../security.mjs';

const destination = { id: 'test-inlet' };
function adapter(body, options = {}) {
  const calls = [];
  const container = { getBlobClient: path => {
    calls.push(path);
    return { download: async (...args) => {
      calls.push(args);
      if (options.error) throw options.error;
      return { readableStreamBody: options.stream || Readable.from([body]), contentLength: options.contentLength };
    } };
  } };
  return { reader: blobReportReader(container, [destination.id]), calls };
}
test('read-only configuration fails closed by default and has no contact/mail settings', () => {
  const config = readConfig({});
  assert.equal(config.enabled, false);
  assert.deepEqual(config.approvedIds, []);
  assert.deepEqual(config.privateIdentifiers, []);
  assert.equal(config.requestsPerWindow, 300);
  assert.equal(config.readsPerWindow, 60);
  for (const key of ['sender', 'hashKey', 'encryptionKey', 'postalAddress']) assert.equal(Object.hasOwn(config, key), false);
});
test('configuration accepts only a private-account endpoint, plain container and bounded settings', () => {
  const env = { REPORTS_ENABLED: 'true', REPORTS_APPROVED_DESTINATIONS: 'test-inlet', REPORTS_BLOB_ENDPOINT: 'https://privateaccount.blob.core.windows.net', REPORTS_CONTAINER: 'privatecontainer' };
  assert.deepEqual(readConfig(env).privateIdentifiers, ['privateaccount', 'privatecontainer']);
  for (const endpoint of ['http://privateaccount.blob.core.windows.net', 'https://example.org', 'https://user:password@privateaccount.blob.core.windows.net', 'https://privateaccount.blob.core.windows.net/?sig=secret', 'https://privateaccount.blob.core.windows.net/path']) assert.throws(() => readConfig({ ...env, REPORTS_BLOB_ENDPOINT: endpoint }));
  for (const container of ['a', '../reports', '$root', 'two--hyphens', 'UPPERCASE']) assert.throws(() => readConfig({ ...env, REPORTS_CONTAINER: container }));
  for (const value of ['0', '-1', 'Infinity', '1e3', '3001']) assert.throws(() => readConfig({ REPORTS_REQUESTS_PER_MINUTE: value }));
  assert.throws(() => readConfig({ REPORTS_APPROVED_DESTINATIONS: '../escape' }));
  assert.throws(() => readConfig({ REPORTS_ENABLED: 'true', REPORTS_APPROVED_DESTINATIONS: 'test-inlet' }));
});
test('disabled Azure service returns the packaged catalog without a storage connection', async () => {
  const service = await createAzureService({});
  const result = await createHandler(service)({ method: 'GET', action: 'catalog' });
  assert.ok(result.jsonBody.destinations.length > 0);
  assert.ok(result.jsonBody.destinations.every(item => item.available === false));
  assert.deepEqual(Object.keys(result.jsonBody), ['destinations']);
  const disabled = await createAzureService({ REPORTS_ENABLED: 'false', REPORTS_APPROVED_DESTINATIONS: 'islamorada-fl' });
  assert.equal((await disabled.report('islamorada-fl')).status, 404);
});
test('unknown approved destinations fail closed instead of becoming arbitrary Blob paths', async () => {
  await assert.rejects(createAzureService({ REPORTS_APPROVED_DESTINATIONS: 'unknown-location' }), /invalid-report-configuration/);
});
test('Blob reads use one approved fixed path, a bounded range and propagated abort signal', async () => {
  const { reader, calls } = adapter(Buffer.from('{"value":"safe"}'));
  const controller = new AbortController();
  assert.deepEqual(await reader.read(destination, { signal: controller.signal }), { value: 'safe' });
  assert.equal(calls[0], 'reports/test-inlet/latest.json');
  assert.deepEqual(calls[1], [0, MAX_REPORT_BYTES + 1, { abortSignal: controller.signal, maxRetryRequests: 0 }]);
});
test('unapproved or unsafe input cannot acquire a Blob client', async () => {
  const { reader, calls } = adapter(Buffer.from('{}'));
  for (const id of ['unknown', '../private', 'https://private.example', 'test-inlet/latest.json']) assert.equal(await reader.read({ id }), null);
  assert.equal(await reader.read(null), null);
  assert.equal(calls.length, 0);
});
test('size limit checks content length and actual streamed bytes; malformed UTF-8/JSON rejected', async () => {
  for (const [body, options] of [
    [Buffer.from('{}'), { contentLength: MAX_REPORT_BYTES + 1 }],
    [Buffer.alloc(MAX_REPORT_BYTES + 1), {}],
    [Buffer.from([0xff, 0xfe]), {}],
    [Buffer.from('not json'), {}]
  ]) {
    const { reader } = adapter(body, options);
    await assert.rejects(reader.read(destination), error => error.message === 'report-read-failed');
  }
});
test('storage 404 is absence; all other upstream error details are discarded', async () => {
  const missing = adapter(null, { error: { statusCode: 404, message: 'privatecontainer' } });
  assert.equal(await missing.reader.read(destination), null);
  const failed = adapter(null, { error: new Error('privateaccount connection failure') });
  await assert.rejects(failed.reader.read(destination), error => error.message === 'report-read-failed');
});
test('stream abort closes the response and exposes only a generic error', async () => {
  const stream = new PassThrough();
  const controller = new AbortController();
  const { reader } = adapter(null, { stream });
  const pending = reader.read(destination, { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, error => error.message === 'report-read-failed');
  assert.equal(stream.destroyed, true);
});
test('backend manifests register GET routes only and contain no mail, Table or worker dependency', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), ['@azure/functions', '@azure/identity', '@azure/storage-blob']);
  const source = await readFile(new URL('../functions.mjs', import.meta.url), 'utf8');
  assert.match(source, /methods: \['GET'\]/);
  assert.doesNotMatch(source, /app\.(timer|eventGrid)|x-reports-client-ip|POST|token/);
  const settings = JSON.parse(await readFile(new URL('../local.settings.example.json', import.meta.url), 'utf8'));
  assert.equal(settings.Values.REPORTS_ENABLED, 'false');
  assert.equal(settings.Values.REPORTS_APPROVED_DESTINATIONS, '');
  assert.doesNotMatch(Object.keys(settings.Values).join(' '), /MAIL|TABLE|SENDER|HASH_KEY|ENCRYPTION|FEEDBACK|POSTAL/);
});
