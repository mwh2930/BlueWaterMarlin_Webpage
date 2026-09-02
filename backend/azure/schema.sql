-- BlueWater Marlin — readability record
-- Two tables. The record is counts, never a rounded percentage: the sample size
-- has to be publishable next to the number.

IF OBJECT_ID('dbo.region') IS NULL
CREATE TABLE dbo.region (
  id        INT IDENTITY(1,1) PRIMARY KEY,
  slug      NVARCHAR(64)  NOT NULL UNIQUE,
  name      NVARCHAR(128) NOT NULL,
  lat_min   DECIMAL(6,3)  NOT NULL,
  lat_max   DECIMAL(6,3)  NOT NULL,
  lon_min   DECIMAL(7,3)  NOT NULL,
  lon_max   DECIMAL(7,3)  NOT NULL,
  active    BIT           NOT NULL DEFAULT 1
);

IF OBJECT_ID('dbo.readability_day') IS NULL
CREATE TABLE dbo.readability_day (
  region_id              INT      NOT NULL REFERENCES dbo.region(id),
  pass_date              DATE     NOT NULL,
  observed_cells         INT      NOT NULL,
  total_cells            INT      NOT NULL,
  mean_analysis_error_c  DECIMAL(6,3) NULL,
  -- the definition in force when this row was written; never retune history
  observed_error_max_c   DECIMAL(4,2) NOT NULL DEFAULT 0.40,
  ingested_at            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_readability_day PRIMARY KEY (region_id, pass_date)
);

MERGE dbo.region AS t
USING (VALUES
  ('mid-atlantic-canyons','Mid-Atlantic canyons', 36.2, 39.6, -75.2, -71.0),
  ('hatteras',            'Hatteras',             34.0, 36.5, -76.0, -73.0),
  ('gulf-loop',           'Gulf loop current',    25.0, 29.5, -90.0, -84.0),
  ('sw-florida-stream',   'South Florida Stream', 24.0, 27.5, -80.5, -78.0)
) AS s (slug, name, lat_min, lat_max, lon_min, lon_max)
ON t.slug = s.slug
WHEN NOT MATCHED THEN INSERT (slug, name, lat_min, lat_max, lon_min, lon_max)
  VALUES (s.slug, s.name, s.lat_min, s.lat_max, s.lon_min, s.lon_max);

-- Read-only login used by the read API. Run in the database, not master.
-- CREATE USER readability_reader WITH PASSWORD = '<pw>';
-- ALTER ROLE db_datareader ADD MEMBER readability_reader;
