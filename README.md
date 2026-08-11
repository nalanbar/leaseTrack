# LeaseTrack

A small web app for tracking mileage pace against a car lease's mileage
allowance — built for a 3-year / 15,000-mi-per-year lease, but works for any
term length and annual allowance.

No backend, no build step, no dependencies: it's static HTML/CSS/JS that
stores your lease details and odometer readings in the browser's
`localStorage`.

## Features

- **Miles/day allowed** — your contractual pace: total allowed miles ÷ total
  lease days.
- **Miles/day actual** — your real pace so far: miles driven ÷ days elapsed,
  from odometer readings you log.
- **Miles/day remaining budget** — how many miles/day you can still drive
  without going over: miles left ÷ days left in the lease.
- **Recent pace** — the daily rate between your two most recent readings, so
  a recent road trip (or a quiet month) shows up before it skews the
  lifetime average.
- **Pace vs. schedule** — compares % of miles used to % of lease term
  elapsed, so you can see at a glance if you're ahead of or under pace.
- **Projected ending mileage** — where your odometer lands at lease-end if
  your current pace holds, and the projected over/under vs. your allowance.
- **Estimated overage cost** — if you enter a per-mile overage rate, the
  projected cost if that pace holds.
- A pace chart plotting your actual mileage against a straight-line
  "allowed pace" reference, with a hover tooltip per reading.
- A mileage log (date + odometer) you can add to, delete from, export as
  JSON, and re-import.

## Using it

1. Open the app and click **Get started** (or **Settings**) to enter your
   lease start date, term length, annual mileage allowance, starting
   odometer, and (optionally) a per-mile overage rate.
2. Add odometer readings as you go, via **Mileage log → Add reading**.
3. The dashboard and chart update from those readings — no reading yet means
   most stats show `—` until you log your first one.

All data stays in your browser (`localStorage`). Nothing is sent to a
server. Use **Export data** to back it up or move it to another browser/
device, and **Import data** to restore it.

## Running locally

No build step — serve the folder with any static file server, for example:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying to GitHub Pages

This repo includes `.github/workflows/deploy.yml`, which publishes the site
to GitHub Pages on every push to `main`. One-time setup after your first
push to `main`:

1. Go to the repo's **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main` (or re-run the "Deploy to GitHub Pages" workflow from the
   **Actions** tab) — the site will be published at
   `https://<your-username>.github.io/<repo-name>/`.

## Roadmap: pulling mileage from a vehicle API

Right now odometer readings are entered manually. Automatically pulling the
current odometer from your car (e.g. via an aggregator like Smartcar, which
supports many manufacturers, or a manufacturer-specific API) is a natural
next step, but it needs more than static hosting can provide safely:

1. **A backend is required.** Reading live vehicle data means completing an
   OAuth flow and calling the provider's API with a client secret. A secret
   can't live in this repo's client-side JS (anyone can read it from the
   deployed site) — it has to be held by a small server you control, e.g. a
   single serverless function that completes the OAuth exchange and returns
   just the odometer value to the browser.
2. **Register an app** with the vehicle API provider to get OAuth
   credentials, and implement the token exchange on that backend.
3. **Add a "sync from vehicle" action** in the UI that calls your backend,
   gets back `{ date, odometer }`, and adds it as a log entry the same way
   a manual entry is added today (see the `entryForm` submit handler in
   `js/app.js`) — so the rest of the app (stats, chart, log) needs no
   changes.

## Project structure

```
index.html            Markup for the dashboard, settings dialog, log
css/styles.css         All styling (light/dark aware)
js/calculations.js     Pure lease/mileage math — no DOM access
js/storage.js          localStorage load/save
js/chart.js            SVG pace chart with hover tooltip
js/format.js           Number/date/currency formatting helpers
js/app.js              Wires up the DOM, event handlers, rendering
```
