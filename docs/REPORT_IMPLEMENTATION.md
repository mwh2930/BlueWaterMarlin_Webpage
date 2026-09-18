# Website-only reports — September 18, 2026

## U.S. destination-navigation update

The owner approved expansion to all 60 reviewed U.S. destinations in the current
format, followed by a report-only Git push and deployment. The hub starts with
destination selection; its historical example opens only on request. A grouped
Atlantic/Gulf/Pacific directory links to all 60 generated location pages.

Each route binds its page title, canonical URL and reader to the same approved ID.
A conflicting query cannot load another location. Switching from a location page
navigates to the next route. Existing U.S. hub query links continue working.
The static catalog is the reviewed scope; the live catalog supplies availability
without adding international destinations. The 16 international upstream jobs
and reports are not deleted or modified. No data-provider integration is included.

The shared builder is offline and deterministic. Static validation checks all 68
public pages and generation drift. Known destination paths permanently redirect
to their trailing-slash canonical before the report wildcard header rule.

During the first 20 minutes after noon or midnight Eastern, a 404 for an enabled
destination is labeled Scheduled update window with conditional wording. It does
not claim a running publisher or a guaranteed report. The existing bounded retries
remain at :05/:10/:15/:20; 503 failures remain distinct. Neither state substitutes
the historical example or re-dates old observations.

The decorative illustration caption is screen-reader-only. All source dates and
navigation limitations remain intact. Other staged homepage/source-copy drafts
must remain excluded from this release.

The preceding 76-location publication history below describes the deployed
upstream system, not the new 60-location public navigation scope.

## Scope

The report service is a read-only relay between private Azure Blob storage and the
website. It does not generate reports, collect contacts or send email. The September
13 signup, delivery and marina-application design has been superseded. No visitor
account or subscriber database is needed. The owner has approved deployment and
Git push. The backend connection and first Oregon Inlet forecast report are verified.
The report website is pushed and deployed. All 76 listed locations now use the
same reader and deployed publisher, with no per-location resources. An
owner-authorized, bounded initial publication window produced 75 new reports;
Oregon Inlet's existing midnight issue was preserved. All 76 outputs have been
verified through the public route, including bounded follow-up checks after
timeouts. Intermittent browser delivery delays remain unresolved. Approval and
successful publication do not establish complete source coverage or future
availability.

## Website

- The homepage **Free Report** button and footer **Report** link open `/report/`.
- The **B.I.L.L. Offshore Report** hero has a centered destination selector and a
  static, labeled contour illustration. The illustration is not live data.
- Explicit destination confirmation reveals and focuses the selected report
  heading; **View report** returns there without a new request. Loading, ready and
  failure states appear beside the selector. Automatic URL/catalog application,
  delayed responses and scheduled refreshes do not move focus or scroll. This
  corrects a verified below-fold readout problem, not the separate delivery delays.
- A searchable, keyboard-accessible destination picker requests report data only
  through the website's `/api/reports/` routes. Static candidates are not coverage
  claims and do not establish report availability. Before the live catalog arrives,
  options say **Checking report connection**. A failed connection is distinguished
  from a verified missing report and offers **Retry connection** for the selected
  destination. Retries are explicit, coalesced and bounded by a 30-second browser
  deadline, with no automatic catalog polling. Recovery respects the current
  destination or the user's choice to return to the historical example.
- Location, area, report date and source dates remain visible. Measurements and
  approximate locations are preserved. Sargassum indications are described as a
  possible general area, not a confirmed weed line. Missing data is not a negative
  detection.
- Copy states source-backed facts and limits. It does not promote education, invent
  source types, add unsupported conclusions, promise fish or turn an analysis into
  an observation. A report's schema checks do not independently verify its science.
- The supplied Oregon Inlet example remains explicitly historical (September 2,
  2026). It is not a current weather report and is never substituted for a selected
  destination. The report reader does not reinterpret the example as a verified
  current observation.
- The page has no contact forms, account controls, subscription tokens, persistent
  browser storage or email delivery. Old email-action links cannot perform a write.
- The report-specific privacy notice describes destination requests and ordinary
  hosting records. Existing app privacy, data age and navigation wording remain
  unchanged.
- A visible page with an approved destination selected rechecks at Eastern noon
  and midnight. Missing reports receive bounded retries at five-minute checkpoints
  through the first twenty minutes of the slot. A hidden tab pauses its timer and
  checks again on return; manual refresh remains available. No browser refresh
  generates data or makes an older report current.

## Relay

The Function supports a destination catalog and one report at a time. Its managed
identity reads a fixed, approved report key. No arbitrary Blob paths or URLs come
from the browser. The response contains only public report fields; credentials,
storage names, SAS links, upstream headers and technical errors stay server-side.

The source report must contain destination ID, title, report date, source dates,
radius, plain text and availability status. The relay enforces shape, size, freshness
and approved destination checks. It must also reject private identifiers in any
public field. The relay does not change report dates to make stale data appear new.
The report publication date must include a full UTC timestamp and fall within the
latest midnight/noon Eastern publication period. Earlier-period reports are
unavailable even if previously cached; source dates retain their original precision.

Bounded short-lived memory caching and request/read budgets reduce repeat storage
reads. They are per-instance limits, not fleet-wide quotas or protection against all
denial-of-service costs. No IP or contact record is required. Logging configuration
still needs review at the hosting and routing layers.

## Publication pipeline and pilot verification

The confirmed publication cadence is **12:00 a.m. and 12:00 p.m. every day in
America/New_York (Eastern Time), following daylight saving time**.
This schedule belongs to the upstream report
publisher, not an email worker or a browser reload. The relay remains read-only.
Each run must preserve actual input source timestamps and distinguish generation
time from observation/analysis time. If no valid new report is published, do not
re-date an old report or advertise the update as completed. Cache freshness alone
does not prove that the upstream publisher ran.

The owner confirmed **raw weather/ocean data** and approved a destination-area
numeric export in the upstream app/relay repository on September 17. Existing
regional station samples and PNGs are not a substitute for destination coverage.
The upstream `azure/relay/REPORTS.md` documents the new opt-in exporter, deterministic
composer and Eastern-time scheduler. Existing ocean fetches supply bounded numeric
subsets; the approved point's weather forecast is normalized through the existing
MET cache. Nothing is inferred from rendered colours or distant stations.

The owner approved Oregon Inlet as the first verification destination. The upstream
exporter and publisher are deployed and the publisher timer is indexed. The reader
initially approved Oregon Inlet only; the owner subsequently approved the reviewed
76-location catalog through the same relay. Oregon's first scheduled report returned HTTP 200, with
publication time `2026-09-18T04:00:02.000Z` and separate MET forecast update time
`2026-09-18T01:17:53.000Z`. Wind and sea-level pressure forecasts were present;
SST, chlorophyll, currents, sargassum and waves were explicitly unavailable.
This verifies one scheduled issue, not ongoing success or ocean coverage. The schedule resolves
IANA Eastern civil time rather than a fixed UTC offset. A short retry window and atomic writes protect against
duplicate/late publication; an outage can still leave a report unavailable.

### One-time initial publication — September 18, 2026

The owner authorized an initial build from **08:40 to 09:00 Eastern
(`2026-09-18T12:40:00Z` through, but not including, `2026-09-18T13:00:00Z`)**.
The existing publisher admits four five-minute phases within this fixed window.
The server-only `REPORT_INITIAL_PUBLICATION_AT` setting is an exact UTC start,
aligned to five minutes, and cannot overlap a regular publication window or cross
the next Eastern civil slot. It adds no public write endpoint, resource or
permission. Invalid or expired settings admit no initial work; normal noon and
midnight Eastern publication remains unchanged.

Initial work uses a separate private progress record with the same maximum of
24 claims per phase and per invocation, four-minute cooperative invocation budget,
weather backoff, source-age checks and conditional-write ownership checks. Output
freshness still uses the actual Eastern civil period. Publication and source dates
remain real, distinct clocks; a current-period report such as Oregon Inlet's is
not overwritten or re-dated by the initial run. The regular noon run can replace
an initial issue with a new, correctly dated report.

During phases 0–2, actual sampled reports were verified for Stuart / St. Lucie
Inlet, Magdalena Bay, Exmouth, Montauk, Ocean City, Savannah / Tybee, Wrightsville
Beach, Los Barriles / East Cape, Miami, Venice and Morro Bay. The checked reports
included dated SST and current analyses; Venice's chlorophyll retained its
September 14 source date, and forecast sources retained September 18 dates. These
are sample readbacks, not an assertion that every listed source was available at
every destination or that all 76 outputs succeeded. They also do not establish
complete area coverage or repair the existing stale ocean-pipeline heartbeat.

The fixed initial eligibility window expired at 09:00 Eastern. The temporary
operator setting was removed at `2026-09-18T13:00:30.983Z` after checking its exact
value and the deployed release. Readback confirmed that the exporter and publisher
remain enabled, the release is unchanged, and the monitored five-minute timer is
registered with startup execution disabled. Normal noon/midnight eligibility is
unchanged.

The full-catalog audit checked all 76 IDs at a paced maximum of 24 starts per
minute. The first pass returned 58 valid reports and 18 request timeouts at its
15-second deadline, with no 404 responses. A single Chrome follow-up per affected
destination returned 17 valid reports within its 30-second deadline; Portland
timed out. One subsequent independent Portland lookup returned a valid report in
6.1 seconds. Together these checks verified exactly the 76 approved IDs, their
seven-field public contracts and original source dates: 75 issues published during
the initial window and Oregon's unchanged midnight issue. No synthetic report was
published and no historical example was substituted.

This is eventual availability verification, not a clean reliability result.
Chrome responses ranged from 123 milliseconds to 25.9 seconds and one exceeded
30 seconds. The existing aggregate resource metrics cannot correlate those delays
with individual requests or establish their cause. No additional telemetry,
capacity, permission or resource was enabled. Intermittent browser delivery delays
and the stale ocean-pipeline heartbeat remain separate open operational issues.

Generated reports describe sampled ranges and explicit forecast points, not complete
area coverage. Missing cells remain missing. Analysis is not labeled as observation.
Sargassum, waves and pressure trends remain unavailable until appropriate verified
numeric inputs exist. A report's new publication time does not make its source data
new: separate provider times are retained. The historical example is not the
composer's specification for generating fronts, weed detections or area averages.

1. Verify subsequent publication periods beyond this completed initial-output
   audit, including source timestamps and destination coverage. The existing upstream relay
   health check still reports a stale heartbeat; the independently indexed report
   publisher is not evidence that current ocean inputs are available. Do not expose
   storage identifiers or request storage account keys.
2. The first real report conforms to the upstream composer's seven-field JSON contract. The legacy marketing folder
   contains older text/HTML examples and must not be treated as a verified current
   JSON publisher. Unverified sargassum sources remain disabled.
3. Test approved destinations: correct source dates, report content, unavailable
   and stale states, cache freshness, rejection of writes, bounded reads, sanitized
   failures and mobile rendering. Check the publisher's data provenance separately
   from the relay's technical validation.
4. The owner approved adding all 76 listed locations. Their supplied coordinates
   match the public catalog; four legacy region assignments fit the existing
   Cabo–Cortez region instead. No coordinate was invented or region widened.
   The bounded publisher and all 76 lookup approvals are deployed. The expansion
   originally completed after the midnight window; the owner subsequently approved
   the bounded initial window described above instead of waiting for noon. A
   private progress ledger for each mode admits at most 24 claims per five-minute
   phase, prioritizes untouched locations, and
   preserves original source dates. Provider or storage failures can leave
   locations unavailable. Local tests,
   deployed code, a working private-storage connection and timer registration do
   not establish successful scheduled publication.

### Azure deployment and connection — September 17, 2026

At the owner's request, the active upstream Function now has a system-assigned
managed identity with Storage Blob Data Contributor scoped to two dedicated report
containers only. A separate user-assigned reader identity has Storage Blob Data
Reader scoped only to the finished-report container. Both new containers explicitly
deny anonymous access. Their names, account identifiers and identity IDs are not
included in the public artifact or these integration notes.

The assignments and container access settings were read back from Azure. Existing
app containers, their access settings, storage credentials and shared permissions
were not changed. The reader identity is now attached to the isolated deployed
report backend. Both a private missing-object read and the first scheduled forecast
report were verified through the same-origin route. No data was supplied from a test fixture.

A separate host-storage identity has only three container-scoped assignments:
Storage Blob Data Owner on dedicated host-metadata and host-secrets containers,
and Storage Blob Data Contributor on the deployment-package container. It has no
account-wide role. Dedicated host storage rejects shared-key and anonymous access.
The reader runs Node 22 with 512 MiB, a maximum of one instance, HTTP concurrency
four and no always-ready instances. FTP and SCM basic publishing authentication
are disabled. These limits are not a guarantee of zero hosting costs.

Azure initially reported the website on Free and rejected an external-backend link.
The owner then explicitly approved the Standard upgrade at a US$9/month base price
plus applicable usage and separate backend costs. The upgrade is now applied and
read back as Standard. The separate reader and upstream publisher deployments
have since succeeded. The reader indexes exactly two GET routes. Native
same-origin integration returns the catalog with HTTP 200; direct backend access
returns 401 with platform authentication required. Unapproved or arbitrary report
IDs return a generic 404 without exposing private identifiers. All 76 reviewed
locations are now approved. Missing or stale reports return 404 rather
than substitute a historical example.

The first midnight publication and report-only Git push are complete. Website
commit `6941e96` passed its validation and Azure deployment workflow; upstream
commit `3761060` established the pilot. The all-location publisher was first deployed from
clean-gated `2dcbde8`, pushed on `release/all-destination-reports-20260917` to preserve
other app work. Its 95 focused report tests, complete relay suite, app compatibility
tests and release build passed. Azure reported that release identity at verification. The
existing ocean pipeline heartbeat remains stale; this deployment does not claim
to repair it.

The current publisher, including initial-window support, is deployed from
`1f57d848be4e82b8ea73e1144679787b6846d858` on
`release/initial-destination-reports-20260918`. Its 111 focused report tests and
full release-clean gate passed. Xcode checks were skipped because this release
contains no app changes. The new tests include all 76 destinations through four
fake-storage phases, preservation of Oregon's existing report, exact expiry,
separate progress records and replacement of an initial issue by the next regular
noon issue. Offline test success is distinct from the live availability and
delivery-delay findings above.

Website commits `2a0d4a3` and `e9c133c` are deployed: the first adds the report-page
hero and centered selector, and the second corrects pending/failed catalog states
and explicit connection retry. The static website workflow still deploys only the
public artifact, not either Function backend.

## Validation

- Run `node --test backend/reports/test/*.test.mjs` without cloud credentials.
- Run `python3 scripts/validate_site.py` for routes, links, safety copy, no contact
  forms, static availability defaults and the report page's no-form CSP.
- Run `scripts/test_report_page.cjs` against the loopback preview with Playwright;
  published responses are mocked, never fetched from production during tests.
  It covers pending catalog labels, cold-start allowance and the 30-second deadline,
  failure without a false unpublished claim, no automatic catalog polling,
  coalesced manual retry, and destination changes during connection recovery.
- Run `scripts/test_report_selection.cjs` against that preview for mouse/touch
  switching, direct Enter selection, ambiguous and composed input, and distinct
  destination-named missing-report and request-failure states. An exact unique
  destination or sole search result can be selected with Enter without first
  pressing an arrow key. Similar names still require an explicit choice.
- Build the explicit `.azure-dist` allow-list. Backend source, dependencies, settings,
  operator data and historical marketing archives must stay outside the artifact.
- Run `scripts/test_report_visibility.cjs` against the same loopback preview for
  desktop, touch, keyboard and reduced-motion result visibility, unchanged data,
  and focus preservation during delayed, bookmarked and scheduled updates.

Local verification: 41 offline backend tests pass, including all 76 destination
approvals, destination isolation, unchanged read limits, daylight-saving boundaries
and cached-report freshness. Browser checks pass at 320,
390, 768 and 1280 pixels, at 200% text, without JavaScript, and for Eastern issue
times, invalid data and selection races. Static validation passes eight pages with
zero warnings; the public artifact contains 19 files. These local checks do not
verify a live report. Deployment, route and permission readbacks are recorded above;
successful current export, composition and scheduled publication remain separate checks.

The separate staged cloud-fill copy draft is not part of this release and remains
unpublished. Owner approval for the report deployment and Git push supersedes the
earlier local-only hold; it does not include that separate wording draft.
