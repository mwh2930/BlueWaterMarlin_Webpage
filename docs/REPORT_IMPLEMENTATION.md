# Website-only reports — September 18, 2026

## Scope

The report service is a read-only relay between private Azure Blob storage and the
website. It does not generate reports, collect contacts or send email. The September
13 signup, delivery and marina-application design has been superseded. No visitor
account or subscriber database is needed. The owner has approved deployment and
Git push. The backend connection and first Oregon Inlet forecast report are verified.
The report website is pushed and deployed. All 76 listed locations now use the
same reader and deployed publisher, with no per-location resources. New locations
await their first valid scheduled issue; approval does not establish current data.

## Website

- The homepage **Free Report** button and footer **Report** link open `/report/`.
- A searchable, keyboard-accessible destination picker requests report data only
  through the website's `/api/reports/` routes. Static candidates are not coverage
  claims and default to unavailable.
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

Generated reports describe sampled ranges and explicit forecast points, not complete
area coverage. Missing cells remain missing. Analysis is not labeled as observation.
Sargassum, waves and pressure trends remain unavailable until appropriate verified
numeric inputs exist. A report's new publication time does not make its source data
new: separate provider times are retained. The historical example is not the
composer's specification for generating fronts, weed detections or area averages.

1. Verify subsequent Oregon Inlet numeric exports and finished reports,
   including source timestamps and destination coverage. The existing upstream relay
   health check still reports a stale heartbeat; the independently indexed report
   publisher is not evidence that current ocean inputs are available. Do not expose
   storage identifiers or request storage account keys.
2. The first real report conforms to the upstream composer's seven-field JSON contract. The legacy marketing folder
   contains older text/HTML examples and must not be treated as a verified current
   JSON publisher. Unverified sargassum sources remain disabled.
3. Test one approved destination: correct source dates, report content, unavailable
   and stale states, cache freshness, rejection of writes, bounded reads, sanitized
   failures and mobile rendering. Check the publisher's data provenance separately
   from the relay's technical validation.
4. The owner approved adding all 76 listed locations. Their supplied coordinates
   match the public catalog; four legacy region assignments fit the existing
   Cabo–Cortez region instead. No coordinate was invented or region widened.
   The bounded publisher and all 76 lookup approvals are deployed. The expansion
   completed after the midnight window; new destinations first become eligible
   at noon Eastern on September 18. A shared private progress ledger admits at
   most 24 claims per five-minute phase, prioritizes untouched locations, and
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
commit `3761060` established the pilot. The all-location publisher is deployed from
clean-gated `2dcbde8`, pushed on `release/all-destination-reports-20260917` to preserve
other app work. Its 95 focused report tests, complete relay suite, app compatibility
tests and release build passed. Azure reports that exact release identity. The
existing ocean pipeline heartbeat remains stale; this deployment does not claim
to repair it. The static website workflow still deploys only
the public artifact, not either Function backend.

## Validation

- Run `node --test backend/reports/test/*.test.mjs` without cloud credentials.
- Run `python3 scripts/validate_site.py` for routes, links, safety copy, no contact
  forms, static availability defaults and the report page's no-form CSP.
- Run `scripts/test_report_page.cjs` against the loopback preview with Playwright;
  published responses are mocked, never fetched from production during tests.
- Run `scripts/test_report_selection.cjs` against that preview for mouse/touch
  switching, direct Enter selection, ambiguous and composed input, and distinct
  destination-named missing-report and request-failure states. An exact unique
  destination or sole search result can be selected with Enter without first
  pressing an arrow key. Similar names still require an explicit choice.
- Build the explicit `.azure-dist` allow-list. Backend source, dependencies, settings,
  operator data and historical marketing archives must stay outside the artifact.

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
