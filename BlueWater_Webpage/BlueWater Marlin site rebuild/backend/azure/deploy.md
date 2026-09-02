# Deploying the readability backend

Two functions in one Function App:

- `ingest/` — timer, 07:10 UTC daily. Pulls NOAA, writes region-days to Azure SQL.
- `readability/` — HTTP GET `/api/readability?month=YYYY-MM`. Read-only, CORS-enabled, what the site fetches.

The site itself stays static. It fetches the HTTP function in the browser and
falls back to `data/readability.json` if the call fails.

## Where these commands run

**Not in a chat environment.** A Claude Projects or Claude.ai session has no
Azure credentials and no shell — it can write and review this code, which is
worth doing, but `az` has to run somewhere with your login. Two supported
places:

1. **Your machine** — `az login`, then the commands below. Fastest for the first deploy.
2. **GitHub Actions** — `.github/workflows/deploy-readability.yml` in this repo.
   Recommended for everything after the first deploy: every change is a commit,
   the credential lives in repo secrets, and nobody deploys from a laptop at 11pm.

## First deploy

```bash
RG=bluewater-rg
LOC=eastus
SQLSRV=bluewater-sql
APP=bluewater-readability
STORAGE=bluewaterfuncsa$RANDOM

az group create -n $RG -l $LOC

# Azure SQL — serverless tier is plenty; this table is tiny
az sql server create -g $RG -n $SQLSRV -l $LOC -u bwadmin -p '<strong-password>'
az sql db create -g $RG -s $SQLSRV -n bluewater --edition GeneralPurpose \
  --compute-model Serverless --family Gen5 --capacity 1 --auto-pause-delay 60
az sql server firewall-rule create -g $RG -s $SQLSRV -n allow-azure \
  --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0

# schema + regions
sqlcmd -S $SQLSRV.database.windows.net -d bluewater -U bwadmin -P '<strong-password>' \
  -i backend/azure/schema.sql

# Function App (Node 20, consumption plan)
az storage account create -g $RG -n $STORAGE -l $LOC --sku Standard_LRS
az functionapp create -g $RG -n $APP --storage-account $STORAGE \
  --consumption-plan-location $LOC --runtime node --runtime-version 20 --functions-version 4

az functionapp config appsettings set -g $RG -n $APP --settings \
  SQL_CONNECTION_STRING="Server=tcp:$SQLSRV.database.windows.net,1433;Database=bluewater;User ID=bwadmin;Password=<strong-password>;Encrypt=true;Connection Timeout=30;" \
  ALLOWED_ORIGIN="https://bluewatermarlin.com" \
  INGEST_BACKFILL_DAYS=3

az functionapp cors add -g $RG -n $APP --allowed-origins https://bluewatermarlin.com

cd backend/azure && npm install && func azure functionapp publish $APP
```

## Verify, in this order

```bash
# 1. ingest ran and wrote rows
az functionapp log tail -g $RG -n $APP        # look for "ingest done — N region-days written"

# 2. the API answers
curl "https://$APP.azurewebsites.net/api/readability?month=$(date -u -d 'last month' +%Y-%m)"

# 3. CORS is set for the browser, not just curl
curl -I -H "Origin: https://bluewatermarlin.com" \
  "https://$APP.azurewebsites.net/api/readability"   # expect access-control-allow-origin
```

A fresh database has no history, so step 2 correctly returns **404 month
incomplete** until a month has been counted end to end. To publish a past month
immediately, backfill it:

```bash
az functionapp config appsettings set -g $RG -n $APP --settings INGEST_BACKFILL_DAYS=40
# trigger the timer once, then set it back to 3
az functionapp config appsettings set -g $RG -n $APP --settings INGEST_BACKFILL_DAYS=3
```

## Point the site at it

Set the page's Tweaks field **Data → Readability endpoint URL** to:

    https://<app>.azurewebsites.net/api/readability

Or pass `readability-url` when the component is embedded. Nothing else on the
page changes; the section flips to MEASURED and present tense on its own.

## Costs and cautions

- Consumption plan + serverless SQL with 60-minute auto-pause: a few dollars a
  month at this volume. The daily ingest downloads roughly 90×90 cells per
  region per day, not the full 1 km grid.
- The read API uses a **read-only** SQL login. The ingest function is the only
  writer. Never put a connection string in the page or a Tweak.
- Rate-limit or cache the public endpoint at the CDN (`max-age=3600` is already
  on the response). The data changes once a day.
- If ERDDAP goes stale or moves, ingest logs the failure per region and leaves
  existing rows alone. The site keeps showing the last month it counted and says
  the current one hasn't posted.
