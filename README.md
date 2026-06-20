# NICRA · Natural-Farming · Agri-Drone · Seed-Hub uploader

A standalone little web app that takes a **superadmin-side scrape** (one file holding data for many
KVKs) of these forms, lets you review it, and pushes it into the database — one row at a time, each
to its own KVK.

It does **not** touch the main site. Upload → preview → fix any unmatched KVKs → push.

## Why it's different from the per-KVK uploader

The earlier "Uploader-Updater" tool took **one KVK per file** (you picked the KVK once). This data is
the opposite: it comes from the **superadmin** side, so **every row carries its own "KVK Name"**
(e.g. `Kvk Rohtas`, `Krishi Vigyan Kendra, Nawada`, `RPCAU-KVK Saran`). The tool therefore resolves
the KVK **per row** by name. Anything it can't confidently match is shown with a dropdown so you can
pick the right KVK before pushing (it never guesses onto the wrong KVK).

## Forms it handles (sheet → model)

| Group | Scrape sheet | Model |
|---|---|---|
| NICRA | View_Intervention | `nicraIntervention` |
| NICRA | Revenue_generated | `nicraRevenueGenerated` |
| NICRA | View_Custom_Hiring_of_Farm | `nicraFarmImplement` |
| NICRA | View_Village_Climate_Risk_ | `nicraVcrmc` |
| NICRA | View_Soil_Health_Card | `nicraSoilHealthCard` |
| NICRA | View_Convergence_Programme | `nicraConvergenceProgramme` |
| NICRA | View_Dignitaries_Visited | `nicraDignitariesVisited` |
| NICRA | View_Investigator | `nicraPiCopi` |
| NICRA | View_Any_Other_Program | `kvkOtherProgramme` |
| Natural Farming | Geographical_Information | `geographicalInfo` |
| Natural Farming | Natural_Farming | `physicalInfo` |
| Natural Farming | Demonstration_Information | `demonstrationInfo` |
| Natural Farming | Farmer_Details (already practicing) | `demonstrationInfo` |
| Natural Farming | Beneficiaries_Details | `beneficiariesDetails` |
| Natural Farming | Soil_Information | `soilDataInformation` |
| Natural Farming | Financial_information | `financialInformation` |
| Agri-Drone | View_Agri_Drone | `kvkAgriDrone` |
| Agri-Drone | View_Agri_Drone_Demonstrat | `kvkAgriDroneDemonstration` |
| Seed Hub | View_Seed_Hub_Program | `kvkSeedHubProgram` |

## Run it

```bash
cd scrape-upload
npm install
cp .env.example .env        # then edit .env -> point DATABASE_URL at a TEST database first
npm start                   # opens http://localhost:5060
```

Open the page, drop the scraped `.json` (or `.xlsx`), review, and click **Push to database**.

Sanity-check the mappings any time (no DB, no writes):
```bash
node scripts/validate-mappings.js
```

## How it writes

- Writes **directly to Prisma**, not through the site's repositories — on purpose. This is a bulk
  historical import; the repos reject rows the scrape simply doesn't have (e.g. demonstration rows
  carry no mobile number, which the repo's required-mobile check would throw on). Direct writes are
  lenient and we control the defaults.
- **Dedup-guarded**: every row is checked against a per-form key before insert, so re-running the
  same file inserts nothing twice (shown as "already there").
- The dual-year Natural-Farming models get `year` + `reportingYearDate` filled correctly.
- A few columns have no home on the new model (e.g. a single "No. of participants" total when the
  model only stores gender/category counts). Those land in General-Male and are flagged with an
  amber warning on the row, so nothing is dropped silently. **Known assumptions** are listed below.

## Known assumptions / things to confirm

- **`Farmer_Details` and `Demonstration_Information` both map to `demonstrationInfo`** (the new site
  appears to back both with one model). The "already practicing" rows are tagged
  `activityName = "Already Practicing Natural Farming"` to keep them distinguishable.
- **FK "type" lookups are not resolved** (dignitary type, PI/Co-PI type, soil-parameter type,
  natural-farming activity, seed/fodder bank). Where a free-text column exists we stash the label
  (e.g. VIP/Expert → `remark`); otherwise it's flagged in warnings. Can be wired to resolve-or-create
  against the master tables later.
- **Single totals → General-Male** for: Custom-Hiring "farmers used", Soil-Health "farmers
  benefitted", VCRMC "members", Any-Other-Programme "participants", Physical-Info "participants".
- **Agri-Drone demonstrations** link to the KVK's Agri-Drone **intro** record — so the intro sheet
  must be imported first (the tool inserts intro before demonstrations automatically).

## Deploy (Render)

This project is **fully self-contained** — it bundles its own Prisma schema (`prisma/`) and client
(`config/prisma.js`), so it runs anywhere with no dependency on the main backend.

On [Render](https://render.com) → **New → Web Service** → connect this repo:

| Field | Value |
|---|---|
| Language | Node |
| Branch | `main` |
| Region | Singapore (same region as the Neon DB) |
| Root Directory | *(blank)* |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | Free |
| Environment Variable | `DATABASE_URL` = your Postgres URL (test DB first) |

`npm install` runs `prisma generate` automatically (a `postinstall` hook). The app reads `PORT` from
the environment (Render sets it), so no port config is needed.

> There is **no login** — anyone with the URL can use it and it writes to whatever `DATABASE_URL`
> points at. Keep it on a **test database** unless you intend writes to go live.
