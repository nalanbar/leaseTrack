# LeaseTrack

A small web app for tracking mileage pace against a car lease's mileage
allowance — built for a 3-year / 15,000-mi-per-year lease, but works for any
term length and annual allowance.

No backend, no build step, no dependencies: it's static HTML/CSS/JS that
stores your lease details and odometer readings in the browser's
`localStorage`. The background is a CSS mesh gradient (four blurred, slowly
drifting color blobs, `prefers-reduced-motion`-aware) behind frosted-glass
panels — no images, canvas, or JS animation involved.

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
- A mileage log (date + odometer) you can add to and delete from.

## Using it

1. Open the app. On the setup screen, either:
   - click **Get started** (or **Settings** in the header) to enter your
     lease start date, term length, annual mileage allowance, starting
     odometer, and (optionally) a per-mile overage rate, or
   - click **Load a sync code** or **Import JSON** to restore a lease you'd
     already set up elsewhere, instead of entering it again.
2. Add odometer readings as you go, via **Mileage log → Add reading**.
3. The dashboard and chart update from those readings — no reading yet means
   most stats show `—` until you log your first one.

All data stays in your browser (`localStorage`). Nothing is sent to a
server. Two ways to move it elsewhere, both under **Sync code** and
**Backup & data** near the bottom of the dashboard:

- **Sync code** — a short, copy-pasteable code (usually 40–64 characters)
  that carries your full lease config plus as many of your most recent
  readings as fit in that length (shown next to the code, e.g. "your 6 most
  recent readings of 15 total"). Meant for quickly moving to, or checking in
  from, another browser or device — not a full history backup, since a
  short code can't hold years of frequent readings. Paste one into the
  **Load** field to apply it (this replaces your current lease and log, with
  a confirmation first).
- **Export/Import JSON**, under **Backup & data** — a complete, unlimited
  backup of your lease and full mileage history as a downloadable file.
  This is the one to use before clearing browser data, or if you want every
  reading preserved when switching devices.

## Installing on your iPhone

LeaseTrack is a web app manifest, so Safari can add it to your home screen
as a standalone app (its own icon, no address bar, no Safari chrome):

1. Open the site in **Safari** (Chrome/other iOS browsers don't support this
   the same way — they all use Apple's WebKit under the hood, but only
   Safari exposes the Add to Home Screen action).
2. Tap the **Share** icon, then **Add to Home Screen**.
3. Launching it from the home screen icon opens it full-screen, with a
   translucent status bar and its own `LeaseTrack` name and icon.

Since data lives in `localStorage`, it's tied to *how* the page was
opened — iOS has, at various points, kept the home-screen app's storage
separate from Safari's for the same site. If your lease shows up empty in
one but not the other, use a sync code (see "Sync code" above) to move it
across rather than re-entering everything.

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

### Custom domain (leasetrack.app)

The `CNAME` file at the repo root points GitHub Pages at `leasetrack.app`.
To finish wiring it up:

1. At your domain registrar, add these DNS records for the apex domain:
   - `A` records for `@` → `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153`, `185.199.111.153`
   - (optional, IPv6) `AAAA` records for `@` → `2606:50c0:8000::153`,
     `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - (optional, for `www.leasetrack.app`) `CNAME` record for `www` →
     `<your-username>.github.io`
2. In the repo's **Settings → Pages → Custom domain**, enter `leasetrack.app`
   and save — this confirms the domain against the `CNAME` file and starts
   certificate provisioning.
3. Once DNS has propagated (usually minutes, can take longer) and GitHub
   shows the domain as verified, check **Enforce HTTPS**. `.app` domains are
   HSTS-preloaded, so browsers require HTTPS here from day one — the site
   won't be reachable over plain HTTP even before this box is checked.

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
js/sync.js             Bidirectional sync-code encode/decode (bit-packed + base64url)
js/format.js           Number/date/currency formatting helpers
js/app.js              Wires up the DOM, event handlers, rendering
manifest.webmanifest   Web app manifest (name, icons, standalone display)
icons/                 Home screen / favicon icons referenced by the manifest
CNAME                  Custom domain for GitHub Pages (leasetrack.app)
```
