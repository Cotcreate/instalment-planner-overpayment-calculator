// Local-first data store. Records live in localStorage, photos in IndexedDB (photos.js).
// Swap load()/persist() for an API sync layer when the backend exists.

const KEY = 'injectatrace.v1';
const DAY = 86400000;

export const PRODUCTS = ['SS17', 'Other'];
export const WORK_TYPES = ['Penetration seal', 'Cavity barrier', 'Linear joint', 'Crack injection'];
export const STATUSES = {
  complete: 'Complete',
  partial: 'Partial',
  defect: 'Defect',
};
export const PROJECT_STATUSES = { active: 'Active', hold: 'On hold', done: 'Complete' };
export const OPERATIVES = ['J. Patel', 'S. Okafor', 'M. Byrne', 'L. Novak'];
export const LOW_SS17 = 0.15; // flag projects with under 15% of SS17 allocation left

function seed() {
  const projects = [
    {
      id: 'p1', name: 'Harbour View Tower', client: 'Northgate Build', site: 'Leeds LS1', status: 'active',
      targetPoints: 220, ss17Allocated: 260,
      elevations: [
        { id: 'p1n', name: 'North', floors: 12, bays: 8 },
        { id: 'p1e', name: 'East', floors: 12, bays: 5 },
        { id: 'p1s', name: 'South', floors: 12, bays: 8 },
      ],
    },
    {
      id: 'p2', name: 'Riverside Library', client: 'City Council', site: 'York YO1', status: 'active',
      targetPoints: 90, ss17Allocated: 80,
      elevations: [
        { id: 'p2w', name: 'West', floors: 4, bays: 10 },
        { id: 'p2e', name: 'East', floors: 4, bays: 10 },
      ],
    },
    {
      id: 'p3', name: 'Kingsway Student Block', client: 'Halden Homes', site: 'Manchester M15', status: 'hold',
      targetPoints: 140, ss17Allocated: 150,
      elevations: [
        { id: 'p3n', name: 'North', floors: 8, bays: 6 },
        { id: 'p3s', name: 'South', floors: 8, bays: 6 },
      ],
    },
    {
      id: 'p4', name: 'Mill Lane Clinic', client: 'NHS Property', site: 'Bradford BD1', status: 'done',
      targetPoints: 40, ss17Allocated: 45,
      elevations: [{ id: 'p4n', name: 'Front', floors: 3, bays: 6 }],
    },
  ];

  // Deterministic pseudo-random so the demo looks the same everywhere.
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const now = Date.now();
  const counts = { p1: 150, p2: 74, p3: 61, p4: 40 };
  const records = [];
  for (const p of projects) {
    for (let i = 0; i < counts[p.id]; i++) {
      const el = pick(p.elevations);
      const r = rnd();
      const status = p.status === 'done' ? 'complete' : r < 0.82 ? 'complete' : r < 0.93 ? 'partial' : 'defect';
      const age = p.status === 'hold' ? 28 + rnd() * 30 : rnd() * 56;
      const x = 0.06 + rnd() * 0.88;
      const y = 0.06 + rnd() * 0.88;
      records.push({
        id: `${p.id}-${i}`, projectId: p.id, elevationId: el.id,
        x, y, floor: floorAt(el, y), bay: bayAt(el, x),
        type: pick(WORK_TYPES), product: rnd() < 0.9 ? 'SS17' : 'Other',
        qty: Math.round((0.5 + rnd() * 2) * 2) / 2,
        status, notes: '', photos: [], operative: pick(OPERATIVES),
        createdAt: now - age * DAY,
      });
    }
  }
  return { projects, records, settings: { operative: OPERATIVES[0] }, draft: null };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage unavailable: fall through to seed */ }
  return seed();
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota or private mode */ }
}

// Elevation geometry: the drawing is split into floors (rows, top = highest) and bays (columns).
export function floorAt(el, y) {
  const f = el.floors - Math.floor(Math.min(0.9999, Math.max(0, y)) * el.floors);
  return f === 1 ? 'Ground' : `Level ${f - 1}`;
}
export function bayAt(el, x) {
  return Math.floor(Math.min(0.9999, Math.max(0, x)) * el.bays) + 1;
}

export const getState = () => state;
export const projects = () => state.projects;
export const project = (id) => state.projects.find((p) => p.id === id);
export const elevation = (p, id) => p?.elevations.find((e) => e.id === id);
export const records = () => state.records;
export const recordsFor = (projectId) => state.records.filter((r) => r.projectId === projectId);

export function addRecord(rec) {
  state.records.push(rec);
  persist();
}

export function setSetting(k, v) { state.settings[k] = v; persist(); }

export function saveDraft(d) { state.draft = d; persist(); }
export function clearDraft() { state.draft = null; persist(); }

export function stats(p, since = 0) {
  const all = recordsFor(p.id);
  const recs = all.filter((r) => r.createdAt >= since);
  const complete = all.filter((r) => r.status === 'complete').length;
  const used = all.filter((r) => r.product === 'SS17').reduce((t, r) => t + r.qty, 0);
  const remaining = Math.max(0, p.ss17Allocated - used);
  return {
    count: recs.length,
    complete,
    pct: Math.min(100, Math.round((complete / p.targetPoints) * 100)),
    ss17Used: used,
    ss17Remaining: remaining,
    low: remaining / p.ss17Allocated < LOW_SS17,
    defects: all.filter((r) => r.status === 'defect').length,
  };
}

export function resetDemo() { state = seed(); persist(); }
