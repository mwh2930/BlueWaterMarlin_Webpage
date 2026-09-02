# BlueWater Marlin — marketing site

Marketing site for **B.I.L.L.** (Breaks. Isotherms. Layers. Location.), an
offshore satellite chart app. Publisher: Red Oak Media House.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The public website entry point served by GitHub Pages. |
| `support/index.html` | Canonical `/support/` route used by the iOS app and App Store Connect. |
| `support.html` | Compatibility redirect to the canonical `/support/` route. |
| `privacy/index.html` | Stable `/privacy` route used by the iOS app and App Store Connect. |
| `404.html` | Recovery page for missing GitHub Pages routes. |
| `support.js` | Runtime the pages load. Required — do not edit by hand. |
| `assets/hero.jpg` | Hero photo. Provenance still to be established. |
| `assets/css/public.css` | Shared styling for support and system pages. |
| `data/readability.json` | Fallback Readability Index data the site fetches. |
| `backend/build-readability.mjs` | Local job: NOAA ERDDAP → `data/readability.json`. |
| `backend/azure/` | Deployed backend: ingest timer + readability HTTP API. |
| `backend/azure-endpoint.md` | Data contract for the readability endpoint. |
| `docs/ARCHITECTURE.md` | Repository boundaries, canonical routes, deployment, and structural debt. |
| `CLAUDE.md` | Historical design and copy notes from the original site build. |
| `archive/` | Source package, screenshots and internal working material. Not linked from the site. |

## Running locally

The pages are static. Serve the repo root over HTTP (relative paths to
`support.js`, `assets/` and `data/` must resolve):

```
python3 -m http.server 8000
# then open http://localhost:8000/
```

Opening the file directly from disk works for layout but `fetch` of
`data/readability.json` will be blocked by the browser.

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

GitHub Pages publishes the `main` branch from the repository root. The custom
domain is `bluewatermarlin.com`; the root `CNAME` file keeps that association in
source control. GoDaddy remains the DNS provider.

## Architecture and conventions

See `docs/ARCHITECTURE.md` for the website/app boundary and canonical route
contract. The original design notes in `CLAUDE.md` capture the visual system,
chart-painting rules and copy discipline. The short version:

- The product shows water. It never finds fish.
- No accuracy figure or comparative claim until it is published with sample size
  and method. Never "real-time" for daily satellite passes.
- Charts on the page are illustrations and stay labelled as such.
- Thresholds (0.4 °C, 70%, 25%) are one backend constant, printed under the
  graphic. Don't retune them silently.
- Keep shared support and system-page styles in `assets/css/public.css`.
- Keep one editable page for each canonical public route.
- Preserve reduced-motion and keyboard-accessible behavior.

## Open items

- Font stack: drop SF Pro Display, use system fonts.
- Hero photo provenance.
- Terms and Privacy documents (required by any surface offering the subscription).
- Offline / download-before-you-leave screen; App Store button with the chart on a phone.
