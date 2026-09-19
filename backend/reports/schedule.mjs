export const REPORT_TIME_ZONE = 'UTC';
export const DAILY_UTC_START = Date.parse('2026-09-20T04:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const eastern = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});
const partsAt = time => Object.fromEntries(eastern.formatToParts(time).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
const asUTC = parts => Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute || 0, parts.second || 0);

// Resolve the latest local midnight/noon to UTC using IANA timezone data.
// The offset is evaluated at the slot, not borrowed from the current time:
// midnight and noon straddle the spring/fall DST transition on those days.
export function latestPublicationSlot(now) {
  if (!Number.isFinite(now)) throw new Error('invalid-clock');
  // Keep today's Eastern slots. From the approved transition onward, a fixed
  // 04:00 UTC boundary replaces both civil-time slots and ignores DST changes.
  if (now >= DAILY_UTC_START) {
    return DAILY_UTC_START + Math.floor((now - DAILY_UTC_START) / DAY_MS) * DAY_MS;
  }
  const local = partsAt(now);
  const target = { year: local.year, month: local.month, day: local.day, hour: local.hour >= 12 ? 12 : 0, minute: 0, second: 0 };
  const wallTime = asUTC(target);
  let candidate = wallTime;
  for (let step = 0; step < 4; step += 1) {
    const observed = partsAt(candidate);
    const correction = wallTime - asUTC(observed);
    if (correction === 0) return candidate;
    candidate += correction;
  }
  // Midnight/noon are unambiguous in this zone. Fail closed if timezone
  // conversion ever cannot resolve the requested slot.
  throw new Error('invalid-publication-slot');
}
