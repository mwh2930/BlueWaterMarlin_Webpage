export const REPORT_TIME_ZONE = 'America/New_York';
const eastern = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});
const partsAt = time => Object.fromEntries(eastern.formatToParts(time).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
const asUTC = parts => Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute || 0, parts.second || 0);

// Resolve the latest local midnight/noon to UTC using IANA timezone data.
// The offset is evaluated at the slot, not borrowed from the current time:
// midnight and noon straddle the spring/fall DST transition on those days.
export function latestPublicationSlot(now) {
  if (!Number.isFinite(now)) throw new Error('invalid-clock');
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
