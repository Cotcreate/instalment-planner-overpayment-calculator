# InjectaTrace

## 1. The bottom line
- **One-liner:** Site capture and back office for injection works, built for operatives' phones.
- **Problem it kills:** Paper or ad-hoc records of injection work with no live view of progress, location or SS17 material use.

## 2. Who and where
- **Users:** Site operatives (record work) and back-office staff (track projects).
- **LSTH company / market:** *to confirm*
- **Where it's used:** On site, often in gloves and offline.

## 3. What it does (v0.1)
1. **Jobs:** live projects, % complete, SS17 remaining, one-tap record.
2. **Record:** 5 steps: where → pin on elevation → work done → photos → check & save. Drafts survive closing the app.
3. **Log:** recent records, mine or everyone's.
4. **Office:** KPI tiles, SS17-per-week chart, projects table, filters, project drill-down with all pins per elevation.

## 4. Value
- **Saves money by:** *to confirm* (fewer site visits to verify work? faster sign-off? less material waste?)
- **Success looks like:** *to confirm*

## 5. Constraints
- Installable PWA, works offline, no build step.
- Demo data stored on the device for now. `js/store.js` is the seam for an API.

## 6. Status
- **Stage:** Building (v0.1)
- **Repo:** `Cotcreate/instalment-planner-overpayment-calculator` (⚠️ name mismatch: rename to `injectatrace`)
- **Open questions / to confirm:**
  - SS17 is tracked in litres against a per-project allocation, and "low" means less than 15% left. Is that right?
  - Work types, statuses (Complete / Partial / Defect) and targets are placeholders until the main spec lands.
  - Elevations are generated grids. Real PDF/CAD elevations still need to be supported.
- **Next step:** Confirm the assumptions above, then add a backend and login.
