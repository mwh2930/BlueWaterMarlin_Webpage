# Private-Blob report relay

This is a data-only Azure Functions v4 Node service. It reads approved report JSON from a private Blob container and returns a bounded public representation to the website. It does not create accounts, collect contact details, send email, store subscriptions, accept marina applications, or provide a public write API.

**Deployment status — September 18, 2026.** The isolated reader and upstream publisher are deployed. All 76 audited destinations are approved through the same reader and publisher, without per-location resources. All 76 reports returned valid public responses after bounded follow-up checks: 75 initial-window issues and Oregon Inlet's unchanged midnight issue. The temporary initial setting has been removed; the regular schedule remains enabled. Intermittent browser delivery delays remain unresolved. Ocean fields without valid inputs remain unavailable; dated analyses do not prove complete or continuously fresh coverage. Code and packaged-catalog defaults remain disabled. The website deployment workflow does not deploy this service.

## Preview and tests

From the website root, run:

    node backend/reports/dev-server.mjs

Then open http://127.0.0.1:8878/report/. REPORTS_PREVIEW_PORT changes the port. Preview binds to loopback and serves only allowed public files. It makes no Azure requests, lists all destinations as unavailable, and rejects writes without reading or logging request bodies. The page's historical example is not a current report.

From this folder:

- npm test runs offline tests using fake reports and streams; no cloud data is read or changed.
- npm ci --ignore-scripts installs the pinned Functions, Identity and Blob SDK dependencies. There are no email or Table dependencies.
- Importing functions.mjs checks worker registration in test mode, not a deployed integration.

## Public contract

Only these HTTP routes are registered:

| Route | Result |
| --- | --- |
| GET /api/reports/catalog | {destinations:[{id,name,admin,available}]} |
| GET /api/reports/report?destination=id | {destinationId,title,reportDate,sourceDates:[{label,date}],radiusNm,text,status:"available"} |

"available" in the catalog means an operator has enabled that destination for report lookup; the specific report still has to pass validation. Missing, stale or invalid reports return a generic 404. Temporary read failure, timeout or exhausted upstream budget returns a generic 503. Request budget exhaustion returns 429 with Retry-After. The public contract has no signup field, email/token actions, mutation routes, or administration methods.

The browser uses the website's same-origin /api/reports/* routes. Native Azure Static Web Apps integration is configured and verified: the catalog returns 200 through the website, while a direct backend request returns 401 with platform authentication required. Neither this code nor a static route entry alone establishes that connection. Do not publish Blob/SAS URLs or give the browser direct storage credentials/CORS access. Hiding an account name is not access control: the container's permissions protect it.

## Blob publisher contract

The relay accepts only IDs present in the sanitized catalog and explicitly named by the operator in REPORTS_APPROVED_DESTINATIONS. The only requested object path is reports/DESTINATION_ID/latest.json inside the configured container. A user cannot supply a container, endpoint, filename, URL or arbitrary prefix.

The seven report fields listed above are required. Unknown top-level or source-date fields are rejected. Reports must use the selected destination ID, a title of 1–180 characters, 20–24,000 characters of plain report text, a numeric radius greater than zero and no more than 300 nautical miles, and 1–20 source-date entries. The total UTF-8 document is capped at 32 KiB. The relay neither generates values nor rewrites source dates.

The report publication date must be a full UTC ISO timestamp with seconds and optional three-digit milliseconds. Source dates may use YYYY-MM-DD or the same timestamp format. A report must be published at or after the most recent scheduled slot: Eastern midnight/noon before September 20, 2026 at 04:00 UTC, then once daily at 04:00 UTC. An earlier-slot report is unavailable, including when it was cached. A 36-hour absolute age cap also applies. Dates more than five minutes ahead of the server clock are rejected. Older source dates remain visible and are not replaced by the publication or request time. A fresh publication date does not prove every source is fresh.

URLs, HTML, control characters, SAS-like query strings, storage-host strings, and configured private account/container identifiers are rejected in public report text and metadata. Responses never pass upstream headers, redirects or exception details through. The frontend must render the returned report as text, not HTML.

The legacy report generator is not automatically a conforming JSON publisher. Verify exact source provenance, missing-data states, approximate/general-area sargassum language and source ages before approving coverage. Do not redate historical reports.

### Publication schedule

The owner requested once-daily publication at 04:00 UTC starting September 20, 2026. The publisher, reader and browser transition together at `2026-09-20T04:00:00.000Z`. Before that instant, the existing noon/midnight America/New_York slots remain in place, including September 19 noon. Afterward the interval is always 24 hours and does not follow Eastern daylight saving time. Bounded batches still run during the first twenty minutes, and a successful timer invocation is not a guarantee of complete source data. The separate app repository's azure/relay/REPORTS.md documents the disabled-by-default numeric exporter and deterministic composer. The public relay still reads prepared seven-field report JSON only; it never interprets raw grids or invokes upstream weather from a visitor request.

This relay is deliberately request-driven and has no timer that pretends to regenerate data. The separate publisher must finish an atomic upload before the new version can be returned. Oregon Inlet's first scheduled publication was verified at 04:00 UTC on September 18, with the original MET forecast update time retained. This verifies one issue, not all sources or subsequent runs. At a slot boundary, an older cached report immediately fails freshness; if the replacement has not finished publishing, the destination is unavailable. The short negative-cache interval can delay visibility of a newly available report by up to 15 seconds. Updates within the same publication slot can take up to the configured cache TTL to appear. Original report and source dates remain unchanged.

The owner authorized a one-time initial publication window on September 18, **08:40–09:00 Eastern (12:40–13:00 UTC)**. The server-only `REPORT_INITIAL_PUBLICATION_AT` setting belongs to the upstream publisher, not this reader. It admits one fixed, five-minute-aligned, 20-minute window that cannot overlap the regular window or cross a civil-slot boundary. A separate private progress record retains the usual limits: at most 24 claims per phase and per invocation, with a four-minute cooperative invocation budget. Current-period reports are skipped, source dates are preserved, and the regular noon/midnight schedule is unchanged. Initial eligibility expired automatically at 09:00 Eastern; the temporary setting was removed at 09:00:30 Eastern after exact-value/release checks. Readback confirmed that the exporter, publisher and regular timer remain enabled and unchanged.

Initial-window sample checks include Stuart / St. Lucie Inlet, Magdalena Bay, Exmouth, Montauk, Ocean City, Savannah / Tybee, Wrightsville Beach, Los Barriles / East Cape, Miami, Venice and Morro Bay. Checked outputs include dated SST/current analyses, Venice chlorophyll dated September 14, and September 18 forecast sources. These checks do not establish success for all 76 destinations or complete source coverage. The existing ocean-pipeline heartbeat remains stale and has not been repaired by this release.

The subsequent full-catalog audit returned 58 valid reports and 18 timeouts with a 15-second deadline. One Chrome follow-up per affected destination returned 17 valid reports within 30 seconds; Portland timed out, then returned valid data on one independent lookup. Combined, the checks verified all 76 approved IDs and their seven-field public reports, including 75 initial issues and Oregon's unchanged midnight issue. No 404 responses occurred. This verifies eventual availability, not reliable latency: some browser requests took 15–26 seconds and one exceeded 30 seconds. The cause is not established by existing aggregate metrics. No new telemetry, capacity or permissions were enabled. Future publication and complete ocean coverage remain separate checks.

The initial publisher is deployed from `1f57d848be4e82b8ea73e1144679787b6846d858` on `release/initial-destination-reports-20260918`. All 111 focused tests and the full release-clean gate passed; Xcode checks were skipped because no app code changed. No new reader permission or public administration route was added.

For a selected, approved destination, the visible browser page checks again at each publication boundary using the same effective-date transition as the publisher and reader. If no current report is returned, it retries at five-minute checkpoints through the first twenty minutes of the slot. Hidden tabs pause their timer and recheck on return. Manual refresh remains available. This refresh reads published data; it never generates a report or re-dates an earlier issue.

Website commits `2a0d4a3` and `e9c133c` deployed the **B.I.L.L. Offshore Report** hero with its centered selector and static, labeled contour illustration, followed by the connection-state fix. Local candidates are not labeled unpublished while the live catalog is pending. The page shows **Checking report connection**, or **Retry connection** for a selected destination after failure. Manual catalog retries share one in-flight request, have a 30-second browser deadline, and do not poll automatically. Recovery respects the current selection; a historical example is never substituted. The longer browser allowance for host startup does not extend this relay's eight-second Blob read deadline.

## Read limits and memory cache

The relay keeps no visitor identity or persistent request record. It does not trust client-provided forwarding/IP headers. Per process:

- At most 300 API requests per minute by default, including catalog and cached requests.
- At most 60 upstream reads per minute, with eight concurrent reads.
- At most 128 cached entries, normally 60 seconds for valid reports and 15 seconds for missing or failed reads.
- Concurrent requests for the same destination share one read.
- Freshness is checked again on every valid cache hit.
- An eight-second read deadline aborts the Blob stream. The SDK gets one request attempt and no body-download retry.

These controls reduce repeated reads and bound application work. They are **not fleet-wide limits, a DDoS guarantee, or a promise of no hosting charges**. Each new instance has its own cache and budget, and requests still reach the hosting platform. The approved pilot uses a maximum of one 512 MiB instance, HTTP concurrency four and no always-ready instances. Native same-origin backend protection is verified; no additional WAF is assumed. Continue reviewing platform limits, usage alerts and logging retention.

## Deployment configuration

Use supported Node 22 LTS with an isolated managed identity. Assign that identity only Storage Blob Data Reader at the report-container scope. Do not give it Blob write/delete, subscription-data, email-send or account-wide administrative access. Keep anonymous Blob access disabled. No keys, connection strings or SAS tokens are required by this relay.

The hosted service uses ManagedIdentityCredential, not developer-key fallback. An optional AZURE_CLIENT_ID selects an assigned user-managed identity. The local preview does not use cloud credentials.

The deployed Node 22 reader uses a separate identity for Functions host storage. That host identity has exactly three container-scoped assignments: Storage Blob Data Owner on the dedicated host-metadata and host-secrets containers, and Storage Blob Data Contributor on the deployment-package container. It has no account-wide role. The report-reader identity retains only its report-container read permission. Host storage denies shared-key and anonymous access; FTP and SCM basic publishing authentication are disabled.

### Isolated source package

Build the backend separately from the public website. From the website root:

    report_package_dir="$(mktemp -d /private/tmp/bluewater-report-package.XXXXXX)"
    python3 scripts/build_report_backend.py --output "$report_package_dir/report-backend.zip"
    python3 -B scripts/test_build_report_backend.py

The builder creates a deterministic, nine-file source ZIP and prints its SHA-256. The five runtime modules, host.json, package.json and package-lock.json sit at the archive root, as required by the Functions entrypoint. The dedicated backend/reports/data/report-destinations.json preserves the existing 76-location server catalog independently of the website's 60 U.S. options. It is sanitized into the archive at data/report-destinations.json; every packaged destination must remain unavailable. Actual lookup approval stays in server settings, not the artifact. This separation prevents an otherwise valid website-only catalog reduction from breaking the reader's existing approvals.

Only those explicit files are packaged. Local settings, environment files, tests, preview servers, documentation, installed dependencies, private inputs and website pages cannot enter through directory copying. Symlinked inputs/parents, mismatched package locks, unsafe catalogs, existing outputs and outputs inside the website source tree are rejected. The package contains no deployment credentials and building it does not contact Azure, install packages or publish anything.

For this flattened Linux Functions package, set **REPORTS_CATALOG_FILE=/home/site/wwwroot/data/report-destinations.json**. The development default ../../data/report-destinations.json is not valid for this layout. Keep the Functions app on Node 22 and use an approved Azure remote build to install production dependencies from the included package-lock.json; node_modules is deliberately not bundled. Review the remote build's dependency installation before activation. Host/runtime storage, identity, routing and deployment are configured separately from packaging. Owner approval was received for the pilot deployment and Git push. The static website workflow does not deploy this ZIP.

| Setting | Default / purpose |
| --- | --- |
| REPORTS_ENABLED | false; only exact true enables reads |
| REPORTS_APPROVED_DESTINATIONS | Empty; comma-separated exact catalog IDs |
| REPORTS_BLOB_ENDPOINT | Empty; private Azure public-cloud Blob service HTTPS endpoint, no path/query/credentials |
| REPORTS_CONTAINER | Empty; report container name, kept server-side |
| REPORTS_CATALOG_FILE | Optional trusted deployment file path |
| REPORTS_PRIVATE_IDENTIFIERS | Optional comma-separated additional identifiers to reject in public output; account and container names are added automatically |
| REPORTS_CACHE_TTL_SECONDS | 60, bounded 1–300 |
| REPORTS_REQUESTS_PER_MINUTE | 300, bounded 1–3000 per process |
| REPORTS_READS_PER_MINUTE | 60, bounded 1–300 per process |
| REPORTS_MAX_CONCURRENT_READS | 8, bounded 1–20 per process |

Disabled operation does not create Blob clients, acquire identity tokens, or read private reports. Unknown approved IDs and malformed configuration fail closed. Configuration is read at process start; restart/redeploy when changing it. Never copy internal settings into website assets or public troubleshooting responses.

## Verification and ongoing availability

1. Deployment, narrowly scoped identity assignments and native same-origin routing have been verified. The live catalog approves all 76 audited locations for lookup. Approval means a lookup is allowed, not that a current report exists. Direct backend access is denied; arbitrary or unapproved IDs return a generic 404.
2. The first Oregon Inlet forecast issue and all 75 initial-window issues were verified against their publication and source timestamps. Verify future issues and delivery reliability separately; complete ocean-data coverage remains unverified. Do not re-date historical inputs.
3. Test the actual current report, source-date preservation, unavailable/stale states, byte/time bounds and cache freshness. Offline tests and timer registration do not prove successful publication.
4. Review platform logs. The application does not log report bodies, SDK exceptions, identifiers or visitor details, but cloud/proxy defaults may retain ordinary request metadata/IP addresses. Set appropriate access, redaction and retention controls there.
5. The publisher processes the reviewed catalog in bounded, fair batches during the first 20 minutes of each scheduled slot. The September 20 transition replaces the old Eastern noon/midnight slots with one fixed 04:00 UTC daily slot. The completed initial window and temporary-setting cleanup did not themselves shift that schedule. The full-catalog audit above verifies the first issues, not subsequent automatic publication. Missing inputs are never replaced with historical examples. New, unlisted destinations require a separate coordinate/source review and explicit approval. The staged cloud-fill wording draft remains unpublished and outside this release.

Official references: [Functions Node v4](https://learn.microsoft.com/en-us/azure/azure-functions/functions-node-upgrade-v4), [Blob SDK](https://learn.microsoft.com/en-us/javascript/api/overview/azure/storage-blob-readme?view=azure-node-latest), [managed-identity Blob access](https://learn.microsoft.com/en-us/azure/storage/blobs/assign-azure-role-data-access).
