# Serving the readability record from Azure

The page fetches its numbers in the browser, so it can reach your Azure endpoint
even where this build environment can't reach NOAA. Set the endpoint in the
page's Tweaks panel (**Data → Readability endpoint URL**) or pass
`readability-url` when the component is embedded. If the call fails for any
reason, the page silently falls back to `data/readability.json` and stays
stamped ILLUSTRATION — it never shows unverified numbers as measured.

## Two ways to wire it

**A. Azure Function in front of the database (recommended).**
An HTTP-triggered function with a read-only connection string, returning JSON.
The database credential stays server-side; the page holds only a public URL.

**B. Static JSON in Blob Storage.**
The cron job in `backend/README.md` writes `readability.json` and uploads it to
a `$web` container or a public blob. Cheapest option, no compute, and the file
is cacheable at the CDN. Use this unless you need per-request querying.

Either way the page needs CORS on the response:

    Access-Control-Allow-Origin: https://bluewatermarlin.com
    Cache-Control: public, max-age=3600

## What the endpoint may return

The adapter accepts either shape.

**1. The canonical contract** — identical to `backend/build-readability.mjs`
output. Preferred, because the definition travels with the number:

```json
{
  "source": "measured",
  "dataset": "jplMURSST41 (NASA JPL MUR L4 SST)",
  "variable": "analysis_error",
  "definition": { "observed": "analysis_error <= 0.4 °C", "clear": ">= 70% of region cells observed", "partial": ">= 25% of region cells observed", "clouded": "below that" },
  "window": { "kind": "month", "month": "2026-07" },
  "builtAt": "2026-08-01T07:10:00Z",
  "defaultRegion": "mid-atlantic-canyons",
  "regions": [{
    "id": "mid-atlantic-canyons",
    "name": "Mid-Atlantic canyons",
    "days": [{ "date": "2026-07-01", "state": "clear", "observedFraction": 0.83 }],
    "readableDays": 19, "partialDays": 6, "cloudedDays": 6, "totalDays": 31
  }]
}
```

**2. Flat rows straight out of a table** — one row per region-day. This is the
shape a `SELECT` gives you, and the shape an Azure Function returns by default:

```json
[
  { "date": "2026-07-01", "region": "Mid-Atlantic canyons", "observedFraction": 0.83 },
  { "date": "2026-07-02", "region": "Mid-Atlantic canyons", "observedFraction": 0.12 }
]
```

Also unwrapped automatically: `{ "value": [...] }` (Azure Table / Cosmos),
`{ "rows": [...] }`, `{ "days": [...] }`.

Column names are matched case-insensitively, with these accepted spellings:

| Field | Accepted names |
|---|---|
| date | `date`, `day`, `passDate`, `pass_date`, `observedDate`, `timestamp`, `time` |
| region | `region`, `regionName`, `region_name`, `area` |
| fraction | `observedFraction`, `observed_fraction`, `coverage`, `clearFraction`, `observedPct` |
| state | `state`, `status`, `readability` |

Rules the adapter applies:

- A fraction above 1 is treated as a percentage and divided by 100.
- If `state` is absent it is derived from the fraction at the published
  thresholds: ≥ 0.70 clear, ≥ 0.25 partial, else clouded. Keep those thresholds
  in one place — if the database computes state itself, it must use the same
  numbers, or the site and the app will disagree.
- `clear pass` / `observed` normalise to `clear`; `cloudy` / `cloudedOut` to
  `clouded`.
- Days sort by date; the month shown in the card comes from the first date.

## SQL that produces shape 2

Assuming a table of region-days with an observed-cell count and a total:

```sql
SELECT  CONVERT(char(10), d.pass_date, 23)  AS date,
        r.name                              AS region,
        CAST(d.observed_cells AS float)
          / NULLIF(d.total_cells, 0)        AS observedFraction
FROM    readability_day d
JOIN    region r ON r.id = d.region_id
WHERE   d.pass_date >= @monthStart
  AND   d.pass_date <  DATEADD(month, 1, @monthStart)
ORDER BY d.pass_date;
```

Store `observed_cells` and `total_cells`, not a pre-rounded percentage. The
percentage is a presentation choice; the counts are the record, and the sample
size has to be publishable alongside the number.

## One thing to keep honest

`source: "measured"` is what flips the page into present tense and drops the
ILLUSTRATION stamp. Only return it for months you actually counted. An endpoint
that returns an empty or partial month should return HTTP 404 or an empty array
rather than a month with missing days — the page will fall back and say the
month hasn't posted yet, which is the true statement.
