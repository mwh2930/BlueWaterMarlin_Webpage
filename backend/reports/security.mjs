import { latestPublicationSlot } from './schedule.mjs';

export const MAX_REPORT_BYTES = 32_768;
const infrastructure = /(?:https?:\/\/|www\.|(?:blob|table|dfs|queue)\.core|[<>]|\x00|[?&](?:sig|sv|se|sp)=)/i;
const controls = /[\x00-\x08\x0b-\x1f\x7f]/;
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export const validDestinationId = value => typeof value === 'string' && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export function cleanText(value, min = 1, max = 240) {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max && !/[\x00-\x1f\x7f<>]/.test(value) ? value.trim() : null;
}
export function containsPrivate(value, identifiers = []) {
  const text = JSON.stringify(value).toLowerCase();
  return identifiers.some(name => typeof name === 'string' && name && text.includes(name.toLowerCase()));
}
export function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value)) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const canonical = new Date(time).toISOString();
  if (canonical.slice(0, 10) !== value.slice(0, 10)) return null;
  if (value.length > 10 && canonical !== (value.length === 20 ? value.replace('Z', '.000Z') : value)) return null;
  return value.length === 10 ? canonical.slice(0, 10) : canonical;
}

// Fail closed. No URLs, redirects, upstream headers or private storage details
// cross the relay, even when a publisher accidentally copies one into text.
export function publicReport(raw, destination, now, maxAgeMs = 36 * 3_600_000, identifiers = []) {
  if (!exactKeys(raw, ['destinationId', 'title', 'reportDate', 'sourceDates', 'radiusNm', 'text', 'status'])) return null;
  if (raw.destinationId !== destination.id || raw.status !== 'available') return null;
  const reportDate = isoDate(raw.reportDate), time = Date.parse(reportDate);
  // Publication needs a timestamp, not an ambiguous date-only claim. Source
  // dates keep their original date/timestamp precision independently below.
  if (!Number.isFinite(now) || !reportDate || reportDate.length === 10 || !Number.isFinite(time) || time > now + 5 * 60_000 || now - time > maxAgeMs || time < latestPublicationSlot(now)) return null;
  const title = cleanText(raw.title, 1, 180);
  const body = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!title || body.length < 20 || body.length > 24_000 || controls.test(body) || infrastructure.test(title + '\n' + body)) return null;
  if (!Number.isFinite(raw.radiusNm) || raw.radiusNm <= 0 || raw.radiusNm > 300) return null;
  if (!Array.isArray(raw.sourceDates) || raw.sourceDates.length < 1 || raw.sourceDates.length > 20) return null;
  if (raw.sourceDates.some(item => !exactKeys(item, ['label', 'date']))) return null;
  const sourceDates = raw.sourceDates.map(item => ({ label: cleanText(item.label, 1, 80), date: isoDate(item.date) }));
  if (sourceDates.some(item => !item.label || !item.date || infrastructure.test(item.label) || Date.parse(item.date) > now + 5 * 60_000)) return null;
  const report = { destinationId: destination.id, title, reportDate, sourceDates, radiusNm: raw.radiusNm, text: body, status: 'available' };
  return Buffer.byteLength(JSON.stringify(report), 'utf8') > MAX_REPORT_BYTES || containsPrivate(report, identifiers) ? null : report;
}

export function publicCatalog(catalog, identifiers = []) {
  if (!Array.isArray(catalog) || catalog.length > 256) throw new Error('invalid-catalog');
  const seen = new Set();
  return catalog.flatMap(item => {
    if (!item || !validDestinationId(item.id) || seen.has(item.id)) return [];
    const name = cleanText(item.name, 1, 120), admin = cleanText(item.admin ?? '', 0, 100);
    if (!name || admin === null || infrastructure.test(name + '\n' + admin)) return [];
    const result = { id: item.id, name, admin, available: item.available === true };
    if (containsPrivate(result, identifiers)) return [];
    seen.add(item.id);
    return [result];
  });
}
