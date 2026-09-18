import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReportService, DEFAULTS } from './service.mjs';
import { publicCatalog, validDestinationId, MAX_REPORT_BYTES } from './security.mjs';

const boundedInteger = (env, key, fallback, min, max) => {
  if (!env[key]) return fallback;
  const value = Number(env[key]);
  if (!/^\d+$/.test(env[key]) || !Number.isSafeInteger(value) || value < min || value > max) throw new Error('invalid-report-configuration');
  return value;
};

export function readConfig(env = process.env) {
  const enabled = env.REPORTS_ENABLED === 'true';
  const approvedIds = (env.REPORTS_APPROVED_DESTINATIONS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (approvedIds.length > 256 || approvedIds.some(id => !validDestinationId(id))) throw new Error('invalid-report-configuration');
  const endpoint = env.REPORTS_BLOB_ENDPOINT || '';
  const containerName = env.REPORTS_CONTAINER || '';
  let accountName = '';
  if (endpoint) {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || parsed.pathname !== '/' || !/^[a-z0-9]{3,24}\.blob\.core\.windows\.net$/.test(parsed.hostname)) throw new Error('invalid-report-configuration');
    accountName = parsed.hostname.split('.')[0];
  }
  if (containerName && (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(containerName) || containerName.includes('--'))) throw new Error('invalid-report-configuration');
  if (enabled && approvedIds.length && (!endpoint || !containerName)) throw new Error('invalid-report-configuration');
  const privateIdentifiers = [...new Set([accountName, containerName, ...(env.REPORTS_PRIVATE_IDENTIFIERS || '').split(',').map(value => value.trim())].filter(Boolean))];
  return {
    ...DEFAULTS, enabled, approvedIds, endpoint, containerName, privateIdentifiers,
    cacheTtlMs: boundedInteger(env, 'REPORTS_CACHE_TTL_SECONDS', 60, 1, 300) * 1000,
    requestsPerWindow: boundedInteger(env, 'REPORTS_REQUESTS_PER_MINUTE', 300, 1, 3000),
    readsPerWindow: boundedInteger(env, 'REPORTS_READS_PER_MINUTE', 60, 1, 300),
    maxInflight: boundedInteger(env, 'REPORTS_MAX_CONCURRENT_READS', 8, 1, 20)
  };
}

// Exported for offline adapter tests. The caller supplies a fixed private
// container client; destination input cannot replace its endpoint or path.
export function blobReportReader(container, approvedIds) {
  const approved = new Set(approvedIds);
  return {
    async read(destination, { signal } = {}) {
      if (!validDestinationId(destination?.id) || !approved.has(destination.id)) return null;
      signal?.throwIfAborted();
      let stream;
      const abort = () => stream?.destroy(new Error('report-read-aborted'));
      try {
        const blob = container.getBlobClient('reports/' + destination.id + '/latest.json');
        const download = await blob.download(0, MAX_REPORT_BYTES + 1, { abortSignal: signal, maxRetryRequests: 0 });
        stream = download.readableStreamBody;
        if (!stream || download.contentLength > MAX_REPORT_BYTES) throw new Error('invalid-report');
        signal?.addEventListener('abort', abort, { once: true });
        signal?.throwIfAborted();
        const chunks = [];
        let size = 0;
        for await (const chunk of stream) {
          signal?.throwIfAborted();
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += bytes.length;
          if (size > MAX_REPORT_BYTES) throw new Error('invalid-report');
          chunks.push(bytes);
        }
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      } catch (error) {
        if (error.statusCode === 404) return null;
        throw new Error('report-read-failed');
      } finally {
        signal?.removeEventListener('abort', abort);
        stream?.destroy();
      }
    }
  };
}

export async function createAzureService(env = process.env) {
  const config = readConfig(env);
  const base = dirname(fileURLToPath(import.meta.url));
  const candidates = JSON.parse(await readFile(env.REPORTS_CATALOG_FILE || resolve(base, '../../data/report-destinations.json'), 'utf8'));
  const catalog = publicCatalog(Array.isArray(candidates) ? candidates : candidates.destinations, config.privateIdentifiers);
  const approved = new Set(config.approvedIds);
  if (config.approvedIds.some(id => !catalog.some(item => item.id === id))) throw new Error('invalid-report-configuration');
  let reports = { async read() { return null; } };
  // Disabled/default operation does not import Azure credentials or contact Blob.
  if (config.enabled && approved.size) {
    const [{ ManagedIdentityCredential }, { BlobServiceClient }] = await Promise.all([import('@azure/identity'), import('@azure/storage-blob')]);
    const credential = new ManagedIdentityCredential(env.AZURE_CLIENT_ID ? { clientId: env.AZURE_CLIENT_ID } : {});
    const container = new BlobServiceClient(config.endpoint, credential, { retryOptions: { maxTries: 1, tryTimeoutInMs: config.readTimeoutMs } }).getContainerClient(config.containerName);
    reports = blobReportReader(container, approved);
  }
  return new ReportService({ config, catalog: catalog.map(item => ({ ...item, available: approved.has(item.id) })), reports });
}
