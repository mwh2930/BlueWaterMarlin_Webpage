# BlueWater Marlin — marketing site

Marketing site for **B.I.L.L.** (Breaks. Isotherms. Layers. Location.), an
offshore satellite chart app. Publisher: Red Oak Media House.

## Layout

| Path | What it is |
|---|---|
| `BlueWater Marlin.dc.html` | The site. Single self-contained page, the deliverable. |
| `Support.dc.html` | Support page — email form posting to Formspree. |
| `Agent Review.dc.html` | Internal marketing / market review of the site. |
| `Feature Diagrams Sketches.dc.html` | Diagram explorations. Not shipped. |
| `support.js` | Runtime the pages load. Required — do not edit by hand. |
| `assets/hero.jpg` | Hero photo. Provenance still to be established. |
| `data/readability.json` | Fallback Readability Index data the site fetches. |
| `backend/build-readability.mjs` | Local job: NOAA ERDDAP → `data/readability.json`. |
| `backend/azure/` | Deployed backend: ingest timer + readability HTTP API. |
| `backend/azure-endpoint.md` | Data contract for the readability endpoint. |
| `CLAUDE.md` | Design system, code conventions and copy rules. Read before editing. |

## Running locally

The pages are static. Serve the repo root over HTTP (relative paths to
`support.js`, `assets/` and `data/` must resolve):

```
python3 -m http.server 8000
# then open http://localhost:8000/BlueWater%20Marlin.dc.html
```

Opening the file directly from disk works for layout but `fetch` of
`data/readability.json` will be blocked by the browser.

## Backend

See `backend/azure/deploy.md` for provisioning and
`backend/README.md` for the ingest job. `.github/workflows/deploy-readability.yml`
deploys `backend/azure/` on push to `main` and needs one repository secret:

```
AZURE_FUNCTIONAPP_PUBLISH_PROFILE
```

Get it with:

```
az functionapp deployment list-publishing-profiles -g <rg> -n bluewater-readability --xml
```

No connection strings live in the repo. `backend/azure/local.settings.json` is
gitignored; copy `local.settings.example.json` to create it.

## Conventions

`CLAUDE.md` is authoritative for the visual system, chart-painting rules and
copy discipline. The short version:

- The product shows water. It never finds fish.
- No accuracy figure or comparative claim until it is published with sample size
  and method. Never "real-time" for daily satellite passes.
- Charts on the page are illustrations and stay labelled as such.
- Thresholds (0.4 °C, 70%, 25%) are one backend constant, printed under the
  graphic. Don't retune them silently.
- Inline styles only, no CSS classes. No scroll-reveal motion. No emoji.

## Open items

- Font stack: drop SF Pro Display, use system fonts.
- Hero photo provenance.
- Terms and Privacy documents (required by any surface offering the subscription).
- Offline / download-before-you-leave screen; App Store button with the chart on a phone.

## First commit

```
git init
git add .
git commit -m "BlueWater Marlin site + readability backend"
git branch -M main
git remote add origin git@github.com:<owner>/<repo>.git
git push -u origin main
```
