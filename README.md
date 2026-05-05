# Who Got The Weather Right?

A daily ledger comparing what four major weather models (NOAA GFS, ECMWF IFS, DWD ICON, Environment Canada GEM) predicted against what the sky actually delivered. Tracks forecast accuracy across 1–14 day horizons with proper statistical confidence intervals.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Build for production

```bash
npm run build
```

Output goes to `dist/`.

## Deploy to Cloudflare Pages

### One-time setup

1. Push this folder to a GitHub repo.
2. Log in to https://dash.cloudflare.com/ and go to **Workers & Pages → Create → Pages → Connect to Git**.
3. Pick your repo. Cloudflare auto-detects Vite.
4. Confirm settings:
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node version:** 20 (set under Settings → Environment variables → `NODE_VERSION = 20` if needed)
5. Click **Save and Deploy**.

Every push to `main` thereafter auto-deploys. You'll get a URL like `forecast-accuracy.pages.dev`.

### Custom domain (optional)

In the Pages project: **Custom domains → Set up a custom domain.** Cloudflare handles DNS and TLS automatically if the domain is on Cloudflare DNS.

## Data sources

- Forecasts: [Open-Meteo](https://open-meteo.com/) (free, no key required) — pulls GFS, ECMWF IFS, DWD ICON, MSC GEM
- Historical actuals: ERA5 reanalysis via Open-Meteo's archive API
- Geocoding: Nominatim (OpenStreetMap), Open-Meteo geocoder, Zippopotam.us — chained with fallbacks

All data is stored in your browser's `localStorage`. Clearing browser data wipes the history.

## Notes

- Forecast accuracy data is built up over time. Day 1 will be empty; meaningful standings appear after ~30 verified days, "high confidence" labels around 90 days.
- Open-Meteo asks for attribution if you redistribute their data publicly.
