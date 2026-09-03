/**
 * GET /api/readability?month=2026-07[&region=mid-atlantic-canyons]
 *
 * Returns the canonical readability contract (see backend/azure-endpoint.md)
 * straight from the table that records region-days. Read-only.
 *
 * App settings required:
 *   SQL_CONNECTION_STRING   Azure SQL connection string, read-only login
 *   ALLOWED_ORIGIN          e.g. https://bluewatermarlin.com
 *
 * Dependency: mssql  ->  npm i mssql
 */

const sql = require("mssql");

// Published definition. These four numbers ARE the product claim — they must
// match backend/build-readability.mjs and the copy under the graphic.
const THRESHOLDS = { observedErrorMaxC: 0.4, clearMinFraction: 0.70, partialMinFraction: 0.25 };

const DEFINITION = {
  observed: `analysis_error <= ${THRESHOLDS.observedErrorMaxC} °C`,
  clear: `>= ${Math.round(THRESHOLDS.clearMinFraction * 100)}% of region cells observed`,
  partial: `>= ${Math.round(THRESHOLDS.partialMinFraction * 100)}% of region cells observed`,
  clouded: "below that"
};

let poolPromise;
function pool() {
  if (!poolPromise) poolPromise = new sql.ConnectionPool(process.env.SQL_CONNECTION_STRING).connect();
  return poolPromise;
}

function lastCompleteMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function stateFor(fraction) {
  return fraction >= THRESHOLDS.clearMinFraction ? "clear"
       : fraction >= THRESHOLDS.partialMinFraction ? "partial"
       : "clouded";
}

module.exports = async function (context, req) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
    "Cache-Control": "public, max-age=3600"
  };

  const month = /^\d{4}-\d{2}$/.test(req.query.month || "") ? req.query.month : lastCompleteMonth();
  const monthStart = `${month}-01`;

  try {
    const p = await pool();
    const result = await p.request()
      .input("monthStart", sql.Date, monthStart)
      .input("region", sql.NVarChar, req.query.region || null)
      .query(`
        SELECT  CONVERT(char(10), d.pass_date, 23)                        AS date,
                r.slug                                                    AS region_id,
                r.name                                                    AS region_name,
                CAST(d.observed_cells AS float) / NULLIF(d.total_cells,0) AS observed_fraction,
                d.total_cells                                             AS cells,
                d.mean_analysis_error_c                                   AS mean_error
        FROM    readability_day d
        JOIN    region r ON r.id = d.region_id
        WHERE   d.pass_date >= @monthStart
          AND   d.pass_date <  DATEADD(month, 1, @monthStart)
          AND   (@region IS NULL OR r.slug = @region)
        ORDER BY r.slug, d.pass_date
      `);

    const rows = result.recordset;

    // A month with holes is not a published month. Say nothing rather than
    // half a number.
    const expectedDays = new Date(Date.UTC(+month.slice(0,4), +month.slice(5,7), 0)).getUTCDate();
    if (!rows.length) {
      context.res = { status: 404, headers, body: JSON.stringify({ error: "month not counted", month }) };
      return;
    }

    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(r.region_id)) groups.set(r.region_id, { id: r.region_id, name: r.region_name, days: [] });
      const fraction = r.observed_fraction === null ? 0 : r.observed_fraction;
      groups.get(r.region_id).days.push({
        date: r.date,
        state: stateFor(fraction),
        observedFraction: +fraction.toFixed(3),
        meanAnalysisErrorC: r.mean_error === null ? null : +Number(r.mean_error).toFixed(3),
        cells: r.cells
      });
    }

    const regions = [...groups.values()]
      .filter(g => g.days.length === expectedDays)          // complete months only
      .map(g => ({
        ...g,
        readableDays: g.days.filter(d => d.state === "clear").length,
        partialDays: g.days.filter(d => d.state === "partial").length,
        cloudedDays: g.days.filter(d => d.state === "clouded").length,
        totalDays: g.days.length
      }));

    if (!regions.length) {
      context.res = { status: 404, headers, body: JSON.stringify({ error: "month incomplete", month, expectedDays }) };
      return;
    }

    context.res = {
      status: 200,
      headers,
      body: JSON.stringify({
        source: "measured",
        dataset: "jplMURSST41 (NASA JPL MUR L4 SST)",
        server: "coastwatch.pfeg.noaa.gov/erddap",
        variable: "analysis_error",
        definition: DEFINITION,
        window: { kind: "month", month },
        builtAt: new Date().toISOString(),
        defaultRegion: regions[0].id,
        regions
      })
    };
  } catch (e) {
    context.log.error(e);
    context.res = { status: 502, headers, body: JSON.stringify({ error: "readability unavailable" }) };
  }
};
