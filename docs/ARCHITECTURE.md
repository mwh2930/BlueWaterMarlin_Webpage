# Website architecture

This repository is the source of truth for the public BlueWater Marlin website.
It is intentionally separate from the iOS application repository so website
deployments cannot accidentally include application source or uncommitted app
work. Azure Static Web Apps receives only the allow-listed static artifact, never
this complete repository. The report Function uses a separate explicit source ZIP.

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
| `/sources/` | `sources/index.html` | Educational source register, limitations, and attribution |
| `/sources` | Azure route configuration | Permanent redirect to `/sources/` |
| `/report/` | `report/index.html` | Website-only offshore report reader and searchable destinations |
| `/report/<approved-us-id>/` | Generated `report/<id>/index.html` | 60 destination-bound report pages using the same reader |
| `/report/privacy/` | `report/privacy/index.html` | Report data and hosting privacy supplement |
| `/report`, `/report/privacy` | Azure route configuration | Permanent redirects to directory routes |
| `/support.html` | `support.html` | Compatibility redirect to `/support/` |
| Any missing route | `404.html` | Recovery page |

Only the directory routes are canonical. Do not create a second editable copy
of support, privacy, or source content at a `.html` URL. The homepage and support
footer link to `/sources/`; the homepage `#data` preview and support header link
to that preview remain unchanged.

## Shared assets

- `assets/hero.jpg` is the homepage hero and social-preview image.
- `assets/css/pricing.css` is scoped to the homepage `#pricing` section. Plan cards
  use semantic headings and CSS subgrid with a flex fallback; mobile stacks the
  same content. Shared Pro limitations remain visible, and prelaunch buttons stay
  disabled. The stylesheet is included through the existing `assets/` allow-list.
- `assets/css/public.css` provides base styles for support, redirect, error, and sources pages.
- `assets/css/sources.css` isolates the illustrated dark-to-light source page; it does
  not alter homepage, support, or privacy styling.
- `assets/js/sources-motion.js` progressively enables transform/opacity SVG motion.
  Complete static figures are the default without JavaScript or with reduced motion.
  A page-local toggle, viewport observer, and tab visibility listener govern playback.
  No data requests or external animation libraries are involved.
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

## Source register boundary

The source page explains external observations, analyses, forecasts and reference
layers, with exact provider identities, limitations and official attribution links.
It does not document proprietary B.I.L.L. calculations. Dataset revisions and
credits must be reviewed against the iOS/relay source registry and provider records.
Update the visible review date when that review is performed.

The September 18 targeted update separates website report inputs from app-only
reference layers and source candidates. EMODnet contour attribution is app context;
Copernicus floating-sargassum products remain explicitly under review. No new
provider integration or acquisition is implied by adding documentation links.

The static validator checks this page's canonical URL, local links, fragment targets,
footer integration and permanent redirect. The Azure build explicitly allows
`sources/` and asserts that its page, stylesheet and motion script are nonempty.
Support and privacy keep their existing styling and routes.

## Read-only report boundary

The report page and its scoped CSS/JS are public static assets. `?destination=`
selects a public catalog ID. Browser requests use only the website's branded
`/api/reports/` interface, never internal storage URLs or shared-access tokens.
The source catalog retains public destination names and time zones only; internal
render-region keys, container names and coordinates from the reference catalog
are not distributed. A candidate listing is not proof of available report coverage.

`backend/reports/` is an independently deployed HTTP-only Function App, not the
existing readability API and not part of the iOS data/learning relay. It reads
prepared reports from private Blob storage and returns approved public fields.
It does not generate reports or write to the source. Its report-reader identity has
read-only access scoped to the report container. A separate host identity has only
three dedicated container-scoped assignments for host metadata, host secrets and
deployment packages, with no account-wide role. The public static artifact must
never include backend source, tests, settings or credentials. Static deployment
does not deploy or enable this backend.

The reader has no contact database, signup, email sender, timer, operator approval
route or visitor account. A separately deployed upstream timer handles destination
export and report publication at Eastern noon and midnight. A destination's lookup
approval is not proof of available data: the private publisher must supply the
bounded, dated report JSON contract before a report can be returned. Legacy
marketing text files are reference material, not live inputs.
Public responses are reconstructed from approved fields; upstream URLs, errors and
headers are not passed through. Report text retains source age and uses approximate
area language, without fishing conclusions or confirmed weed-line claims.

Only GET catalog and report routes are supported. The static catalog is a list of
candidate destinations, all unavailable by default. Missing, stale or invalid data
must never become a substitute sample or a claim of no signal. Dates reflect the
source, not an upload timestamp. Descriptions are factual, without an education
pitch, invented grades or fishing advice. The historical example stays labeled.

Bounded in-memory caching, coalesced reads and per-instance request/read budgets
reduce repeated Blob reads. They are not a distributed firewall or a guarantee
against traffic-related charges. The service does not trust a caller-supplied IP
header. The owner approved the Static Web Apps Standard upgrade, isolated Function
deployment and Git push. Native same-origin routing is verified: the catalog returns
200 through the website and direct backend access returns 401 with platform
authentication required. Storage remains private and keyless. Review ordinary
hosting-log access and retention separately from the application's bounded reads.

The first Oregon Inlet forecast report was verified through the same-origin API
at midnight Eastern on September 18. Ocean fields without inputs are unavailable,
not reconstructed from samples. All 76 audited destinations use the same
reader and deployed publisher, and their September 18 noon issues were confirmed
published by 12:15:04 Eastern. The website directory now exposes only the 60
reviewed U.S. destinations; it does not delete or change upstream jobs.
Lookup approval is not evidence of current data. No per-location resource
or public generation endpoint was added. The existing read limits remain intact.
One successful issue is not proof of continuing source availability.
The visible browser page rechecks the selected approved destination at each Eastern
noon/midnight boundary, with five-minute retries through the first twenty minutes
when a report is missing. Hidden tabs recheck on return. This does not generate or
re-date a report, and a prior-slot report cannot remain current.

The hub's initial state is one searchable destination picker, with no empty report
card or competing example/view controls. Its historical example is inert except
at the legacy explicit URL. The static directory is a no-JS/scope-failure fallback,
hidden only after the approved picker becomes usable. An offline builder derives all 60 destination pages
and the coast-grouped link directory from the reviewed catalog and shared hub
template. Each leaf binds the reader to its approved ID and canonical route;
conflicting query parameters are ignored. The static catalog gates live selector
availability so international IDs cannot be added by a live API response.
Missing reports during the first 20 minutes show a scheduled-window notice, not a
claim of a running job. Connection failures remain distinct. The build and site
validator check all 68 public pages, generation drift, links and metadata.

The marketing page footer link and adjacent hero CTA open the same `/report/` route.
The existing homepage content, source education, app-privacy statements, pricing and
App Store availability copy remain unchanged. See `REPORT_IMPLEMENTATION.md` for QA
and current release gates. The separate staged cloud-fill wording draft remains
unpublished and is excluded from this report release.

## Existing homepage structural debt

The homepage is still a generated document with inline styles and a client-side
runtime. A later refactor should compile the interactive charts ahead of time,
move stable styles and behavior into versioned assets, and remove the React and
Babel CDN dependency from `support.js`. That refactor should be isolated from
copy or pricing changes so visual and behavioral differences are reviewable.

The Download and Subscribe calls to action still need the final App Store URL.
Until that URL exists, automated validation reports those placeholder links as
warnings instead of treating them as deploy failures.
