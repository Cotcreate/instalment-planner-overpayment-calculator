# InjectaTrace

Mobile-first site capture and back office for injection works. Installable PWA, works offline, no build step.

## Run

```bash
npm install      # dev only: Playwright for the checks
npm start        # http://localhost:4173
npm test         # every screen at 375px, 390px, tablet and desktop
```

Any static host works for deployment (serve the repo root over HTTPS for install and offline).

## Screens

| Tab | For | What it does |
|---|---|---|
| Jobs | Operatives | Live projects with % complete and SS17 left, one tap to record. Install prompt. |
| Record | Operatives | 5 short steps with a progress bar: where → pin on elevation → work done → photos → check & save. Draft survives closing the app. |
| Log | Operatives | Recent records, mine or everyone's. |
| Office | Back office | KPI tiles, SS17-per-week chart, projects table (stacked cards on phones), slide-up filter sheet, project drill-down with all pins on each elevation. |

## Site-use rules applied

- Tap targets 48px minimum (most are 56px), 18px base text, 20px inputs, navy/orange high contrast.
- Minimal typing: dropdowns, tile choices, a quantity stepper, toggles. Notes are optional.
- Bottom nav fixed and thumb-reachable; primary action in a sticky bar above it. Side rail from 1024px.
- Photo buttons use `accept="image/*" capture="environment"` (rear camera). Photos are downscaled and kept in IndexedDB.
- Elevation drawing: pinch to zoom, drag to pan, big +/−/fit buttons for gloves, tap drops a pending pin that must be confirmed. Pinching never drops a pin. Floor and bay are read from the pin position, so nobody types them.
- Safe areas respected (`viewport-fit=cover` + `env(safe-area-inset-*)`).
- Charts redraw at the container's real width so labels stay 13px at 375px; tap a bar for its value.

## Structure

```
index.html            app shell, bottom nav
css/app.css           all styles, phone first, 768px and 1024px breakpoints
js/app.js             router and screens
js/elevation.js       zoom/pan/pin drawing component
js/chart.js           responsive bar chart
js/store.js           local-first data + demo seed (swap for an API later)
js/photos.js          IndexedDB photo store
sw.js                 offline app-shell cache
manifest.webmanifest  PWA manifest; icons/ holds the navy tile + orange flame (placeholder)
tests/mobile-check.mjs acceptance checks + screenshots to test-output/
```

## Assumptions to confirm

- **Data is demo data on the device.** No backend or login yet; `store.js` is the seam for an API.
- **SS17** is treated as a material tracked in litres against a per-project allocation; "low" means under 15% left.
- Work types, statuses (Complete / Partial / Defect) and project targets are placeholders until the main spec lands.
- Elevations are generated grid drawings (floors × bays). Uploaded PDF/CAD elevations would replace the SVG in `elevation.js`.
