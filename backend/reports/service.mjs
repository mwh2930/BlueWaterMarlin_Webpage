import { publicCatalog, publicReport, validDestinationId } from './security.mjs';

export const DEFAULTS = Object.freeze({
  maxReportAgeMs: 36 * 3_600_000, cacheTtlMs: 60_000, negativeCacheTtlMs: 15_000,
  maxCacheEntries: 128, maxInflight: 8, readTimeoutMs: 8_000,
  budgetWindowMs: 60_000, requestsPerWindow: 300, readsPerWindow: 60
});

// Per-process guardrails, not distributed quotas or a DDoS defence.
class Budget {
  constructor(limit, windowMs, now) { Object.assign(this, { limit, windowMs, now }); this.resetAt = 0; this.count = 0; }
  consume() {
    const now = this.now();
    if (now >= this.resetAt) { this.resetAt = now + this.windowMs; this.count = 0; }
    if (this.count >= this.limit) return false;
    this.count += 1;
    return true;
  }
}

export class ReportService {
  constructor({ reports, catalog = [], config = {}, now = Date.now }) {
    this.config = { ...DEFAULTS, ...config };
    this.now = now;
    this.reports = reports;
    this.catalog = publicCatalog(catalog, this.config.privateIdentifiers);
    this.cache = new Map();
    this.inflight = new Map();
    this.requests = new Budget(this.config.requestsPerWindow, this.config.budgetWindowMs, now);
    this.reads = new Budget(this.config.readsPerWindow, this.config.budgetWindowMs, now);
  }
  ready() { return this.config.enabled === true; }
  publicCatalog() { return this.catalog.map(item => ({ ...item, available: this.ready() && item.available })); }
  destination(id) { return validDestinationId(id) ? this.catalog.find(item => item.id === id && item.available) : null; }
  sanitize(raw, destination) { return publicReport(raw, destination, this.now(), this.config.maxReportAgeMs, this.config.privateIdentifiers); }
  remember(id, result) {
    this.cache.delete(id);
    while (this.cache.size >= this.config.maxCacheEntries) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(id, { result, expiresAt: this.now() + (result.status === 200 ? this.config.cacheTtlMs : this.config.negativeCacheTtlMs) });
    return result;
  }
  async report(id) {
    const destination = this.destination(id);
    if (!this.ready() || !destination) return { status: 404 };
    const cached = this.cache.get(id);
    if (cached && cached.expiresAt > this.now()) {
      // A cache TTL must never extend the permitted age of a report.
      if (cached.result.status !== 200 || this.sanitize(cached.result.report, destination)) return structuredClone(cached.result);
    }
    this.cache.delete(id);
    if (this.inflight.has(id)) return structuredClone(await this.inflight.get(id));
    if (this.inflight.size >= this.config.maxInflight || !this.reads.consume()) return { status: 503 };
    const pending = this.load(destination);
    this.inflight.set(id, pending);
    try { return structuredClone(await pending); }
    finally { this.inflight.delete(id); }
  }
  async load(destination) {
    const controller = new AbortController();
    let timer;
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('read-timeout')); }, this.config.readTimeoutMs);
      });
      const raw = await Promise.race([this.reports.read(destination, { signal: controller.signal }), deadline]);
      const report = this.sanitize(raw, destination);
      return this.remember(destination.id, report ? { status: 200, report } : { status: 404 });
    } catch {
      return this.remember(destination.id, { status: 503 });
    } finally { clearTimeout(timer); }
  }
}

export function response(status, jsonBody, extraHeaders = {}) {
  return { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extraHeaders }, jsonBody };
}

export function createHandler(service) {
  return async ({ method, action, destination }) => {
    if (method !== 'GET') return response(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    if (!service.requests.consume()) return response(429, { error: 'Please try again later.' }, { 'Retry-After': String(Math.ceil(service.config.budgetWindowMs / 1000)) });
    if (action === 'catalog') return response(200, { destinations: service.publicCatalog() });
    if (action !== 'report') return response(404, { error: 'Not found.' });
    const result = await service.report(destination);
    if (result.status === 200) return response(200, result.report);
    return result.status === 404
      ? response(404, { error: 'No current report is available for this destination.' })
      : response(503, { error: 'The report is temporarily unavailable.' });
  };
}
