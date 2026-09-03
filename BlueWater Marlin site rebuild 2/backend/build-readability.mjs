#!/usr/bin/env node
/**
 * BlueWater Marlin — Readability Index builder
 *
 * Produces data/readability.json: per-day, per-region, how much of the water
 * a satellite actually resolved over the last N days.
 *
 * Why analysis_error and not SST itself:
 *   jplMURSST41 is a gap-FREE L4 analysis. Every cell always has a value, so
 *   coverage measured off the SST field is meaningless — it is 100% every day.
 *   analysis_error is MUR's own estimated uncertainty and rises where the
 *   analysis had no clear IR observation to constrain it. Low error = observed,
 *   high error = inferred. That is the readability signal.
 *
 * Node 18+ (built-in fetch). No dependencies.
 *   node backend/build-readability.mjs > /dev/null
 */

import { writeFile, mkdir } from "node:fs/promises";

const ERDDAP = "https://coastwatch.pfeg.noaa.gov/erddap/griddap/jplMURSST41.json";
const DAYS = 30;

// --month 2026-07  -> that whole calendar month (the published Readability Index)
// no flag          -> trailing 30 days ending yesterday (the live strip)
const MONTH_ARG = (process.argv.find(a => a.startsWith("--month=")) || "").split("=")[1]
  || (process.argv[process.argv.indexOf("--month") + 1] || "").match(/^\d{4}-\d{2}$/)?.[0]
  || null;

// Thresholds are a published choice, not a natural constant. If you change
// them, change them in the copy too — the number on the site is only worth
// something if its definition is fixed and stated.
const THRESHOLDS = {
  observedErrorMaxC: 0.4,   // a cell counts as observed at or below this analysis_error (°C)
  clearMinFraction: 0.70,   // >= 70% of region cells observed -> "clear"
  partialMinFraction: 0.25  // >= 25% -> "partial", below -> "clouded"
};

const REGIONS = [
  { id: "mid-atlantic-canyons", name: "Mid-Atlantic canyons", lat: [36.2, 39.6], lon: [-75.2, -71.0] },
  { id: "gulf-loop",            name: "Gulf loop current",    lat: [25.0, 29.5], lon: [-90.0, -84.0] },
  { id: "sw-florida-stream",    name: "South Florida Stream", lat: [24.0, 27.5], lon: [-80.5, -78.0] },
  { id: "hatteras",             name: "Hatteras",             lat: [34.0, 36.5], lon: [-76.0, -73.0] }
];

const NATIVE_DEG = 0.01;      // MUR grid spacing
const TARGET_CELLS = 90;      // per axis; keep payloads small

function stride([min, max]) {
  return Math.max(1, Math.ceil((max - min) / NATIVE_DEG / TARGET_CELLS));
}

function isoDay(d) { return d.toISOString().slice(0, 10); }

async function fetchRegion(region) {
  let start, end;
  if (MONTH_ARG) {
    const [y, m] = MONTH_ARG.split("-").map(Number);
    start = new Date(Date.UTC(y, m - 1, 1));
    end   = new Date(Date.UTC(y, m, 0));                     // last day of that month
  } else {
    end = new Date(Date.now() - 24 * 3600e3);                // yesterday; today's pass may not be posted
    start = new Date(end.getTime() - (DAYS - 1) * 24 * 3600e3);
  }
  const sLat = stride(region.lat), sLon = stride(region.lon);

  const q =
    `analysis_error[(${isoDay(start)}T09:00:00Z):1:(${isoDay(end)}T09:00:00Z)]` +
    `[(${region.lat[0]}):${sLat}:(${region.lat[1]})]` +
    `[(${region.lon[0]}):${sLon}:(${region.lon[1]})]`;

  const url = `${ERDDAP}?${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${region.id}: ERDDAP ${res.status} ${await res.text()}`);

  const { table } = await res.json();
  const iTime = table.columnNames.indexOf("time");
  const iErr  = table.columnNames.indexOf("analysis_error");
  if (iTime < 0 || iErr < 0) throw new Error(`${region.id}: unexpected columns ${table.columnNames}`);

  // Bucket cells by day.
  const byDay = new Map();
  for (const row of table.rows) {
    const day = String(row[iTime]).slice(0, 10);
    const err = row[iErr];
    if (err === null) continue;                              // land / no data — not a cloud, don't count it
    const b = byDay.get(day) || { total: 0, observed: 0, errSum: 0 };
    b.total++;
    b.errSum += err;
    if (err <= THRESHOLDS.observedErrorMaxC) b.observed++;
    byDay.set(day, b);
  }

  const days = [...byDay.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([date, b]) => {
    const fraction = b.total ? b.observed / b.total : 0;
    const state = fraction >= THRESHOLDS.clearMinFraction ? "clear"
                : fraction >= THRESHOLDS.partialMinFraction ? "partial"
                : "clouded";
    return {
      date,
      state,
      observedFraction: +fraction.toFixed(3),
      meanAnalysisErrorC: +(b.errSum / Math.max(1, b.total)).toFixed(3),
      cells: b.total
    };
  });

  return {
    id: region.id,
    name: region.name,
    bbox: { lat: region.lat, lon: region.lon },
    days,
    readableDays: days.filter(d => d.state === "clear").length,
    partialDays: days.filter(d => d.state === "partial").length,
    cloudedDays: days.filter(d => d.state === "clouded").length,
    totalDays: days.length
  };
}

const regions = [];
for (const r of REGIONS) {
  try { regions.push(await fetchRegion(r)); }
  catch (e) { console.error(String(e.message || e)); }       // one region failing must not void the file
}

if (!regions.length) { console.error("no regions built; leaving existing file in place"); process.exit(1); }

const out = {
  source: "measured",
  dataset: "jplMURSST41 (NASA JPL MUR L4 SST)",
  server: "coastwatch.pfeg.noaa.gov/erddap",
  variable: "analysis_error",
  definition: {
    observed: `analysis_error <= ${THRESHOLDS.observedErrorMaxC} °C`,
    clear: `>= ${Math.round(THRESHOLDS.clearMinFraction * 100)}% of region cells observed`,
    partial: `>= ${Math.round(THRESHOLDS.partialMinFraction * 100)}% of region cells observed`,
    clouded: "below that"
  },
  windowDays: DAYS,
  builtAt: new Date().toISOString(),
  defaultRegion: regions[0].id,
  regions
};

await mkdir("data", { recursive: true });
await writeFile("data/readability.json", JSON.stringify(out, null, 2) + "\n");
console.error(`wrote data/readability.json — ${regions.map(r => `${r.id}:${r.readableDays}/${r.totalDays}`).join("  ")}`);
