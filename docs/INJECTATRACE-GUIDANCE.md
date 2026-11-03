# Injectatrace: guidance from the prototype

**Purpose of this document.** A working prototype of Injectatrace was built iteratively with Claude. The product owner liked its design, flow and organisation. Use this as **guidance** for the from-scratch build: what the product is, the rules we settled, the design system, how each role's app is organised, and what made the collaboration work. It is not a final spec. Where something is marked *open*, it still needs a decision.

Prototype (demo data, runs in the browser): https://claude.ai/artifact/H4tdf9npNQMbsr8vEirqAf
Source: repo `cotcreate/instalment-planner-overpayment-calculator`, branch `claude/mobile-first-design-02r394` (vanilla JS PWA, no build step).

---

## 1. What Injectatrace is

Digital QA and traceability for **Injecta Fire Barrier** installations: cavity fire barrier "socks" injected into building facades. It replaces spreadsheets, WhatsApp photos and paper ITPs with one record of every installation point.

- **Owner / platform:** Injectaclad (part of LSTH plc). Tagline from the brand mock: *"Every installation. Recorded the same way."* Provided to Injectaclad Approved Installers.
- **Core unit of work:** the **hold point** (HP), a numbered pin on an elevation drawing where a barrier was installed, with measurements and photographic evidence.
- **Three jobs the system does:** prove compliance (golden thread), control installer quality (QA), and get paid (fortnightly valuations backed by QA-passed hold points).
- **Scale to design for:** jobs run up to **7 months**, with **700+ hold points** per job, many companies on the platform, and invoicing **every 2 weeks**.

## 2. Who uses it: companies, roles and visibility

Multi-company from day one. Three company tiers plus clients:

| Login | Top-bar logo | Sees | Does |
|---|---|---|---|
| **Injectaclad (backend)** | Injectaclad | Every job and quote across all companies | Quote (choosing contractor + installer company), manage companies and logos, create jobs, assign operatives and clients, QA, valuations, reports |
| **Contractor** (e.g. Northern Facades) | The contractor's own logo | Only their own jobs and quotes | Quote (choosing installer company), create jobs, client setup, QA, valuations, reports, their branding |
| **Installer** (operative on site) | Injecta Fire Barrier | Only jobs they're assigned to | Weekly RAMS sign-off, hold point capture, daily checks, fix rework |
| **Client** (main contractor / building owner) | Their contractor's logo | Only jobs and quotes assigned to them | Track progress, view QA-passed hold points, documents and issued valuations, accept or decline quotes |

Working assumptions:
- The **contractor** is the firm that wins the work. The **installer company** is the approved installer doing it on site. *Open:* confirm this with the business.
- Every job and quote records a **contractor** and an **installer company**. The **installer company's logo is the job icon everywhere** (job lists, quote rows, QA groups), so jobs are easy to tell apart when lots of companies are involved.
- Operatives belong to an installer company. A job's team is chosen from that company's operatives.

**Never shown to clients:** pail quantities, hourly rates, costs, margins, internal notes. **Never shown to other operatives:** hourly rates.

## 3. Source requirements (Injectaclad recording system requirements, 15/05/25)

**By company (back office):** operatives by role; training and qualification documents with expiry dates; insurance with expiry dates and cover values (employers' liability, public & products liability, contractors all risks, professional indemnity); accreditations.

**By site/job (back office):**
- RAMS, signed weekly by all operatives, with revision uploads.
- Uploads: technical data sheet, CoSHH data sheet, cavity section drawing, marked-up elevation drawings (required), extended application document, testing/approval documents (e.g. Warrington Fire), warranty documents, H&S internal/external audits, ITP (required), 3rd-party site/quality audits, 3rd-party accreditation certificate.
- Fire rating as a dropdown: 30 / 60 / 90 / 120 mins.
- Operatives picked from a list, including hourly rate (hidden from clients and other operatives).

**By site/day (on site, GPS tracked):**
- Temperatures twice daily (AM and PM): ambient, cavity, pail on pump, site storage.
- H&S incident reporting, H&S checklists, toolbox talks delivered.
- Operative hours (weekly reporting).
- 30-second daily video diary.
- Daily costs: labour plus materials (sock diameter × linear metres injected).

**By hold point (on site, GPS tracked):**
- Cavity depth; sock size from 40 / 50 / 60 / 80 / 100 mm (two boxes when abutted); injected length; pail batch number; pail quantity (hidden from client); pin quantity installed.
- **Photos under 8 headings, several allowed per heading:**
  1. Area photograph (before work starts)
  2. Access holes completed
  3. Clear cavity (photo and borescope video)
  4. Cavity measure (tape showing depth)
  5. Pins installed
  6. Sock installed
  7. Injected sock (show joints / abutment to floor slab)
  8. Access holes reinstated
- **QA in the back office, by pin number: red turns green when passed.**

## 4. Business rules we settled (keep these)

- **Hold point numbering:** sequential per job (HP 01, 02…), following installation order. Pins sit along slab lines, floor by floor, round each face.
- **Hold point lifecycle:** Draft → Submitted → In QA → **Passed** (green) or **Rework** (red, with a reason) → on a valuation → handed over. Rework goes back to the installer, who adds photos and resubmits.
- **"Ready for QA" (auto pre-check):** all 8 photo headings present, plus cavity depth, sock, length, pins and batch number. Ready hold points can be **bulk-passed in one tap**; only those with gaps need a human look.
- **RAMS gate:** an operative must sign that week's RAMS revision (finger signature) before recording on that job. A new revision forces everyone to re-sign.
- **Valuations (fortnightly invoicing):**
  - Each job runs on **14-day periods** from its start date (Monday of the first install week). Valuations due show on Home.
  - **Billable = installed on or before the period end AND QA passed.** A hold point is never on two valuations. Anything not yet passed rolls into the next valuation automatically. *Open:* the alternative is "QA passed within the period".
  - Priced at the job's quoted rates: linear metres by sock size plus fixing pins. *Open:* access holes, labour days, retention, CIS, variations.
  - **Issuing** locks the hold points to "Valuation No. N" and produces a branded report (summary, pricing, VAT, job to date, by-face breakdown, full schedule of hold points) plus a spreadsheet. Clients can view issued valuations.
- **Quotes:** Draft → Sent → Won / Lost (with reason) / Expired (automatically, after the validity period). The client can accept or decline in their portal. A won quote becomes a job in one step, and its files are copied into the job's documents.
- **Quote quick build:** enter the total linear metres and pick a sock size. It generates: sock × LM; pins at 2 per metre; access holes at 1 per 3 m; survey days (LM / 400); labour days (LM / 55, minimum 2); MEWP weeks (LM / 300); prelims. Every line stays editable, and internal margin shows live (staff only).
- **Daily costs:** labour hours × operative rate, plus materials (sock rate per metre × length, per sock).
- **Compliance alerts:** a qualification or insurance expiring within 30 days shows amber; expired shows red. Missing required job documents and unsigned RAMS also raise alerts.

## 5. Design system

**Brand palette**

| Token | Hex | Use |
|---|---|---|
| Navy | `#183756` | Wordmark, primary buttons, headings |
| Orange | `#F5832C` | Flame, current state, accent CTAs (navy text on orange) |
| Slate | `#4A6178` | The "trace" half of the wordmark, secondary text |
| Mist | `#C9D4DF` | Text on navy, rules, borders |
| Tint | `#EEF2F6` | App background |
| White | `#FFFFFF` | Cards |

Status colours are separate from brand: green `#1E7D46` (passed), red `#C0352B` (awaiting QA, rework, missing), amber `#8A5300` (expiring).

**Type:** **Source Sans 3** for all UI. **Source Code Pro** only for software cues: HP numbers, batch numbers, refs, uppercase eyebrow labels. Wordmark: two-tone "Injecta" (navy) + "trace" (slate) with the flame "I". Real logo files for Injectaclad and Injecta Fire Barrier are in `icons/`.

**Motif:** the **trace line**, a row of dots joined by a line (done = navy, current = orange with a halo, upcoming = hollow). Used as the step indicator in every multi-step flow, and as the quote timeline.

**Components that made screens calm and organised** (the owner specifically liked this after an early version looked "too listy"):
- **One hero per screen:** a navy gradient card with the single key number, three small stats, and the primary action.
- **"Needs you" list:** only the to-dos that are non-zero (QA waiting, valuations due, won quotes to set up, expiring quotes, drafts, missing documents, expiring compliance), each with an icon bubble.
- **Grouped rows** (settings-style) instead of long label/value lists: leading visual (logo, avatar, ring or icon bubble), title plus one line, trailing value/chip, chevron. Show 3–5, then "See all".
- **Tiles** (2-up on phone, 4-up on desktop) for navigation hubs.
- **Spec grids** (2-column label/value blocks) for measurements.
- **Progress rings** for % of hold points QA-passed.
- **Segmented controls** for tabs and filters.
- **Collapsible sections** for secondary detail (supporting documents, daily records, the drawing on a hold point).
- **Photo tile grid:** 8 headings as tiles with the first photo and a count. Missing headings show as dashed red tiles.
- **Slide-up sheets** for filters and forms, never sidebars.

## 6. Mobile and site-use rules (non-negotiable)

- Design for **375px first**, then tablet (768px), then desktop (1024px). **Test every screen at 375px and 390px.**
- Users may be on a MEWP, in gloves, in bright daylight: **tap targets ≥ 48px** (most are 56), 17–18px body text, high contrast, inputs at least 16px so iOS doesn't zoom.
- **Minimal typing:** dropdowns, tile choices, steppers (−/+), toggles. Remember the last batch number per job. Notes are optional.
- **Bottom nav** fixed and thumb-reachable (≤ 5 tabs); becomes a navy side rail on desktop. **Primary action in a sticky bar** above the nav.
- Photo buttons open the **rear camera** (`accept="image/*" capture="environment"`); the video diary uses the front camera.
- **Elevation drawing:** pinch to zoom and pan, plus big + / − / fit buttons (pinching in gloves is unreliable). A tap drops a pending pin that must be **confirmed**; a pinch never drops a pin. Level and bay are derived from the pin position. Supports an uploaded marked-up drawing.
- Long forms split into **short steps with the trace-line progress indicator**.
- Back office on mobile: **tables become stacked cards with the key figure large**; charts redraw at the container's width; filters in slide-up sheets.
- Respect phone **safe areas**. **Installable PWA** with a navy tile and orange flame icon.
- Any open sheet closes on navigation (we hit a bug where the phone back button left one stuck).

## 7. Information architecture (what worked)

**Installer** (`Today · Capture · Daily · Records`)
- **Today:** a hero for today's job with status chips (RAMS ✓, AM checks ✓, PM checks), and **one next action**: sign RAMS → record AM checks → add hold point. Then tiles for Add hold point, Daily checks, My records (rework badge) and RAMS; other jobs underneath.
- **Capture** (5 steps): Location (job + elevation) → Pin on drawing (confirm) → Measurements → Photos (8 headings) → Check & save. The draft survives closing the app; after saving, "Next hold point here" carries over sensible defaults.
- **Daily:** tiles for AM temps, PM temps, H&S, Hours, Video diary, each opening a short sheet. Temperatures pre-fill from the last reading; GPS is captured.
- **Records:** hold point browser (see below), grouped by QA status, rework first in the user's mind.

**Contractor** (`Home · Quotes · Jobs · Reports · More`) and **Injectaclad backend** (`Home · Quotes · Jobs · QA · More`)
- **Home:** pipeline hero, "Needs you", live jobs, recent quotes.
- **Quotes:** pipeline hero (open value, won 12 months, win rate) with Open / Won / Lost / All filters → 4-step builder (Client & job [contractor, installer company with logo upload] → Scope → Files → Review & send) → quote detail with document, files and status actions.
- **Jobs:** job rows with the installer logo as the icon → job detail: header (installer and contractor logos, ring and stats) + tabs: Overview (drawing, red/green filter, HP number labels), Hold points, Valuations, Daily, Documents (required vs collapsible supporting, RAMS sign-off ring), Team (installer company + operatives tick list + client).
- **QA:** "Pass all N ready" hero, then per-job groups with "Pass N ready".
- **Valuations:** hub (due / in progress / issued) → builder (period, value hero, bulk-pass ready pins inline, priced lines, by-face bars, held-back note) → issued report.
- **More:** Valuations, Companies (backend only), Clients (portal invites, contacts, job visibility), Team & compliance, QA or Reports, Branding (contractor only).

**Client** (`Home · Jobs · Quotes`): a hero with their job's progress ring, quotes to review, "who's on your job" (contractor and installer logos), and read-only job tabs.

**Hold point browser** (used on the job's Hold points tab and on the installer's Records):
- Find by HP number.
- **Sort:** HP number, face, level (top down), newest.
- **Group:** by face, level, QA status, or none, with green/red counts per group.
- **Filter:** status, face, installer.
- Active filters show as removable chips. Choices are remembered per list.
- **Select mode:** tick all awaiting QA, "complete only", or a whole group, then Pass selected.

## 8. Data model (entities that held up)

Company (type: contractor | installer, logo) · Person/operative (company, role, rate, qualifications with expiry/file) · Client (contacts, portal status) · Quote (contractor, installer company, client, lines with rate + internal cost, files, status, dates, lost reason, linked job) · Job (contractor, installer company, client, fire rating, target HPs, elevations, team, documents per type, RAMS revision + weekly signatures, linked quote) · Elevation (floors × bays or an uploaded drawing image) · Hold point (job, elevation, number, x/y on drawing, level, bay, measurements, photos per heading, operative, GPS, created time, QA status/note/by/at) · Daily record (job, date, AM/PM readings with GPS, checks, toolbox talk, incident, hours per operative, diary) · Valuation (job, number, period from/to, issued at/by, locked hold point IDs, totals) · Document (name, file, date, revision).

## 9. Recommended build approach

The product owner is building this **themselves with Claude** and has **no coding experience**. Optimise for that:

- **PWA (web app) first**, not native apps: one codebase, no app stores, installs on phones.
- **Managed services, not servers:** e.g. Supabase or Firebase for logins, database and photo/file storage; Vercel (or similar) for hosting. Switch backups on from day one.
- **Offline = "Level B": offline capture.** Record hold points, photos and daily checks with no signal. They queue on the phone and upload automatically when signal returns, and the day's drawings are saved on the phone. Show a clear "3 waiting to upload / all uploaded" status. One operative owns a hold point, to avoid sync conflicts. Not "everything works offline".
- **Pilot first:** one friendly installer company, one job, Injectaclad doing QA, no outside client logins at first.
- **Get an experienced developer to review twice:** before real job data goes in (security, permissions between companies, backups), and before wider rollout.
- Highest-risk areas to get right: **data leaking between companies** (row-level permissions), **losing evidence** (backups, upload confirmation), **offline sync**, **GDPR** (GPS and photos of people), and an **audit trail** on edits.
- Keep an automated phone-width acceptance test (the prototype used Playwright): every screen at 375/390/tablet/desktop, fail on sideways scroll, tap targets under 48px, inputs under 16px, or JS errors, plus walk-through tests for the main flows.

## 10. How we worked (what made it go well)

- **Bottom line first, plain English, no jargon.** Explain technical trade-offs in business terms (cost, risk, what the user sees).
- **Build something tryable quickly**, then iterate on feedback. Publish a link the owner can open on their phone after every meaningful change.
- **When the brief is ambiguous, ask one sharp question with options**, then build. Otherwise make a sensible assumption and **state it clearly** for confirmation (e.g. contractor vs installer roles, billing basis).
- **Map every requirement to where it lives** in the app (we kept a coverage table in the README).
- **Check every screen visually at 375px** and fix what looks off: truncation, wrapping buttons, cramped rows. Don't stop at "the test passed".
- **Seed realistic demo data** (real-sounding jobs, 150 hold points along slab lines, a quote history, two issued valuations) so screens look like the real thing and the numbers mean something.
- **Reduce manual work aggressively.** The owner's biggest pain was editing 700 pins one by one and exporting by date. The answer was auto-checks, bulk actions and generated reports, not more forms.
- End each round with: what changed, how to try it, and the 2–3 decisions needed from the owner.

## 11. Open decisions (from the planning sessions)

1. Product owner and decision-maker named.
2. Budget range and hard dates (pilot job).
3. Web app only, or native apps later; confirm offline Level B.
4. Billing basis: "installed by period end + QA passed" (current) vs "QA passed within period".
5. What else is priced on valuations (holes, labour, variations, retention, CIS, VAT reverse charge).
6. Who invoices whom; whether valuations are needed at each tier; accounting integration (Zoho Books / Xero / Sage).
7. Data ownership between Injectaclad, contractor, installer and client; retention period; UK hosting.
8. Whether compliance (insurance, accreditations) is per installer company (likely) rather than one shared set.
9. Real price book and terms text; real logos for every company.
10. MVP scope (MoSCoW) and the pilot job.

---

*Planning materials produced alongside the prototype: a requirements workshop page (agenda, 125 tailored questions, decision log, MVP board), 12 fill-in templates (role map, permission grid, journey swimlane, hold point lifecycle, data map, system context, impact vs effort, MoSCoW, Now/Next/Later, risk grid and register, decision log, user profiles), and a printable agenda. Feed the meeting outcomes (notes or transcript) into the new project alongside this document.*
