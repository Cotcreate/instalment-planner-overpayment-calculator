// Local-first data store for the Injectaclad recording system (Injecta Fire Barrier).
// Records live in localStorage, files (photos, video, documents) in IndexedDB via files.js.
// Swap load()/persist() for an API sync layer when the backend exists.

const KEY = 'injectatrace.v2';
const DAY = 86400000;

// ---------- Reference lists (from the requirements sheet) ----------
export const FIRE_RATINGS = [30, 60, 90, 120];
export const SOCK_SIZES = [40, 50, 60, 80, 100];
export const ROLES = ['Installer', 'Supervisor', 'Site manager'];

// Placeholder material rates, £ per linear metre injected, by sock diameter.
export const SOCK_RATE = { 40: 4.2, 50: 5.1, 60: 6.3, 80: 8.9, 100: 11.5 };

export const PHOTO_HEADINGS = [
  { key: 'area', label: 'Area photograph', hint: 'Before work starts' },
  { key: 'access', label: 'Access holes completed' },
  { key: 'clear', label: 'Clear cavity', hint: 'Borescope photo or video', video: true },
  { key: 'measure', label: 'Cavity measure', hint: 'Tape measure showing depth' },
  { key: 'pins', label: 'Pins installed' },
  { key: 'sock', label: 'Sock installed' },
  { key: 'injected', label: 'Injected sock', hint: 'Show joints or abutment to floor slab' },
  { key: 'reinstated', label: 'Access holes reinstated' },
];

export const TEMPS = [
  { key: 'ambient', label: 'Ambient' },
  { key: 'cavity', label: 'Cavity' },
  { key: 'pail', label: 'Pail on pump' },
  { key: 'storage', label: 'Site storage' },
];

export const HS_CHECKS = [
  'Access equipment inspected',
  'Exclusion zone in place',
  'PPE worn by all operatives',
  'Pump and hoses checked',
  'Waste removed from work area',
];

export const TOOLBOX_TOPICS = ['Working at height', 'Manual handling', 'COSHH: resin handling', 'MEWP rescue plan', 'Fire safety on site', 'Other'];

export const SITE_DOCS = [
  { key: 'rams', label: 'RAMS', required: true, note: 'Signed weekly by all operatives' },
  { key: 'elevations', label: 'Marked up elevation drawings', required: true },
  { key: 'itp', label: 'Inspection and test plan (ITP)', required: true },
  { key: 'tds', label: 'Technical data sheet' },
  { key: 'coshh', label: 'CoSHH data sheet' },
  { key: 'section', label: 'Cavity section drawing' },
  { key: 'eap', label: 'Extended application document', note: 'Standard document for all projects' },
  { key: 'testing', label: 'Testing or approval document', note: 'e.g. Warrington Fire' },
  { key: 'warranty', label: 'Warranty documents' },
  { key: 'hs_audit', label: 'H&S site audits', note: 'Internal and external' },
  { key: 'qa_audit', label: '3rd party site / quality audits' },
  { key: 'cert', label: '3rd party accreditation certificate', note: 'Upon completion' },
];

export const INSURANCE = [
  { key: 'el', label: "Employers' liability" },
  { key: 'pl', label: 'Public and products liability' },
  { key: 'car', label: 'Contractors all risks' },
  { key: 'pi', label: 'Professional indemnity' },
];

// ---------- Dates ----------
export const today = () => new Date().toISOString().slice(0, 10);
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y) / DAY + 1) / 7)).padStart(2, '0')}`;
}
const dayISO = (msAgo) => new Date(Date.now() - msAgo).toISOString().slice(0, 10);
const inDays = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

// ---------- Seed ----------
function seed() {
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const now = Date.now();

  const operatives = [
    { id: 'o1', name: 'Jay Patel', role: 'Installer', rate: 24, email: 'jay@installer.co.uk' },
    { id: 'o2', name: 'Sam Okafor', role: 'Installer', rate: 24, email: 'sam@installer.co.uk' },
    { id: 'o3', name: 'Marie Byrne', role: 'Supervisor', rate: 29, email: 'marie@installer.co.uk' },
    { id: 'o4', name: 'Luka Novak', role: 'Installer', rate: 22, email: 'luka@installer.co.uk' },
  ].map((o, i) => ({
    ...o,
    quals: [
      { id: `q${i}a`, name: 'Injecta Fire Barrier installer training', expiry: inDays(i === 3 ? 18 : 240 + i * 30), file: null },
      { id: `q${i}b`, name: 'IPAF 3a/3b (MEWP)', expiry: inDays(i === 1 ? -6 : 400 - i * 50), file: null },
      { id: `q${i}c`, name: 'CSCS card', expiry: inDays(700), file: null },
    ],
  }));

  const company = {
    name: 'Northern Facades Ltd',
    insurance: {
      el: { value: 10000000, expiry: inDays(210), file: null },
      pl: { value: 5000000, expiry: inDays(210), file: null },
      car: { value: 2000000, expiry: inDays(25), file: null },
      pi: { value: 0, expiry: '', file: null },
    },
    accreditations: [
      { id: 'a1', name: 'Injectaclad Approved Installer', expiry: inDays(330), file: null },
      { id: 'a2', name: 'FIRAS (Warringtonfire)', expiry: inDays(150), file: null },
      { id: 'a3', name: 'CHAS', expiry: '', file: null },
    ],
  };

  const sites = [
    {
      id: 's1', name: 'Harbour View Tower', client: 'Northgate Build', address: 'Wellington Street, Leeds LS1', status: 'active',
      fireRating: 60, targetPins: 120, team: ['o1', 'o2', 'o3'],
      elevations: [
        { id: 's1n', name: 'North', floors: 12, bays: 8 },
        { id: 's1e', name: 'East', floors: 12, bays: 5 },
        { id: 's1s', name: 'South', floors: 12, bays: 8 },
      ],
    },
    {
      id: 's2', name: 'Riverside Library', client: 'City of York Council', address: 'Museum Street, York YO1', status: 'active',
      fireRating: 90, targetPins: 48, team: ['o1', 'o4'],
      elevations: [
        { id: 's2w', name: 'West', floors: 4, bays: 10 },
        { id: 's2e', name: 'East', floors: 4, bays: 10 },
      ],
    },
    {
      id: 's3', name: 'Kingsway Student Block', client: 'Halden Homes', address: 'Hulme, Manchester M15', status: 'complete',
      fireRating: 120, targetPins: 30, team: ['o2', 'o3', 'o4'],
      elevations: [{ id: 's3n', name: 'North', floors: 8, bays: 6 }],
    },
  ];

  const week = isoWeek();
  for (const st of sites) {
    st.docs = {};
    for (const d of SITE_DOCS) {
      const has = d.key === 'rams' || d.key === 'elevations' || rnd() < (st.status === 'complete' ? 0.95 : 0.6);
      st.docs[d.key] = has ? [{ id: null, name: `${d.label}${d.key === 'rams' ? ' rev C' : ''}.pdf`, at: now - (10 + rnd() * 40) * DAY, rev: d.key === 'rams' ? 'C' : undefined }] : [];
    }
    if (st.id === 's1') st.docs.itp = [];
    st.rams = {
      rev: 'C',
      signatures: st.team
        .filter((o) => !(st.id === 's1' && o === 'o1'))
        .map((o) => ({ operative: o, week, rev: 'C', at: now - rnd() * 2 * DAY, sig: null })),
    };
  }

  const pins = [];
  const counts = { s1: 64, s2: 30, s3: 30 };
  for (const st of sites) {
    for (let i = 0; i < counts[st.id]; i++) {
      const el = pick(st.elevations);
      const x = 0.06 + rnd() * 0.88, y = 0.06 + rnd() * 0.88;
      const abutted = rnd() < 0.2;
      const age = st.status === 'complete' ? 40 + rnd() * 40 : rnd() * 49;
      const qaRoll = rnd();
      const qa = st.status === 'complete' || age > 10 ? (qaRoll < 0.92 ? 'approved' : 'rejected') : qaRoll < 0.55 ? 'approved' : qaRoll < 0.9 ? 'pending' : 'rejected';
      const photos = {};
      for (const h of PHOTO_HEADINGS) photos[h.key] = rnd() < 0.96 ? Array.from({ length: 1 + Math.floor(rnd() * 2) }, () => ({ id: null, sample: true })) : [];
      pins.push({
        id: `${st.id}-${i}`, siteId: st.id, elevationId: el.id, no: i + 1,
        x, y, level: levelAt(el, y),
        cavityDepth: pick([50, 75, 100, 125, 150]),
        socks: abutted ? [pick(SOCK_SIZES), pick(SOCK_SIZES)] : [pick([60, 80, 100])],
        length: Math.round((1.2 + rnd() * 4.5) * 10) / 10,
        batch: `IFB-${2400 + Math.floor(rnd() * 30)}`,
        pails: 1 + Math.floor(rnd() * 3),
        pinQty: 2 + Math.floor(rnd() * 8),
        photos,
        operative: pick(st.team),
        createdAt: now - age * DAY,
        gps: { lat: 53.79 + rnd() * 0.01, lng: -1.55 + rnd() * 0.01, acc: 8 + Math.round(rnd() * 20) },
        qa, qaNote: qa === 'rejected' ? pick(['Injected sock photo does not show abutment to slab', 'Cavity measure photo unclear, retake', 'Access holes not reinstated in photo']) : '',
        qaBy: qa !== 'pending' ? 'Office' : '', qaAt: qa !== 'pending' ? now - Math.max(0, age - 1) * DAY : null,
      });
    }
  }

  const days = [];
  for (const st of sites.filter((x) => x.status === 'active')) {
    for (let a = 1; a <= 30; a++) {
      const d = new Date(now - a * DAY);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const t = (base) => Math.round((base + rnd() * 4) * 2) / 2;
      const reading = (base) => ({ ambient: t(base), cavity: t(base - 1), pail: t(base + 6), storage: t(base + 4) });
      days.push({
        id: `${st.id}-${d.toISOString().slice(0, 10)}`, siteId: st.id, date: d.toISOString().slice(0, 10),
        am: { ...reading(7), at: d.getTime() + 8 * 3600000, gps: { lat: 53.79, lng: -1.55, acc: 12 } },
        pm: { ...reading(11), at: d.getTime() + 15 * 3600000, gps: { lat: 53.79, lng: -1.55, acc: 10 } },
        hours: Object.fromEntries(st.team.map((o) => [o, rnd() < 0.85 ? 8 : 0]).filter(([, h]) => h)),
        toolbox: rnd() < 0.3 ? pick(TOOLBOX_TOPICS.slice(0, 5)) : '',
        checks: HS_CHECKS.map(() => true),
        incident: rnd() < 0.04 ? 'Minor hand abrasion, first aid given, no lost time.' : '',
        diary: rnd() < 0.7 ? { id: null, sample: true } : null,
      });
    }
  }

  return { operatives, company, sites, pins, days, session: null, draft: null, lastBatch: {} };
}

// ---------- Persistence ----------
let state = load();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage unavailable: fall back to seed */ }
  return seed();
}
export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota or private mode */ }
}
export function resetDemo() { state = seed(); persist(); }

// ---------- Geometry ----------
export function levelAt(el, y) {
  const f = el.floors - Math.floor(Math.min(0.9999, Math.max(0, y)) * el.floors) - 1;
  return f === 0 ? 'Ground' : `Level ${f}`;
}
export function bayAt(el, x) { return Math.floor(Math.min(0.9999, Math.max(0, x)) * el.bays) + 1; }

// ---------- Accessors ----------
export const S = () => state;
export const session = () => state.session;
export const setSession = (s) => { state.session = s; persist(); };
export const operative = (id) => state.operatives.find((o) => o.id === id);
export const site = (id) => state.sites.find((x) => x.id === id);
export const elevation = (st, id) => st?.elevations.find((e) => e.id === id);
export const pin = (id) => state.pins.find((p) => p.id === id);
export const pinsFor = (siteId) => state.pins.filter((p) => p.siteId === siteId);
export const pinLabel = (p) => `HP ${String(p.no).padStart(2, '0')}`;
export const dayFor = (siteId, date = today()) => state.days.find((d) => d.siteId === siteId && d.date === date);

export function sitesFor(sess) {
  if (sess?.role === 'installer') return state.sites.filter((x) => x.team.includes(sess.operativeId) && x.status !== 'complete');
  return state.sites;
}

export function nextPinNo(siteId) {
  return pinsFor(siteId).reduce((m, p) => Math.max(m, p.no), 0) + 1;
}

export function addPin(p) { state.pins.push(p); persist(); }
export function updatePin(id, patch) { Object.assign(pin(id), patch); persist(); }

export function upsertDay(siteId, patch, date = today()) {
  let d = dayFor(siteId, date);
  if (!d) {
    d = { id: `${siteId}-${date}`, siteId, date, am: null, pm: null, hours: {}, toolbox: '', checks: HS_CHECKS.map(() => false), incident: '', diary: null };
    state.days.push(d);
  }
  Object.assign(d, patch);
  persist();
  return d;
}

export function ramsSigned(st, operativeId, week = isoWeek()) {
  return st.rams.signatures.some((x) => x.operative === operativeId && x.week === week && x.rev === st.rams.rev);
}
export function signRams(st, operativeId, sig) {
  st.rams.signatures.push({ operative: operativeId, week: isoWeek(), rev: st.rams.rev, at: Date.now(), sig });
  persist();
}

export function saveDraft(d) { state.draft = d; persist(); }
export function clearDraft() { state.draft = null; persist(); }

// ---------- Derived figures ----------
export function photoGaps(p) { return PHOTO_HEADINGS.filter((h) => !(p.photos[h.key] || []).length); }

export function siteStats(st) {
  const ps = pinsFor(st.id);
  const approved = ps.filter((p) => p.qa === 'approved').length;
  return {
    pins: ps.length,
    approved,
    pending: ps.filter((p) => p.qa === 'pending').length,
    rejected: ps.filter((p) => p.qa === 'rejected').length,
    pct: Math.min(100, Math.round((approved / st.targetPins) * 100)),
    lm: ps.reduce((t, p) => t + p.length, 0),
    pails: ps.reduce((t, p) => t + p.pails, 0),
    missingDocs: SITE_DOCS.filter((d) => d.required && !st.docs[d.key]?.length),
    unsigned: st.team.filter((o) => !ramsSigned(st, o)),
  };
}

export function dayCost(d) {
  const st = site(d.siteId);
  const labour = Object.entries(d.hours || {}).reduce((t, [o, h]) => t + h * (operative(o)?.rate || 0), 0);
  const materials = state.pins
    .filter((p) => p.siteId === st.id && new Date(p.createdAt).toISOString().slice(0, 10) === d.date)
    .reduce((t, p) => t + p.socks.reduce((u, mm) => u + (SOCK_RATE[mm] || 0) * p.length, 0), 0);
  return { labour, materials, total: labour + materials };
}

export function expiryState(iso) {
  if (!iso) return 'none';
  const days = (new Date(iso) - Date.now()) / DAY;
  return days < 0 ? 'expired' : days < 30 ? 'soon' : 'ok';
}

export function alerts() {
  const out = [];
  for (const o of state.operatives) for (const q of o.quals) {
    const e = expiryState(q.expiry);
    if (e === 'expired' || e === 'soon') out.push({ kind: e, text: `${o.name}: ${q.name}`, when: q.expiry, href: '#/company' });
  }
  for (const i of INSURANCE) {
    const e = expiryState(state.company.insurance[i.key].expiry);
    if (e === 'expired' || e === 'soon') out.push({ kind: e, text: `Insurance: ${i.label}`, when: state.company.insurance[i.key].expiry, href: '#/company' });
  }
  for (const st of state.sites.filter((x) => x.status === 'active')) {
    const s = siteStats(st);
    s.missingDocs.forEach((d) => out.push({ kind: 'missing', text: `${st.name}: ${d.label} missing`, href: `#/sites/${st.id}/docs` }));
    s.unsigned.forEach((o) => out.push({ kind: 'missing', text: `${st.name}: RAMS unsigned by ${operative(o).name} this week`, href: `#/sites/${st.id}/docs` }));
  }
  return out;
}
