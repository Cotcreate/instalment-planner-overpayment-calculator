# InjectaTrace

Site capture and back-office software for injection works. This is a standalone software project, separate from Kode Dot and the miscellaneous apps.

- Brief, assumptions and status: `docs/BRIEF.md`. Read it first.
- Owner: Peter Cotter (LSTH plc). Give the bottom line first, with no fluff.

## Working here
- Run with `npm start` (http://localhost:4173). Check with `npm test` at 375, 390, tablet and desktop widths.
- No build step. Plain HTML/CSS/JS PWA that works offline.
- Data seam: `js/store.js` (demo data on the device until a backend exists).
- After a meaningful change, update the Status section of `docs/BRIEF.md`.
