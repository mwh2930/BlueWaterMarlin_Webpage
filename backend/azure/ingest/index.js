/**
 * Daily ingest — 07:10 UTC.
 *
 * Runs inside Azure, where outbound HTTPS to NOAA works. For each active region
 * it counts how much of yesterday's water a satellite actually resolved and
 * upserts one row per region-day.
 *
 * Measured from analysis_error, NOT from the SST field: jplMURSST41 is a
 * gap-free L4 analysis, so coverage measured off SST is 100% every day and
 * means nothing. analysis_error rises where the analysis had no clear IR pass.
 *
 * App settings: SQL_CONNECTION_STRING (write login)
 * Optional:     INGEST_BACKFILL_DAYS (default 3 — re-counts recent days,
 *               because MUR revises the most recent passes)
 */

const sql = require("mssql");

const ERDDAP = "https://coastwatch.pfeg.noaa.gov/erddap/griddap/jplMURSST41.json";
const OBSERVED_ERROR_MAX_C = 0.4;   // the published definition; do not retune history
const NATIVE_DEG = 0.01;
const TARGET_CELLS = 90;            // per axis — never download more than you count

let poolPromise;
function pool() {
  if (!poolPromise) poolPromise = new sql.ConnectionPool(process.env.SQL_CONNECTION_STRING).connect();
  return poolPromise;
}

function stride(min, max) {
  return Math.max(1, Math.ceil((max - min) / NATIVE_DEG / TARGET_CELLS));
}

function isoDay(d) { return d.toISOString().slice(0, 10); }

async function countRegion(region, start, end, log) {
  const sLat = stride(+region.lat_min, +region.lat_max);
  const sLon = stride(+region.lon_min, +region.lon_max);
  const q =
    `analysis_error[(${isoDay(start)}T09:00:00Z):1:(${isoDay(end)}T09:00:00Z)]` +
    `[(${region.lat_min}):${sLat}:(${region.lat_max})]` +
    `[(${region.lon_min}):${sLon}:(${region.lon_max})]`;

  const res = await fetch(`${ERDDAP}?${encodeURIComponent(q)}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`ERDDAP ${res.status} for ${region.slug}: ${(await res.text()).slice(0, 200)}`);

  const { table } = await res.json();
  const iTime = table.columnNames.indexOf("time");
  const iErr = table.columnNames.indexOf("analysis_error");
  if (iTime < 0 || iErr < 0) throw new Error(`unexpected columns: ${table.columnNames}`);

  const byDay = new Map();
  for (const row of table.rows) {
    const err = row[iErr];
    if (err === null) continue;                       // land / no data — not a cloud
    const day = String(row[iTime]).slice(0, 10);
    const b = byDay.get(day) || { total: 0, observed: 0, errSum: 0 };
    b.total++;
    b.errSum += err;
    if (err <= OBSERVED_ERROR_MAX_C) b.observed++;
    byDay.set(day, b);
  }
  log(`${region.slug}: ${byDay.size} days`);
  return byDay;
}

module.exports = async function (context) {
  const log = (m) => context.log(m);
  const backfill = Math.max(1, parseInt(process.env.INGEST_BACKFILL_DAYS || "3", 10));
  const end = new Date(Date.now() - 24 * 3600e3);     // yesterday; today's pass posts late
  const start = new Date(end.getTime() - (backfill - 1) * 24 * 3600e3);

  const p = await pool();
  const regions = (await p.request().query("SELECT id, slug, lat_min, lat_max, lon_min, lon_max FROM dbo.region WHERE active = 1")).recordset;

  let written = 0, failed = 0;
  for (const region of regions) {
    try {
      const byDay = await countRegion(region, start, end, log);
      for (const [date, b] of byDay) {
        await p.request()
          .input("region_id", sql.Int, region.id)
          .input("pass_date", sql.Date, date)
          .input("observed_cells", sql.Int, b.observed)
          .input("total_cells", sql.Int, b.total)
          .input("mean_error", sql.Decimal(6, 3), b.total ? b.errSum / b.total : null)
          .input("max_err", sql.Decimal(4, 2), OBSERVED_ERROR_MAX_C)
          .query(`
            MERGE dbo.readability_day AS t
            USING (SELECT @region_id AS region_id, @pass_date AS pass_date) AS s
              ON t.region_id = s.region_id AND t.pass_date = s.pass_date
            WHEN MATCHED THEN UPDATE SET
              observed_cells = @observed_cells, total_cells = @total_cells,
              mean_analysis_error_c = @mean_error, observed_error_max_c = @max_err,
              ingested_at = SYSUTCDATETIME()
            WHEN NOT MATCHED THEN INSERT
              (region_id, pass_date, observed_cells, total_cells, mean_analysis_error_c, observed_error_max_c)
              VALUES (@region_id, @pass_date, @observed_cells, @total_cells, @mean_error, @max_err);
          `);
        written++;
      }
    } catch (e) {
      failed++;
      context.log.error(`${region.slug}: ${e.message}`);   // one region failing must not void the run
    }
  }
  log(`ingest done — ${written} region-days written, ${failed} region(s) failed`);
};
