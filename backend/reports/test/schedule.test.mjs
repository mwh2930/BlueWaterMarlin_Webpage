import test from 'node:test';
import assert from 'node:assert/strict';
import { latestPublicationSlot, REPORT_TIME_ZONE } from '../schedule.mjs';

const slot = value => new Date(latestPublicationSlot(Date.parse(value))).toISOString();
test('latest publication slot follows Eastern midnight and noon boundaries', () => {
  assert.equal(REPORT_TIME_ZONE, 'America/New_York');
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
test('fall-back midnight-to-noon is thirteen hours, including both repeated hours', () => {
  const midnight = latestPublicationSlot(Date.parse('2026-11-01T16:59:59.999Z'));
  const noon = latestPublicationSlot(Date.parse('2026-11-01T17:00:00.000Z'));
  assert.equal(new Date(midnight).toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal(new Date(noon).toISOString(), '2026-11-01T17:00:00.000Z');
  assert.equal(noon - midnight, 13 * 3_600_000);
  assert.equal(slot('2026-11-01T05:30:00.000Z'), '2026-11-01T04:00:00.000Z');
  assert.equal(slot('2026-11-01T06:30:00.000Z'), '2026-11-01T04:00:00.000Z');
});
test('invalid clock values fail closed', () => {
  assert.throws(() => latestPublicationSlot(NaN));
  assert.throws(() => latestPublicationSlot(Infinity));
});
