# BlueWater Marlin — marketing site

Marketing site for **B.I.L.L.** (Breaks. Isotherms. Layers. Location.), an
offshore satellite chart app. Publisher: Red Oak Media House.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The public website entry point served by Azure Static Web Apps. |
| `support/index.html` | Canonical `/support/` route used by the iOS app and App Store Connect. |
| `support.html` | Compatibility redirect to the canonical `/support/` route. |
| `privacy/index.html` | Stable `/privacy` route used by the iOS app and App Store Connect. |
| `sources/index.html` | Canonical `/sources/` educational data register, limitations, and attribution page. |
| `report/index.html` | `/report/` read-only destination report reader and clearly dated historical example. |
| `report/<approved-us-id>/index.html` | 60 generated destination pages; rebuild with `scripts/build_report_pages.py`. |
| `report/privacy/index.html` | Website report data and privacy notice, separate from app records. |
| `404.html` | Recovery page for missing public routes. |
| `staticwebapp.config.json` | Azure routes, MIME overrides, and production security headers. |
| `support.js` | Runtime the pages load. Required — do not edit by hand. |
| `assets/hero.jpg` | Hero photo. Provenance still to be established. |
| `assets/css/public.css` | Shared base styling for support and system pages. |
| `assets/css/pricing.css` | Scoped homepage pricing, responsive plan comparison, and restrained glass controls. |
| `assets/css/sources.css` | Scoped dark-to-light source-page layout and inline-SVG motion. |
| `assets/js/sources-motion.js` | Source-page pause control, reduced-motion and offscreen handling. |
| `data/readability.json` | Fallback Readability Index data the site fetches. |
| `backend/build-readability.mjs` | Local job: NOAA ERDDAP → `data/readability.json`. |
| `backend/azure/` | Deployed backend: ingest timer + readability HTTP API. |
| `backend/reports/` | Independently deployed private Blob report reader for 76 approved destination lookups. |
| `backend/azure-endpoint.md` | Data contract for the readability endpoint. |
| `docs/ARCHITECTURE.md` | Repository boundaries, canonical routes, deployment, and structural debt. |
| `CLAUDE.md` | Historical design and copy notes from the original site build. |

## Running locally

The pages are static. Serve the repo root over HTTP (relative paths to
`support.js`, `assets/` and `data/` must resolve):

```
python3 -m http.server 8000
# then open http://localhost:8000/
```

Opening the file directly from disk works for layout but `fetch` of
`data/readability.json` will be blocked by the browser.

## Visual content editor

On macOS, double-click `Open Content Editor.command`. The local editor opens in
your default browser. Click any blue-outlined heading, paragraph, caption, list
item or button label in the site preview, type the replacement, and choose
**Save index.html**. Use the Mobile and Desktop controls to review both widths.
Choose **Live preview** to open a clean page that refreshes automatically whenever
`index.html` changes.

The editor binds only to `127.0.0.1`, changes plain text only, refuses to save if
`index.html` was changed elsewhere after the editor loaded, and writes a
timestamped backup to `.content-editor-backups/` before every save. Stop it by
closing its Terminal window or pressing Control-C.

It can also be started from Terminal:

```
python3 scripts/content_editor.py
```

Validate the public route and link contract before committing:

```
python3 scripts/validate_site.py
```

## Data sources page

The homepage and support footer **Data sources** links open `/sources/`.
The homepage `#data` preview remains part of the product education.
`/sources` permanently redirects to `/sources/` in Azure.

Source-page styling is isolated from support and privacy. Inline SVG figures are
conceptual, not live data. They render completely without JavaScript. Motion uses
only transforms and opacity, pauses outside the viewport or when the tab is hidden,
and respects both the **Pause motion** control and OS reduced-motion settings.
No external animation library, provider logo, analytics or network data feed is used.

When updating the register, verify exact products against the current iOS and relay
source configuration and official provider records. Keep citations, licenses,
modification acknowledgements, source limitations, review date and correction contact
current. Do not copy internal projection parameters or claim provider endorsement.
This transparency page does not replace professional legal review.

Before release, test 320px, 390px and desktop widths, 200% text sizing, keyboard
navigation, pause/resume, reduced motion, and no-JavaScript reading. Then run the
validator and Azure artifact build; the new page and both scoped assets are
explicitly included in the public artifact. Run `bash scripts/build_static_site.sh .azure-dist`
after validation. See `docs/SOURCES_REVIEW.md` for verification notes and the
commercial-use licensing item that remains for the publisher to resolve.

## Backend

### Website-only reports and local preview

The homepage **Free Report** button beside the main App Store call to action and
the footer **Report** link both open `/report/`. The App Store availability and
pricing wording are unchanged. The report page uses its own stylesheet and script,
with no external fonts, framework, tracking or direct storage requests.
Its **B.I.L.L. Offshore Report** hero includes a centered destination selector and
a static, labeled contour illustration. The illustration is not a live chart or a
claim about current conditions.
Confirming a destination brings its report heading into view and moves keyboard
focus there. **View report** returns to the selected readout without another
request. Loading, ready and failure states also appear beside the selector;
background updates and delayed responses never move the visitor's focus.

Start the local, read-only preview:

```
node backend/reports/dev-server.mjs
```

Open `http://127.0.0.1:8878/report/`. The report reader has no accounts, signup,
contact collection or email delivery. The preview makes no Azure requests.
The public directory contains 60 reviewed U.S. destinations, not a promise of current coverage.
Only the configured service can enable report lookup for a destination. Choosing a destination
without a report never substitutes another port's historical example. The 2 September
Oregon Inlet example is explicitly historical and opens only on request; it is not a current weather bulletin.

The hub starts with **Choose your destination**. Its coast-grouped directory links
to all 60 `/report/<destination-id>/` pages. These pages preserve the existing report
format and bind their metadata and reader to one approved ID; conflicting query
parameters cannot substitute another place. Changing destination on a location
page navigates to that location's page. Existing U.S. hub query links still work.

Build pages with `python3 scripts/build_report_pages.py`; verify them with the
same command plus `--check`. The shared hub HTML and reviewed static catalog are
the sources. The builder is offline and never fetches or fabricates conditions.
The website must load its reviewed U.S. catalog before applying live availability.
International or unlisted IDs cannot enter the selector or trigger a report read.
The upstream publisher's existing 76-location jobs are not changed by this UI work.

The browser makes GET requests only, using the same-origin catalog and report API.
There are no subscriber records, contact forms, confirmation tokens, delivery jobs,
marina applications, email SDKs or retention workers. Reports are displayed on the
website, not sent to visitors. The report source keeps its original dates and units;
the reader must not add unsupported interpretations or present examples as current.
While the live catalog is pending, local destination options say **Checking report
connection**, not that a report is unpublished. A failed catalog connection offers
**Retry connection** for the selected destination. This explicit retry shares any
in-flight catalog request and has a 30-second browser deadline; it does not add
automatic catalog polling. Connection recovery loads only the current selection.

For an approved destination, a visible report page checks again at Eastern noon and
midnight. If publication is not ready, it retries at five-minute checkpoints through
the first twenty minutes of the slot. Hidden tabs recheck on return, and manual
refresh remains available. The browser reads published data; it does not generate
reports or re-date an earlier issue.
Within the first 20 minutes, a missing current issue is labeled **Scheduled update
window**, without claiming the publisher is running or guaranteeing a result.
Connection failures remain errors; an older report is never labeled current.

The dedicated service is **not deployed by the website workflow**. The owner has
approved deployment and Git push; the isolated reader and upstream publisher are
now deployed separately. The approved Standard upgrade and native same-origin API
connection are verified. Direct backend access is denied, and the reader identity
has read-only report-container access. Oregon Inlet's first scheduled forecast report
was verified at midnight Eastern on September 18. Its source timestamp remains
separate from publication time; missing ocean fields are explicitly unavailable.
All 76 listed destinations are now approved through this same relay. Their audited
coordinates are configured in the deployed publisher; no per-location resources
were created. The owner authorized a one-time initial publication window on
September 18, **08:40–09:00 Eastern (12:40–13:00 UTC)**. The initial window has a
separate private progress record and bounded work limits; it does not shift the
regular noon/midnight Eastern schedule or re-date an existing current-period report.
Real reports from multiple destinations have been checked during the initial
window. The temporary operator setting was removed and the enabled publisher and
timer read back at 09:00 Eastern. All 76 destinations subsequently returned valid
reports: 75 newly published issues and Oregon Inlet's unchanged midnight issue.
This required follow-up checks after connection timeouts; intermittent browser
delivery delays remain unresolved. See the detailed audit in the implementation
notes. Publication success is not a guarantee of low latency or future availability.
The existing ocean-pipeline heartbeat remains stale. Available, dated analyses do
not establish complete or continuously fresh destination coverage.

The initial publisher is deployed from `1f57d848be4e82b8ea73e1144679787b6846d858`
on `release/initial-destination-reports-20260918`; 111 focused tests and the full
release-clean gate passed, with Xcode checks skipped because no app code changed.
Website commits `2a0d4a3` and `e9c133c` deployed the report-page redesign and
connection-state fix. The midnight/noon schedule does not guarantee successful
publication or current ocean-source coverage.
See `backend/reports/README.md` and `docs/REPORT_IMPLEMENTATION.md` for boundaries
and remaining checks. The static build creates no Azure resources. The separate
staged cloud-fill wording draft remains unpublished and outside this release.

Run local service tests without Azure credentials:

```
node --test backend/reports/test/*.test.mjs
```

With Playwright installed and the preview running, run the browser checks:

```
BROWSER_CHANNEL=chrome node scripts/test_report_page.cjs
BROWSER_CHANNEL=chrome node scripts/test_report_selection.cjs
BROWSER_CHANNEL=chrome node scripts/test_report_visibility.cjs
```

These use loopback only and mock published reports. They cover mobile layout,
200% text sizing, keyboard selection, no-script reading, unavailable reports,
selection races and the absence of mutations, contact forms or third-party traffic.
Catalog checks cover pending and failed connections, the bounded cold-start
deadline, explicit coalesced recovery, and keeping the current destination during
recovery without substituting a historical example.
The selection regression checks cover mouse and touch, direct Enter selection,
ambiguous searches, input composition and destination-specific unavailable states.
The tests do not require a cloud connection.

See `backend/azure/deploy.md` for provisioning and
`backend/README.md` for the ingest job. Before adding an automated Azure
deployment workflow, configure this repository secret:

```
AZURE_FUNCTIONAPP_PUBLISH_PROFILE
```

Get it with:

```
az functionapp deployment list-publishing-profiles -g <rg> -n bluewater-readability --xml
```

No connection strings live in the repo. `backend/azure/local.settings.json` is
gitignored; copy `local.settings.example.json` to create it.

## Website deployment

Azure Static Web Apps publishes the allow-listed artifact produced by
`scripts/build_static_site.sh` after validation passes on `main`. The canonical
host is `www.bluewatermarlin.com`; the deployment deliberately excludes source,
backend, documentation, archives, and Git metadata. GoDaddy remains the DNS
provider. `CNAME` is retained only while the former GitHub Pages apex serves as
a temporary cutover fallback.

## Architecture and conventions

See `docs/ARCHITECTURE.md` for the website/app boundary and canonical route
contract. The original design notes in `CLAUDE.md` capture the visual system,
chart-painting rules and copy discipline. The short version:

- The product shows water. It never finds fish.
- No accuracy figure or comparative claim until it is published with sample size
  and method. Never "real-time" for daily satellite passes.
- Current marketing facts must stay aligned with the app: the projection window is
  capped at 48 hours; the free tier is SST plus tap-to-read; and Pro tools vary by
  supported region.
- Offline language must identify the actual cache boundary: previously loaded SST,
  chlorophyll and sargassum grids can be restored; currents, wind, tides, live
  updates and new areas may require a connection.
- Until the App Store listing is live, calls to action say "Coming soon" and
  planned prices remain qualified. The current plan is $34.99 monthly or $99.99
  annually (approximately $8.33 per month equivalent); final App Store pricing may vary.
- Charts on the page are illustrations and stay labelled as such.
- Thresholds (0.4 °C, 70%, 25%) are one backend constant, printed under the
  graphic. Don't retune them silently.
- Keep shared support and system-page styles in `assets/css/public.css`.
- Keep one editable page for each canonical public route.
- Preserve reduced-motion and keyboard-accessible behavior.

## Open items

- Hero photo provenance.
- Terms and Privacy documents (required by any surface offering the subscription).
- Offline / download-before-you-leave screen; App Store button with the chart on a phone when the listing is live.
