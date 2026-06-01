# CLAUDE.md — Golf Strokes Gained App

> This file is read by Claude Code at the start of every session. It is the source
> of truth for what we are building and how. Keep it updated as the project evolves.

## What this is

A personal golf scoring app for a single user, used on an **iPhone (iOS Safari)**,
out on the course. It tracks shots and computes **Strokes Gained (SG)** against a
**handicap-5 baseline**. The owner currently plays off 10 and is working toward 5;
the whole point of the app is to show exactly *where* strokes are being lost
(Off the Tee / Approach / Around the Green / Putting) so practice can be targeted.

Home courses played regularly: **Te Puke** and **Summerhill** (Bay of Plenty, NZ).
The app must also let the user add a new course on arrival.

## Hard constraints (do not violate)

- **No frameworks.** Plain HTML, CSS, and vanilla JavaScript only. **No React, no JSX,
  no Vue, no build step.** The owner has explicitly ruled these out. Solutions must be
  consistent, reliable, and replicable.
- **PWA, installable to the iOS home screen**, runs full-screen, works **offline**.
- **Offline is mandatory**, not a nice-to-have. Golf courses have poor cell signal.
  GPS works offline (satellite, not network) and data is stored locally, but **map
  tiles must be pre-cached** for the home courses or the map goes blank mid-round.
- Mapping: **Leaflet** + **Esri World Imagery** satellite tiles (no API key required;
  include the required attribution). Do not introduce keyed providers (Google/Mapbox)
  unless explicitly asked.
- Location: the browser **Geolocation API** in high-accuracy mode.
- Storage: **IndexedDB**, via the **Dexie** helper library, for rounds, shots, courses.
  Do not use localStorage for shot/round data (too small, synchronous).
- All data stays **on the device**. Nothing is transmitted to a server. There is no
  backend.

## The shot-input model (important — this is deliberate)

Phone GPS is accurate to ~3–5 m. That's fine for full shots but useless for short
ones. So input is a hybrid:

- **Tee-to-green full shots** → GPS auto-distance, captured live during play
  (tap at the ball, walk to it, tap again; compute haversine distance between points).
- **Around the green (chips/pitches)** → entered **after the hole** by dropping a pin
  on a pinch-zoomable satellite image. More accurate than GPS at short range.
- **Putting** → entered **after the hole** as a distance (metres/feet). SG putting is
  purely distance-from-hole; satellite imagery can't resolve green-scale distances.

The user cannot take the phone onto the green, so around-the-green and putting are
always reconstructed post-hole.

## Strokes Gained method

SG for a shot = (expected strokes from start position) − (expected strokes from end
position) − 1 (− any penalty strokes). Categories: Off the Tee, Approach, Around the
Green, Putting. Baseline = **handicap-5** expected-strokes-to-hole-out by distance and
lie (fairway / rough / sand / recovery / green).

**Data dependency:** the handicap-5 baseline table must be sourced from published
amateur SG research, not invented. Build the SG engine **table-driven** so the baseline
is a swappable data file (`data/baseline-hcp5.json`). Seed with a documented starter
table; refine as the user's real data accumulates. Flag clearly in code comments which
numbers are provisional.

## Build phases (work on the CURRENT phase only unless told otherwise)

1. **[CURRENT] Pipeline + scorecard.** App shell + PWA manifest + service worker.
   Course data model with Te Puke and Summerhill pre-loaded. Manual hole-by-hole
   scorecard (score, putts, fairway hit, GIR). Installs and runs offline on the iPhone.
   Goal: prove the build-and-deploy pipeline end to end with a usable scorecard.
2. **GPS shot tracking.** Live capture of full-shot start/end points and distances.
3. **Satellite map + pin-drop.** Leaflet + Esri imagery. Post-hole short-game plotting.
   Offline tile caching for Te Puke and Summerhill.
4. **Strokes Gained engine.** Table-driven SG vs handicap-5, broken out by category.
5. **Trends & history.** Multi-round storage, SG trends over time, 10→5 trajectory.

## Dev & deploy workflow

- Develop locally; serve over `localhost` (a secure context, so Geolocation and PWA
  features work in desktop Safari/Chrome for logic testing).
- For **real on-phone testing**, deploy to **GitHub Pages** (free, HTTPS — required for
  Geolocation and PWA install on iOS). Install to the home screen from Safari via Share
  → Add to Home Screen.
- The GitHub Pages site is public, which is acceptable: it contains only app code, no
  personal data (all round data lives in IndexedDB on the device).

## Conventions

- Keep files small and single-purpose. Suggested layout:
  `index.html`, `css/`, `js/` (`app.js`, `db.js`, `gps.js`, `map.js`, `sg.js`),
  `data/` (courses, baseline), `sw.js`, `manifest.json`.
- Comment the *why*, especially around GPS accuracy handling and SG math.
- After each phase, update this file's phase marker and note what changed.
- Explain new concepts as you go — this is also a learning project for the owner, who
  is new to Claude Code and to building apps.
