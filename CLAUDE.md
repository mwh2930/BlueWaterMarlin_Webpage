# BlueWater Marlin — project properties

Marketing site for **B.I.L.L.** (Breaks. Isotherms. Layers. Location.), an
offshore satellite chart app. Publisher: Red Oak Media House.

## Files

| Path | What it is |
|---|---|
| `index.html` | The site. Single Design Component, the deliverable. |
| `Agent Review.dc.html` | Marketing-agent and market-agent review of the site. Update when the site changes materially. |
| `assets/hero.jpg` | Hero photo (marlin, split water). Extracted from the original inline data URI — keep it a file, never re-inline. |
| `data/readability.json` | Readability Index data the site fetches. `source: "illustration"` until a real month is counted. |
| `backend/build-readability.mjs` | Local job: NOAA ERDDAP → `data/readability.json`. `--month YYYY-MM` for a published month. |
| `backend/azure/` | Deployed backend: `ingest/` timer + `readability/` HTTP API + `schema.sql` + `deploy.md`. |
| `backend/azure-endpoint.md` | The data contract and the adapter's accepted field spellings. |
| `uploads/bluewater-apple-site.html` | The user's original file. Reference only — do not edit or rebuild from it. |

## Visual system

Apple-reference marketing page: centered text, generous vertical rhythm, two
background tones, dark tiles reserved for the two argument sections.

- **Type**: Inter (300/400/600/700). Body 17px, `letter-spacing:-.374px`.
  h1 `clamp(42px,7vw,62px)`, h2 `clamp(30px,4.6vw,42px)`, both 600 weight and
  negative tracking. Eyebrows 13px/600/uppercase/`.06em`, in accent blue.
- **Color**: canvas `#ffffff`, alternate tile `#f5f5f7`, dark tile `#1d1d1f`.
  Ink `#1d1d1f`, secondary `#6e6e73`, tertiary `#86868b`, hairline `#d2d2d7`.
  Accent `#0071e3` on light, `#2997ff` on dark. Dark-tile secondary `#a1a1a6`.
- **Chart colors** (canvas ramps): ocean rainbow, cold `#182c6e` → hot `#be342c`.
  Readability cells: clear `#0071e3`, partial `#9dc7f0`, clouded `#d2d2d7`.
- **Shape**: cards and chart frames `border-radius:18px`, small cards 14px,
  buttons `border-radius:980px` with `min-height:44px`.
- **Spacing**: sections `padding:88px 0` (96px on dark tiles), inner container
  `max-width:940px; padding:0 22px`. Measure caps: `sub` 40–44ch, captions 56ch,
  list items 33ch.
- **Motion**: none. Scroll-reveal was deliberately removed — content is present
  at first paint. Don't reintroduce fade-in-on-scroll.
- **No emoji.** Icons are the existing 24px stroke SVGs (`stroke-width:1.6`,
  round caps) — reuse them, don't draw new illustrative SVGs.

## Code conventions

- Everything is Design Components, inline styles only, no CSS classes. Only
  `@font-face` / resets / `@keyframes` belong in `<helmet><style>`.
- The four chart canvases are painted from the logic class. Repaint from the
  **handlers** (`setState(…, cb)`) and keep ref callbacks created once in the
  constructor — `componentDidUpdate` did not fire reliably here.
- Static copy and styles stay as literal template markup. `{{ }}` holes only for
  genuinely live values (chart state, split position, readability strings).
- Tweaks props: `readabilityUrl` (Data), `defaultLayer` (Chart),
  `showReadability` (Sections). Never add a secret or connection string as a prop.

## Copy rules (these are hard)

Voice is defined by the `bluewater-brand-voice` skill; `bluewater-claim-check`
reviews drafts. The non-negotiables that already shape this page:

- Never imply the product finds fish. It shows water.
- No accuracy figure, percentage or comparative until it is published with its
  sample size and method.
- Never "real-time" for satellite ocean data. These are daily passes.
- Every capability states its limit; every limit states what we do about it.
- No named competitor, no competitor price or rating, no manufactured urgency.
- No exclamation marks, no hype vocabulary, no fishing puns.
- Unshipped features stay in future tense. The Readability section's tense is
  driven by data: "We will publish" while `source` is `illustration`,
  "We publish" only when `source === "measured"`.
- Any surface offering the subscription carries title, length, price, renewal
  terms, cancellation path, Terms and Privacy.
- User-supplied copy is used verbatim. Format it; don't rewrite it.

## Market position (from `offshore-fishing-market`)

The category sells a retrospective observation to someone making a forward,
irreversible ~$2,000 decision the night before. Forward projection is the
argument and stays above the fold. Audience is heavily iOS and offline past ~30
miles. Answered on the page: forward projection, observed-vs-fill honesty,
Readability Index, season-friendly pricing. **Still open:** an offline /
download-before-you-leave screen, and an App Store button with the chart shown
on a phone. The unbuilt moat is closing the loop between what was predicted and
what was caught.

## Working agreements

- Charts on the page are illustrations and must stay labelled as such.
- The readability number and the graphic derive from the same array — never
  hardcode a count in a headline.
- Thresholds (0.4 °C, 70%, 25%) are a published definition. They live in one
  constant in the backend and print under the graphic. Don't quietly retune.
- Deploys are the user's; write the code and the commands, don't assume a shell.
- Keep the two review grades in `Agent Review.dc.html` current with the site.
