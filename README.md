# Injectatrace

Digital QA and traceability for **Injecta Fire Barrier** installations: the Injectaclad recording system.
Mobile-first installable PWA, works offline, no build step.

## Run

```bash
npm install      # dev only: Playwright for the checks
npm start        # http://localhost:4173
npm test         # every screen, all roles, at 375px, 390px, tablet and desktop
```

Sign in with any of the three demo accounts (Installer, Back office, Client). Data is demo data stored on the device.

## Requirements coverage (Injectaclad recording system requirements, 15/05/25)

| Level | Requirement | Where |
|---|---|---|
| Company | Operatives by role | Company → Operatives |
| | Training & qualifications with expiry, uploads | Operative sheet: expiry date + upload per qualification; expiring items flagged on Overview |
| | Insurance: upload, expiry, EL / PL&PL / CAR / PI values | Company → Insurance |
| | Accreditations | Company → Accreditations |
| Site | RAMS signed weekly by all operatives, revisions | Installer must finger-sign before capture; Site → Documents shows sign-off per operative, "New revision" forces re-sign |
| | TDS, CoSHH, cavity section, elevations, EAP, testing/approval, warranty, H&S audits, ITP, 3rd party audits/cert | Site → Documents (required ones flagged when missing) |
| | Fire rating 30/60/90/120 | Site → Overview |
| | Operatives with hourly rate, hidden from client and other operatives | Site → Team (back office only) |
| Site/day | Ambient, cavity, pail-on-pump, storage temps AM + PM, GPS | Daily → AM / PM temperatures |
| | H&S incidents, checklists, toolbox talks | Daily → H&S |
| | Hours worked, weekly report | Daily → Hours; Site → Daily shows the weekly roll-up |
| | Daily video diary (30s) | Daily → Video diary |
| | Daily costs (labour + sock diameter × LM) | Site → Daily (back office only) |
| Pin | Cavity depth, sock (2 when abutted, 40–100mm), injected length, pail batch, pail qty (hidden from client), pin qty | Capture → Measurements |
| | 8 photo headings, multiple photos each, borescope video | Capture → Photos |
| | GPS tracked | Captured on pin confirm |
| | QA by pin number, red → green | QA queue + hold point detail; pins on the drawing turn green on pass, rework sends back to the installer |

## Brand

Navy `#183756`, Orange `#F5832C`, Slate `#4A6178`, Mist `#C9D4DF`, Tint `#EEF2F6`. Source Sans 3 for UI,
Source Code Pro only for IDs, batch numbers and descriptors. The wordmark is an SVG recreation of option 02
(two-tone with trace line), set in Fredoka; swap in the master logo files when available.

## Structure

```
index.html            app shell
css/app.css           all styles, phone first, 768px and 1024px breakpoints
js/app.js             sign-in, role-based nav, router
js/installer.js       Projects, Capture (hold point), Daily, Records, RAMS signing
js/office.js          Overview, Sites (+ site tabs), QA queue, Company
js/pin.js             hold point detail with QA / rework / resubmit
js/elevation.js       zoom/pan/pin drawing (generated grid or uploaded drawing)
js/chart.js           responsive bar chart
js/store.js           data model, demo seed, derived figures (swap for an API)
js/files.js           IndexedDB for photos, video, documents
js/ui.js              icons, wordmark, sheet, trail, steppers, GPS, signature pad
tests/mobile-check.mjs acceptance checks + screenshots to test-output/
```

## Open points

- No backend or real authentication yet; `store.js` is the seam for an API.
- Material £/m rates per sock size are placeholders (Company → Material rates).
- Video diary opens the front camera (talking to camera); all other capture uses the rear camera.
