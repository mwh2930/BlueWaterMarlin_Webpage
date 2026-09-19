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
new destination approvals, service identities, runtime permissions, storage
resources or public write routes are introduced. Temporary operator inspection
access and its expiry are recorded below.

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

The owner approved temporary read-only inspection of operational job and lease
records. Three snapshots from 15:18:28 through 15:25:35 UTC agreed: the renderer
queue was empty, all leases were clear, and all 25 expected current-release jobs
were terminal (23 succeeded, two failed). Two existing poison messages and 12
unfinished jobs fenced by an older release were left untouched. No storage keys
were retrieved, producers paused, queues purged, or historical jobs rewritten.

The publisher ZIP deployment completed successfully at 15:28:25 UTC. Both release
settings and the health response identify `d5346e9`; the first observed timer
invocation at 15:30 UTC succeeded without publishing outside its scheduled window.
The matching reader ZIP deployment completed successfully at 15:32:06 UTC. All
non-release publisher settings, all reader settings, and reader capacity remained
unchanged. A post-publisher check returned correct current reports for Miami,
Venice and San Diego without changing their source dates. Website rollout
accompanies this commit through the existing main-branch validation/deployment
workflow; verify that workflow and the live `20260919-daily-utc` script before
considering the browser rollout complete. Unrelated working-tree drafts are not
part of this release.

The existing resource-group deletion lock prevented removal of the temporary
inspection role. The lock was not changed. Instead, only that role's time
condition was narrowed to expire at 15:00 UTC, confirmed by Azure readback at
15:34:39 UTC. Its expired assignment record remains; all three pre-existing
assignments were preserved. No ongoing inspection access was requested.

The deployed schedule retains September 19's noon Eastern issue and changes to
one daily 04:00 UTC issue on September 20. Its first actual publication remains a
future verification, not an already-observed success. Existing open browser tabs
must reload to adopt the matching freshness boundary. Existing source failures
and intermittent reader latency remain outside this schedule change.
