# Report publication transition — September 19, 2026

## Owner request

Publish once daily at **04:00 UTC starting September 20, 2026**. The effective
instant is `2026-09-20T04:00:00.000Z`. September 19's existing noon Eastern slot
remains unchanged. After transition, the interval is fixed at 24 hours and does
not follow daylight saving time. This changes report publication, not a Codex
health-check reminder, and does not alter unrelated upstream acquisition timers.

The publisher, private-Blob reader, and browser must share the transition. Changing
only the publisher would make the old reader/browser reject a daily issue at noon.
The first twenty minutes retain bounded publication batches and browser retries.
Earlier issues are never re-dated or substituted. Source-age bounds and the
36-hour absolute reader cap remain unchanged.

## Current-data diagnostic

The September 19 audit requested all **60 U.S. destination reports** through the
production same-origin API. The initial 13:37–13:41 UTC pass produced 49 valid
200 responses and 11 requests that exceeded a 30-second deadline. One bounded
follow-up per affected destination recovered ten; Pensacola timed out again.
A final independent mobile Chrome check returned Pensacola's current report and
verified that the HTML text matched the API text exactly, with no JavaScript
errors or horizontal overflow.

Together these checks verified all 60 destination IDs and current issues dated
September 19, 04:00–04:15 UTC. This establishes eventual availability, **not
reliable delivery latency**. The timeout cause is not established by this audit.
The source dates remain September 16 at 09:00 UTC for NASA JPL MUR and September 19
at 01:17 UTC for MET Norway. Chlorophyll, currents, sargassum and waves remain
explicitly unavailable. No missing measurements were invented or re-dated.

## Packaging boundary

The website exposes 60 U.S. destinations. The existing shared reader and publisher
still approve 76 server destinations. A dedicated, sanitized, disabled-by-default
backend catalog preserves those existing IDs while the public catalog stays
unchanged. The nine-file Functions ZIP retains its original archive paths. No
new approvals, identities, permissions, storage resources or public write routes
are introduced.

## Release status

Schedule-only changes are being tested in isolated release directories. Deployment
and the first September 20 publication must be verified separately; passing local
tests does not establish either event.
