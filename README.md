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
| `404.html` | Recovery page for missing public routes. |
| `staticwebapp.config.json` | Azure routes, MIME overrides, and production security headers. |
| `support.js` | Runtime the pages load. Required — do not edit by hand. |
| `assets/hero.jpg` | Hero photo. Provenance still to be established. |
| `assets/css/public.css` | Shared styling for support and system pages. |
| `data/readability.json` | Fallback Readability Index data the site fetches. |
| `backend/build-readability.mjs` | Local job: NOAA ERDDAP → `data/readability.json`. |
| `backend/azure/` | Deployed backend: ingest timer + readability HTTP API. |
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

## Backend

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
  planned prices remain qualified. The current plan is $32.99 monthly or $99.00
  annually ($8.25 per month equivalent); final App Store pricing may vary.
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
