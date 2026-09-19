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

The website/reader release is committed locally as `4653a7b`; the isolated
publisher release is `d5346e911fd145686941befe9731dd4fda63b78d`, based on the
attested deployed `1f57d848be4e82b8ea73e1144679787b6846d858`. All 119 focused
publisher tests and the full release-clean gate passed, with Xcode skipped because
no app code changed. Website validation, all 48 reader tests, ten backend-packaging
tests, six page-generator tests, and the UTC/report/source browser suites passed.
Independent cross-language clock checks agreed at 4,416 instants. The publisher
package changes only four runtime files; the reader package changes only its
schedule module compared with the retained deployed package.

**Not deployed or pushed.** Read-only preflight found an empty renderer queue and
two existing poison messages, which were not consumed or changed. Invocation and
publication evidence support a quiet renderer, but the current operator cannot
read the durable job and lease records. That evidence is not a certified drain:
the shared relay enforces exact release identity on queued/deferred work.
Deployment awaits approval for narrowly scoped read-only inspection, or equivalent
snapshots from an already-authorized operator. No keys were retrieved, permissions
changed, producers paused, queues purged, or hosting resources modified.

The live schedule remains Eastern noon/midnight. Activation of the September 20
04:00 UTC transition and its first actual publication must be verified separately.
An existing chlorophyll-source health failure remains outside this schedule change.
