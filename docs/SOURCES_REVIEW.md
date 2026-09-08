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
