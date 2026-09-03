# Readability Index — backend

One nightly/monthly job, no database. It writes a static JSON file that the site
and the app both read, so the two can never disagree about the number.

## Run

    node backend/build-readability.mjs                  # trailing 30 days
    node backend/build-readability.mjs --month 2026-07  # one published month

Node 18+. No dependencies. Output: `data/readability.json`.

## Schedule

The site does **not** update itself. It renders whatever `data/readability.json`
contains at deploy time. Two cron entries, both UTC:

    # monthly index — 1st of the month, for the month that just ended
    10 07 1 * *  cd /srv/bluewater && node backend/build-readability.mjs --month "$(date -u -d 'last month' +%Y-%m)" \
                   && cp data/readability.json "data/readability/$(date -u -d 'last month' +%Y-%m).json" \
                   && ./deploy.sh

    # trailing strip — daily
    10 07 * * *  cd /srv/bluewater && node backend/build-readability.mjs && ./deploy.sh

07:10 UTC, not 00:00: MUR posts the previous day's L4 analysis on a lag, and a
job that runs at midnight on the 1st will silently miss the last day of the
month. Check `time` coverage on the dataset info page before trusting a run.

If a run fails, it exits non-zero and leaves the previous file in place. The
site then keeps showing the last month it actually counted, and says so.

## What the site does with it

| `source` in the file | Card title | Stamp | Sub-line tense |
|---|---|---|---|
| absent / `illustration` | Sample month, not a real one — <region> | ILLUSTRATION | "We **will** publish that count" |
| `measured` | July 2026 — <region> | MEASURED · posted 1 Aug | "We publish that count" |

If `window.month` is not the last complete month, the method line opens with
"August 2026 hasn't posted yet; this is the last month we counted." — the page
never implies a month it doesn't have.

## Definition (the part that must not move)

Measured from `analysis_error` on `jplMURSST41`, not from the SST field: MUR is a
gap-free L4 analysis, so coverage measured off SST is 100% every day and means
nothing. `analysis_error` rises where the analysis had no clear infrared pass.

- observed cell: `analysis_error <= 0.4 °C`
- clear day: ≥ 70% of region cells observed
- partial day: ≥ 25%
- clouded day: below that

These thresholds are a published choice. They live in one constant
(`THRESHOLDS`), they ship inside the JSON, and the site prints them under the
graphic. Changing them changes the published definition — version it, don't
quietly retune it.

Null cells (land, no data) are excluded from the denominator. They are not
clouds.

## History

Keep every month as `data/readability/YYYY-MM.json`. That archive is the
accuracy record the brand promises to publish, and it is the only thing here
that accumulates into a moat.
