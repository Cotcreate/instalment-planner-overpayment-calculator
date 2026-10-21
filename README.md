# Injectatrace

Digital QA and traceability for **Injecta Fire Barrier** installations: the Injectaclad recording system.
Mobile-first installable PWA, works offline, no build step.

## Run

```bash
npm install      # dev only: Playwright for the checks
npm start        # http://localhost:4173
npm test         # every screen, all roles, at 375px, 390px, tablet and desktop
```

Sign in with any of the four demo accounts. Data is demo data stored on the device.

| Login | Top-bar logo | Sees | Can do |
|---|---|---|---|
| Injectaclad (backend) | Injectaclad | Every job and quote across all companies | Quote (choosing contractor + installer company), manage companies and their logos, create jobs, assign operatives and clients, QA, reports |
| Contractor | The contractor's own logo | Only their own jobs and quotes | Quote (choosing installer company), create jobs, client setup, QA, reports, branding |
| Installer | Injecta Fire Barrier | Only jobs they're assigned to | RAMS sign-off, hold point capture, daily checks, fix rework |
| Client | Their contractor's logo | Only jobs and quotes assigned to them | Track progress, view QA-passed hold points and documents, accept or decline quotes |

Every job and quote records a **contractor** and an **installer company**. The installer company's logo is the job icon on every list, so jobs are easy to tell apart when lots of companies are on the system. Logos can be uploaded when adding a company, from the company page, or straight from the quote builder.

## Quoting

- **Builder** in 4 short steps: client & job → scope (quick build from linear metres + sock size, then edit lines from the price book) → files → review & send.
- **File storage**: drawings, specs, photos, tender documents attached to each quote (IndexedDB on device); copied into the job's documents when won.
- **Branded quote document** with the contractor's logo, printable / save as PDF.
- **Pipeline**: Draft → Sent → Won / Lost / Expired (auto-expires after validity). Lost reasons captured.
- **Client portal**: clients accept or decline sent quotes themselves.
- **Won → job** in one step, assigning installers and the client.
- **Reports**: won value, win rate (count and value), margin, pipeline, time to decision, won per month, pipeline by status, top clients, lost reasons, estimator performance. Exports: quote register CSV, monthly summary CSV, print/PDF.

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

## Valuations (fortnightly invoicing)

- Each job runs on 14-day periods from its start date. Valuations due show on Home and under More → Valuations.
- A hold point is billable once it was **installed on or before the period end and has passed QA**, and it's never on two valuations. Anything still in QA or rework rolls into the next valuation automatically.
- Totals: hold points passed, linear metres by sock size, fixing pins, pails, priced at the job's quoted rates; this valuation, VAT, and job to date.
- **Issue** locks it as Valuation No. N and produces a branded report (print / PDF: summary, pricing, by face, full schedule of hold points) and a spreadsheet (CSV) to attach to the invoice. Clients can view issued valuations on the job.
- **Bulk QA**: hold points with every photo heading and measurement are "ready". Pass all ready from the QA queue or the valuation screen in one tap, or use Select on a job's hold points to tick by face / level / all.

## Brand

Navy `#183756`, Orange `#F5832C`, Slate `#4A6178`, Mist `#C9D4DF`, Tint `#EEF2F6`. Source Sans 3 for UI,
Source Code Pro only for IDs, batch numbers and descriptors. The wordmark is an SVG recreation of option 02
(two-tone with trace line), set in Fredoka; swap in the master logo files when available.

## Structure

```
index.html            app shell
css/app.css           all styles, phone first, 768px and 1024px breakpoints
js/app.js             sign-in, role-based nav, router, contractor branding
js/home.js            staff and client home screens
js/quotes.js          quote pipeline, builder, document, accept/decline, convert to job
js/reports.js         quote reporting dashboard and exports
js/admin.js           More hub, companies (installers, contractors, logos), client setup, branding
js/installer.js       Projects, Capture (hold point), Daily, Records, RAMS signing
js/office.js          Jobs (+ job tabs incl. team assignment), QA queue, Team & compliance
js/pin.js             hold point detail with QA / rework / resubmit
js/pinlist.js         hold point list: search by HP no., sort, group, filter, select-and-pass
js/valuations.js      fortnightly valuations: prepare, bulk QA, issue, report + spreadsheet
js/elevation.js       zoom/pan/pin drawing (generated grid or uploaded drawing)
js/chart.js           responsive bar chart
js/store.js           data model, demo seed, derived figures (swap for an API)
js/files.js           IndexedDB for photos, video, documents
js/ui.js              icons, wordmark, sheet, trail, steppers, GPS, signature pad
tests/mobile-check.mjs acceptance checks + screenshots to test-output/
```

## Open points

- No backend or real authentication yet; `store.js` is the seam for an API. Files live on the device until then.
- Portal invites are simulated (no email is sent).
- Material £/m rates per sock size are placeholders (Company → Material rates).
- Video diary opens the front camera (talking to camera); all other capture uses the rear camera.
