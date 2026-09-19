import test from 'node:test';
import assert from 'node:assert/strict';
import { latestPublicationSlot, REPORT_TIME_ZONE, DAILY_UTC_START } from '../schedule.mjs';
import { publicReport } from '../security.mjs';
import { ReportService } from '../service.mjs';

const slot = value => new Date(latestPublicationSlot(Date.parse(value))).toISOString();
test('daily UTC schedule has an explicit future effective instant', () => {
  assert.equal(REPORT_TIME_ZONE, 'UTC');
  assert.equal(DAILY_UTC_START, Date.parse('2026-09-20T04:00:00.000Z'));
});
test('historical Eastern midnight/noon boundaries remain unchanged before transition', () => {
  assert.equal(slot('2026-09-17T15:59:59.999Z'), '2026-09-17T04:00:00.000Z');
  assert.equal(slot('2026-09-17T16:00:00.000Z'), '2026-09-17T16:00:00.000Z');
  assert.equal(slot('2026-09-18T03:59:59.999Z'), '2026-09-17T16:00:00.000Z');
  assert.equal(slot('2026-09-18T04:00:00.000Z'), '2026-09-18T04:00:00.000Z');
  assert.equal(slot('2026-01-17T16:59:59.999Z'), '2026-01-17T05:00:00.000Z');
  assert.equal(slot('2026-01-17T17:00:00.000Z'), '2026-01-17T17:00:00.000Z');
});
test('spring-forward midnight-to-noon is eleven hours, with the correct prior offset', () => {
  const midnight = latestPublicationSlot(Date.parse('2026-03-08T15:59:59.999Z'));
  const noon = latestPublicationSlot(Date.parse('2026-03-08T16:00:00.000Z'));
  assert.equal(new Date(midnight).toISOString(), '2026-03-08T05:00:00.000Z');
  assert.equal(new Date(noon).toISOString(), '2026-03-08T16:00:00.000Z');
  assert.equal(noon - midnight, 11 * 3_600_000);
});
test('historical fall-back still resolves thirteen hours and both repeated hours', () => {
  const midnight = latestPublicationSlot(Date.parse('2025-11-02T16:59:59.999Z'));
  const noon = latestPublicationSlot(Date.parse('2025-11-02T17:00:00.000Z'));
  assert.equal(new Date(midnight).toISOString(), '2025-11-02T04:00:00.000Z');
  assert.equal(new Date(noon).toISOString(), '2025-11-02T17:00:00.000Z');
  assert.equal(noon - midnight, 13 * 3_600_000);
  assert.equal(slot('2025-11-02T05:30:00.000Z'), '2025-11-02T04:00:00.000Z');
  assert.equal(slot('2025-11-02T06:30:00.000Z'), '2025-11-02T04:00:00.000Z');
});
test('September 19 noon still publishes and remains current until September 20 at 04:00 UTC', () => {
  for (const [now, expected] of [
    ['2026-09-19T15:59:59.999Z', '2026-09-19T04:00:00.000Z'],
    ['2026-09-19T16:00:00.000Z', '2026-09-19T16:00:00.000Z'],
    ['2026-09-20T00:00:00.000Z', '2026-09-19T16:00:00.000Z'],
    ['2026-09-20T03:59:59.999Z', '2026-09-19T16:00:00.000Z'],
    ['2026-09-20T04:00:00.000Z', '2026-09-20T04:00:00.000Z'],
    ['2026-09-20T16:00:00.000Z', '2026-09-20T04:00:00.000Z'],
    ['2026-09-21T03:59:59.999Z', '2026-09-20T04:00:00.000Z'],
    ['2026-09-21T04:00:00.000Z', '2026-09-21T04:00:00.000Z']
  ]) assert.equal(slot(now), expected, now);
});
test('UTC calendar boundaries, month end, and year end never change the 04:00 slot', () => {
  for (const [now, expected] of [
    ['2026-10-01T00:00:00.000Z', '2026-09-30T04:00:00.000Z'],
    ['2026-10-01T03:59:59.999Z', '2026-09-30T04:00:00.000Z'],
    ['2026-10-01T04:00:00.000Z', '2026-10-01T04:00:00.000Z'],
    ['2027-01-01T00:00:00.000Z', '2026-12-31T04:00:00.000Z'],
    ['2027-01-01T03:59:59.999Z', '2026-12-31T04:00:00.000Z'],
    ['2027-01-01T04:00:00.000Z', '2027-01-01T04:00:00.000Z']
  ]) assert.equal(slot(now), expected, now);
});
test('post-transition fall-back and spring-forward use fixed 24-hour UTC periods', () => {
  for (const [day, checkpoints, next] of [
    ['2026-11-01T04:00:00.000Z', ['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z', '2026-11-01T17:00:00Z', '2026-11-02T03:59:59.999Z'], '2026-11-02T04:00:00.000Z'],
    ['2027-03-14T04:00:00.000Z', ['2027-03-14T06:59:59Z', '2027-03-14T07:00:00Z', '2027-03-14T16:00:00Z', '2027-03-15T03:59:59.999Z'], '2027-03-15T04:00:00.000Z']
  ]) {
    assert.equal(slot(day), day);
    for (const now of checkpoints) assert.equal(slot(now), day, now);
    assert.equal(slot(next), next);
    assert.equal(latestPublicationSlot(Date.parse(next)) - latestPublicationSlot(Date.parse(day)), 24 * 3_600_000);
  }
});

const destination = { id: 'miami-fl', name: 'Miami / Haulover', admin: 'FL', available: true };
const report = reportDate => ({
  destinationId: destination.id, title: 'Miami / Haulover, FL', status: 'available',
  reportDate, radiusNm: 100,
  sourceDates: [{ label: 'Synthetic weather forecast', date: '2026-09-18T09:00:00.000Z' }, { label: 'Synthetic ocean analysis', date: '2026-09-17' }],
  text: 'Synthetic dated report. A planning tool, not a navigation system.'
});
test('reader retains current daily data through noon without changing source ages', () => {
  const raw = report('2026-09-20T04:00:00.000Z');
  for (const now of ['2026-09-20T04:01:00Z', '2026-09-20T16:00:00Z', '2026-09-21T03:59:59.999Z']) {
    const result = publicReport(raw, destination, Date.parse(now));
    assert.deepEqual(result, raw, now);
    assert.deepEqual(result.sourceDates, raw.sourceDates);
  }
});
test('transition and next daily boundary fail closed for earlier-slot reports', () => {
  const previous = report('2026-09-19T16:00:00.000Z');
  assert.deepEqual(publicReport(previous, destination, DAILY_UTC_START - 1), previous);
  assert.equal(publicReport(previous, destination, DAILY_UTC_START), null);
  const current = report('2026-09-20T04:00:00.000Z');
  assert.equal(publicReport(current, destination, Date.parse('2026-09-21T04:00:00Z')), null);
  assert.equal(publicReport(report('2026-09-20'), destination, DAILY_UTC_START), null);
  assert.equal(publicReport(report('2026-09-20T04:05:01.000Z'), destination, DAILY_UTC_START), null);
  assert.equal(publicReport({ ...current, destinationId: 'montauk-ny' }, destination, DAILY_UTC_START), null);
});
test('cached daily data survives noon but is revalidated at the following 04:00 boundary', async () => {
  let now = Date.parse('2026-09-20T04:00:05Z'), reads = 0;
  const raw = report('2026-09-20T04:00:00.000Z');
  const service = new ReportService({
    catalog: [destination], now: () => now,
    config: { enabled: true, cacheTtlMs: 48 * 3_600_000 },
    reports: { async read() { reads += 1; return raw; } }
  });
  assert.equal((await service.report(destination.id)).status, 200);
  now = Date.parse('2026-09-20T16:00:00Z');
  assert.deepEqual((await service.report(destination.id)).report.sourceDates, raw.sourceDates);
  now = Date.parse('2026-09-21T03:59:59.999Z');
  assert.equal((await service.report(destination.id)).status, 200);
  assert.equal(reads, 1, 'A current cached issue is not invalidated by the former noon boundary');
  now = Date.parse('2026-09-21T04:00:00Z');
  assert.equal((await service.report(destination.id)).status, 404);
  assert.equal(reads, 2, 'Cache TTL cannot extend a report beyond its daily period');
});
test('invalid clock values fail closed', () => {
  for (const value of [NaN, Infinity, -Infinity, undefined, null, '2026-09-20T04:00:00Z']) {
    assert.throws(() => latestPublicationSlot(value));
  }
});
