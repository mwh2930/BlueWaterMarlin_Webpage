# Website architecture

This repository is the source of truth for the public BlueWater Marlin website.
It is intentionally separate from the iOS application repository so website
deployments cannot accidentally include application source or uncommitted app
work. Azure receives only the allow-listed static artifact, never this complete
repository.

## Repository boundary

| Repository | Responsibility | Canonical remote |
|---|---|---|
| `BlueWaterMarlin_Webpage` | Marketing, support, privacy, and Azure Static Web Apps configuration | `mwh2930/BlueWaterMarlin_Webpage` |
| `BlueWater_MarlinV2` | iOS app, tests, release metadata, Azure relay and tile services | `mwh2930/BlueWater_MarlinV2` |

The app links to these stable website routes:

- `https://www.bluewatermarlin.com/support/`
- `https://www.bluewatermarlin.com/privacy/`

These URLs use the configured `www` domain and canonical directory
routes, so the app and App Store do not depend on a redirect.

## Public routes

| URL | Source | Purpose |
|---|---|---|
| `/` | `index.html` | Marketing homepage |
| `/support/` | `support/index.html` | Canonical app and App Store support page |
| `/privacy/` | `privacy/index.html` | Canonical privacy policy |
| `/support.html` | `support.html` | Compatibility redirect to `/support/` |
| Any missing route | `404.html` | Recovery page |

Only the directory routes are canonical. Do not create a second editable copy
of support or privacy content at a `.html` URL.

## Shared assets

- `assets/hero.jpg` is the homepage hero and social-preview image.
- `assets/css/public.css` styles the support, redirect, and error pages.
- `support.js` is the generated runtime currently required by the homepage.
- `data/readability.json` is the homepage fallback readability dataset.

## Deployment

GitHub Actions validates `main`, builds `.azure-dist/` from an explicit public
allow-list, and deploys that directory to `swa-bluewatermarlin` in Azure Static
Web Apps. `www.bluewatermarlin.com` is the canonical production host. GoDaddy
remains the DNS provider.

Run `python3 scripts/validate_site.py` and
`scripts/build_static_site.sh .azure-dist` before committing. The same checks
run on every pull request; pushes to `main` deploy only after validation.

## Structural debt

The homepage is still a generated document with inline styles and a client-side
runtime. A later refactor should compile the interactive charts ahead of time,
move stable styles and behavior into versioned assets, and remove the React and
Babel CDN dependency from `support.js`. That refactor should be isolated from
copy or pricing changes so visual and behavioral differences are reviewable.

The Download and Subscribe calls to action still need the final App Store URL.
Until that URL exists, automated validation reports those placeholder links as
warnings instead of treating them as deploy failures.
