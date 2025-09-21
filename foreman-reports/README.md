# Foreman Daily Reports (Next.js, ready for Vercel)

A lightweight, offline-friendly web app for renovation foremen:
- Per-category progress 0–100%
- Photos, obstacles, notes, manpower, safety
- Materials required (with items and needed-by dates)
- Auto weather lookup from device location (Open-Meteo)
- Export PDF (single or all) + Export JSON
- Saves locally on device (localStorage)

## Local dev
```bash
npm install
npm run dev
# open http://localhost:3000
```

## Deploy to Vercel (recommended)
1. Create a new **GitHub** repository and push this folder to it.
2. Go to https://vercel.com/new → **Import Git Repository** → select your repo.
3. Keep defaults (Framework: Next.js). Click **Deploy**.
4. You’ll get a public URL like `https://foreman-reports.vercel.app`.

### Install on your phone
- Open the URL on your phone.
- iPhone (Safari): Share → Add to Home Screen.
- Android (Chrome): Menu → Install App / Add to Home Screen.

> Tip: Grant location permission when tapping the 📍 button to auto-fill weather.

## Notes
- All data is saved locally on each device (no backend). Export JSON if you want to aggregate later.
- PDF generation is client-side; if very large photo sets fail, try exporting entries one-by-one.
