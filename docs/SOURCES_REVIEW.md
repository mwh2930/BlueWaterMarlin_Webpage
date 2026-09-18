# Source register review — September 8, 2026

This is a maintenance record, not a legal opinion or a grant of data-use rights.
The public document is `sources/index.html`. It covers external origins and
limitations; B.I.L.L. calculations and product education remain on the homepage.

## Registry and provider review

Compared the local iOS/relay source configuration (app repository HEAD
`15cdbbe`, with the local working copy inspected) and official provider records:

- `OceanDataService.swift` and `DataRegionAtlas.swift`: ocean, forecast,
  station and regional product identities.
- `AboutView.swift` and `THIRD_PARTY_NOTICES.md`: attribution and reference credits.
- Relay `eddies_blueprint.py` and `erddap.py`: blended altimetry and source fallbacks.

The page records the MUR v4.1 identity; OLCI and DINEOF distinctions; current
NOAA-21/NOAA-20 regional VIIRS products; blended sea-level anomaly and AOML
geostrophic currents; the seven-day AFAI composite; NWS, MET Norway and CO-OPS;
and chart, terrain, shoreline and base-map credits.

Important review decisions:

- Do not label the older `nesdisSSH1day` fallback as current: its provider
  coverage ended March 25, 2026. The register identifies the current blended feed.
- Natural Earth appears in credits, but no exact active layer/version/scale was
  established. The page acknowledges the credit without inventing a dataset.
- Preserve the Copernicus modification credit and year, the blended altimetry
  NOAA/Copernicus/AVISO+ credit, MET Norway CC BY 4.0 credit and modification
  notice, and the complete GEBCO 2026 citation, publisher and DOI.
- Official product, documentation, terms and citation links were checked.
  The GSHHG paper DOI resolves to Wiley, which returned an automated-access 403;
  the working official GSHHG/Zenodo records confirm that citation. This is an
  access limitation, not an unidentified DOI.

## Publisher action before commercial release

The configured `srtm30plus_LonPM180` product is **SRTM30_PLUS v11**.
Its [distributed license](https://coastwatch.pfeg.noaa.gov/erddap/griddap/srtm30plus_LonPM180.html)
grants specified educational, research and nonprofit uses with notices, and
directs commercial users to UC San Diego Technology Transfer.

**Commercial permission was not established by this review.** Confirm an existing
authorization or obtain an appropriate licensing review before relying on this
dataset commercially. Attribution alone does not establish permission. The page
links the terms and states this distinction; no app feed, license agreement or
third-party account was changed by the website work.

## Website verification

- Static validator: 6 public pages, zero errors or warnings.
- Azure artifact build: 13 public files, including the source page and both new
  assets. Source documents and QA files remain outside that artifact.
- Chrome and Playwright WebKit 26.5: 320, 390, 768 and 1440 CSS-pixel viewports,
  each at 100% and 200% root text size; no horizontal overflow.
- Eight source/hero SVGs have nonempty accessible titles and descriptions.
  Definition icons and the decorative page edge are hidden from assistive technology.
- Motion advances when enabled, remains frozen when paused, and pauses offscreen.
  Space and Enter activate the toggle. The visible/accessibility label stays
  constant; pressed means paused, and the tooltip describes resuming.
- OS reduced-motion changes disable motion and the toggle. With JavaScript off,
  all text and complete static figures remain available; no inert control is shown.
- Skip-link keyboard navigation checked in Chrome and with macOS Option-Tab
  in WebKit. Forced-colors heading fallback checked in Chrome.
- Animation keyframes contain only transforms and opacity and target SVG
  elements, not document text. Chrome reported no layout-shift entries, including
  a separate test with the motion script delayed by one second.
- HTTPS preview used the actual Azure headers. Source route returned 200,
  extensionless route returned 301 to `/sources/`, and assets returned 200.
  There were no page-script errors or failed resource requests in the final runs.
- Homepage/support changes are footer-link-only. Homepage `#data`, support
  header, privacy styles, pricing and generated product runtime are unchanged.

These were automated browser-engine and visual checks, not physical iPhone testing.
The build was prepared locally; this work did not push or deploy the website.

## Future updates

Recheck provider terms, dataset revisions and active regional feeds when the app's
source registry changes. Update the visible review date only after review.
Repeat the width/text-size, keyboard, pause, reduced-motion and no-script checks
after source-page edits, then run:

```sh
python3 scripts/validate_site.py
bash scripts/build_static_site.sh .azure-dist
```

## Data-service update — September 18, 2026

This targeted update covers website-report source roles, an omitted app reference
credit, and the status of a candidate service. It does not re-date the September 8
full reference-register review, qualify a new provider, or deploy the relay.
The owner approved publishing this page's pending cloud-copy correction with the
service update. The unrelated staged homepage and design-note drafts remain
unpublished. No illustration was fabricated or altered; the legacy chlorophyll
diagram is explicitly identified as not representing the current app display.

Reviewed the deployed report source snapshot at upstream `1f57d84` and the
production-candidate checkout at `7c95008`, including `OceanDataService.swift`,
`WorldDepthSources.swift`, `THIRD_PARTY_NOTICES.md`, `erddap.py`, the report
composer/exporter, and `docs/SHARED_DATA_IMPLEMENTATION_2026-09-18.md`.

- The website weather input is MET Norway Locationforecast 2.0 compact. The app's
  separate NWS configuration does not establish NWS use in website reports.
  MUR, accepted chlorophyll products and AOML currents remain the other report
  input families. The new public summary retains source clocks, sampling limits
  and conditional availability, distinct from the Eastern publication schedule.
- NOAA/USF AFAI is already an app map source. The candidate adds its numeric report
  connection but explicitly has not deployed it. The public register does not
  claim that every report contains AFAI. The provider metadata confirms the
  seven-day composite and limited geographic domain; the new paragraph explains
  partial/missing samples and avoids confirmed weed-line or absence claims.
- Added EMODnet Bathymetry `emodnet:contours`, which is selected by the app's
  European reference-layer configuration. Kept this separate from U.S. report
  inputs. Added consortium/originator credit, EU ownership, CC BY 4.0, presentation
  modifications and official metadata/terms links. No terrain version, resolution,
  survey accuracy or guaranteed coverage was inferred from the service name.
- Copernicus `MULTIOBS_GLO_BGC_SURFACE_NRT_015_016` is explicitly under review,
  not a verified production report input. The OLCI/ABI identities, grid spacing,
  footprints and delivery distinction come from the June 2026 product manual.
  Actual-file quality, runtime access and applicable terms still require review.
  The official service-terms page returned an automated-access 403; its canonical
  URL was confirmed by the official citation guide, not treated as legal clearance.
- Do not add Earthdata Login or SeaDAS as measurement providers. They are an
  access service and processing software. Do not label speculative sharp-SST IDs
  as active just because the report schema recognizes them: the source-grid
  contracts reject those unqualified feeds before a provider request.

Official references checked:

- [NOAA AFAI metadata](https://cwcgom.aoml.noaa.gov/erddap/info/noaa_aoml_atlantic_oceanwatch_AFAI_7D/index.html)
- [MET Norway licensing](https://api.met.no/doc/License)
- [EMODnet Bathymetry](https://emodnet.ec.europa.eu/en/bathymetry),
  [service documentation](https://emodnet.ec.europa.eu/en/emodnet-web-service-documentation),
  [terms and attribution](https://emodnet.ec.europa.eu/en/terms-use-emodnet-online-services-data-and-data-products)
- [Copernicus product manual](https://documentation.marine.copernicus.eu/PUM/CMEMS-MOB-PUM-015-016.pdf),
  [quality document](https://documentation.marine.copernicus.eu/QUID/CMEMS-MOB-QUID-015-016.pdf),
  [citation requirements](https://help.marine.copernicus.eu/en/articles/4444611-how-to-cite-copernicus-marine-products-and-services)

The public page exposes only provider documentation and approved product names,
not infrastructure or storage identifiers. No credentials or new acquisition path
were introduced. Run `scripts/test_sources_page.cjs` against the loopback preview
alongside the static validator and artifact build before publication.

Local verification passed: 320, 390 and 1280 CSS-pixel widths at 100% and 200%
root text size, no horizontal overflow, intact credits and source links, accessible
SVG titles/descriptions, keyboard pause/resume, reduced-motion changes and no-script
readability. Mobile screenshots were visually reviewed. Static validation passed
for 68 pages with zero warnings; the local Azure artifact contains 80 public files.
These are browser-engine checks, not physical-device testing or a production deployment.
