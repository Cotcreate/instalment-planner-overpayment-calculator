// Local-first data store for the Injectaclad recording system (Injecta Fire Barrier).
// Records live in localStorage, files (photos, video, documents) in IndexedDB via files.js.
// Swap load()/persist() for an API sync layer when the backend exists.

const KEY = 'injectatrace.v6';
const DAY = 86400000;

// Placeholder contractor logo. The contractor uploads their own under More → Branding.
export const INJECTACLAD_LOGO = 'icons/logo-injectaclad.png';
export const IFB_LOGO = 'icons/logo-injecta-fire-barrier.png';
const svgLogo = (svg) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
// Placeholder logos for the demo installer and contractor companies; each uploads its own.
const SEED_LOGOS = {
  i1: svgLogo('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 64"><path d="M6 54 30 10l24 44z" fill="#0E7C86"/><path d="M22 54 36 30l14 24z" fill="#5FC4C9"/><text x="64" y="38" font-family="Arial Black, Arial, sans-serif" font-size="28" font-weight="900" fill="#0E3B43">APEX</text><text x="65" y="55" font-family="Arial, sans-serif" font-size="11" letter-spacing="2.4" fill="#0E7C86">CAVITY SOLUTIONS</text></svg>'),
  i2: svgLogo('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 64"><path d="M30 4 54 12v20c0 14-10 24-24 28C16 56 6 46 6 32V12z" fill="#B3261E"/><path d="M30 16c4 8 12 10 12 19a12 12 0 0 1-24 0c0-6 4-9 7-12 0 5 2 7 4 8-1-6 0-10 1-15z" fill="#FFD7A8"/><text x="64" y="36" font-family="Georgia, serif" font-size="26" font-weight="700" fill="#3B0D0A">Pennine</text><text x="65" y="54" font-family="Arial, sans-serif" font-size="11" letter-spacing="2.6" fill="#B3261E">FIRE PROTECTION</text></svg>'),
  i3: svgLogo('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 64"><rect x="6" y="8" width="48" height="48" rx="24" fill="#4B3B8F"/><path d="M22 20h8v10l10-10h10L37 33l13 11H39l-9-8v8h-8z" fill="#fff"/><text x="64" y="36" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#2A1F5C">Keystone</text><text x="65" y="54" font-family="Arial, sans-serif" font-size="11" letter-spacing="2.6" fill="#4B3B8F">PASSIVE FIRE</text></svg>'),
  k2: svgLogo('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 64"><rect x="6" y="10" width="44" height="44" fill="#7A4A12"/><path d="M6 10h11v8H6zm16 0h12v8H22zm17 0h11v8H39z" fill="#F2C38A"/><text x="60" y="36" font-family="Georgia, serif" font-size="25" font-weight="700" fill="#3D2408">Castlegate</text><text x="61" y="54" font-family="Arial, sans-serif" font-size="11" letter-spacing="3.2" fill="#7A4A12">CLADDING</text></svg>'),
};
const DEFAULT_LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 64"><rect x="2" y="6" width="52" height="52" rx="10" fill="#0F5C4C"/><path d="M14 46V18h6l14 18V18h6v28h-6L20 28v18z" fill="#fff"/><text x="68" y="34" font-family="Georgia, serif" font-size="25" font-weight="700" fill="#0F5C4C">Northern</text><text x="69" y="54" font-family="Arial, sans-serif" font-size="12.5" letter-spacing="4.6" fill="#3E6F64">FACADES LTD</text></svg>');

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
  if (sess?.role === 'client') return state.sites.filter((x) => x.clientId === sess.clientId);
  if (sess?.role === 'manager') return state.sites.filter((x) => x.contractorId === sess.companyId);
  return state.sites;
}
export const companyOf = (id) => state.companies.find((c) => c.id === id);
export const companiesOf = (type) => state.companies.filter((c) => c.type === type);
export const jobInstaller = (st) => companyOf(st?.installerCoId);
// The logo and name each portal shows in its top bar.
export function brandFor(sess) {
  if (sess?.role === 'office') return { name: 'Injectaclad', logo: INJECTACLAD_LOGO };
  if (sess?.role === 'installer') return { name: 'Injecta Fire Barrier', logo: IFB_LOGO };
  if (sess?.role === 'manager') { const c = companyOf(sess.companyId); return { name: c.name, logo: c.logo }; }
  const st = state.sites.find((x) => x.clientId === sess?.clientId);
  const c = companyOf(st?.contractorId) || companyOf('k1');
  return { name: c.name, logo: c.logo };
}
export const client = (id) => state.clients.find((c) => c.id === id);
export const clientName = (st) => client(st?.clientId)?.name || '—';
export const quote = (id) => state.quotes.find((q) => q.id === id);
export function quotesFor(sess) {
  if (sess?.role === 'client') return state.quotes.filter((q) => q.clientId === sess.clientId && q.status !== 'draft');
  if (sess?.role === 'manager') return state.quotes.filter((q) => q.contractorId === sess.companyId);
  return state.quotes;
}
export function quoteTotals(q) {
  const sub = q.lines.reduce((t, l) => t + l.qty * l.rate, 0);
  const discount = sub * (q.discount || 0) / 100;
  const net = sub - discount;
  const cost = q.lines.reduce((t, l) => t + l.qty * (l.cost || 0), 0);
  const vat = net * VAT;
  return { sub, discount, net, vat, total: net + vat, cost, margin: net ? (net - cost) / net : 0 };
}
export function quoteExpiry(q) { return (q.sentAt || q.createdAt) + q.validDays * DAY; }
export function nextQuoteRef() {
  const d = new Date();
  const n = state.quotes.reduce((m, q) => Math.max(m, +q.ref.split('-').pop() || 0), 100) + 1;
  return `Q-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${n}`;
}
// Sent quotes past their validity date are expired.
export function sweepQuotes() {
  let changed = false;
  for (const q of state.quotes) if (q.status === 'sent' && Date.now() > quoteExpiry(q)) { q.status = 'expired'; q.decidedAt = quoteExpiry(q); changed = true; }
  if (changed) persist();
}

export function createJob({ name, address = '', clientId, contractorId = null, installerCoId = null, fireRating = 60, targetPins = 60, elevations = ['North'], team = [], quoteId = null, files = [] }) {
  const id = `j${Date.now().toString(36)}`;
  const st = {
    id, name, clientId, contractorId, installerCoId, address, status: 'active', fireRating, targetPins, team, quoteId,
    elevations: elevations.map((n, i) => ({ id: `${id}e${i}`, name: n, floors: 8, bays: 6 })),
    docs: Object.fromEntries(SITE_DOCS.map((d) => [d.key, []])),
    rams: { rev: 'A', signatures: [] },
  };
  st.docs.tender = files.map((f) => ({ ...f }));
  state.sites.push(st);
  persist();
  return st;
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

// ---------- Valuations (fortnightly applications for payment) ----------
// A hold point is billable once it was installed on or before the period end AND has passed QA,
// and it hasn't been on an earlier valuation. Anything not yet passed rolls into the next one.
export const PERIOD_DAYS = 14;
const dayStart = (t) => { const x = new Date(t); x.setHours(0, 0, 0, 0); return x.getTime(); };
const dayEnd = (t) => dayStart(t) + DAY - 1;
export const readyForQA = (p) => !photoGaps(p).length && p.cavityDepth > 0 && p.length > 0 && !!p.batch && p.pinQty > 0;

function _jobStart(d, st) {
  const first = d.pins.filter((p) => p.siteId === st.id).reduce((m, p) => Math.min(m, p.createdAt), st.createdAt || Date.now());
  const x = new Date(first); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x.getTime();
}
function _billed(d, jobId) { return new Set(d.valuations.filter((v) => v.jobId === jobId).flatMap((v) => v.pinIds)); }
function _nextPeriod(d, st) {
  const last = d.valuations.filter((v) => v.jobId === st.id).sort((a, b) => b.to - a.to)[0];
  const from = last ? dayStart(last.to + DAY) : _jobStart(d, st);
  return { from, to: dayEnd(from + (PERIOD_DAYS - 1) * DAY), no: (last?.no || 0) + 1 };
}
function _rates(d, st) {
  const q = d.quotes.find((x) => x.id === st.quoteId);
  const find = (key) => q?.lines.find((l) => l.key === key)?.rate ?? CATALOGUE.find((c) => c.key === key)?.rate ?? 0;
  return { sock: Object.fromEntries(SOCK_SIZES.map((mm) => [mm, find(`sock${mm}`)])), pins: find('pins') };
}
export function summarize(list, st, d = state) {
  const r = _rates(d, st);
  const bySock = {};
  let lm = 0, fixings = 0, pails = 0;
  for (const p of list) {
    lm += p.length; fixings += p.pinQty; pails += p.pails;
    for (const mm of p.socks) bySock[mm] = (bySock[mm] || 0) + p.length;
  }
  const lines = Object.entries(bySock).sort((a, b) => a[0] - b[0]).map(([mm, m]) => ({ desc: `Injecta Fire Barrier, ${mm}mm sock`, unit: 'm', qty: +m.toFixed(1), rate: r.sock[mm], amount: m * r.sock[mm] }));
  if (fixings) lines.push({ desc: 'Fixing pins', unit: 'each', qty: fixings, rate: r.pins, amount: fixings * r.pins });
  return { count: list.length, lm: +lm.toFixed(1), fixings, pails, bySock, lines, value: lines.reduce((t, l) => t + l.amount, 0) };
}
function _candidates(d, st, to) {
  const billed = _billed(d, st.id);
  return d.pins.filter((p) => p.siteId === st.id && p.createdAt <= to && !billed.has(p.id));
}
function _makeValuation(d, st, from, to, by, at = Date.now(), notes = '') {
  const list = _candidates(d, st, to).filter((p) => p.qa === 'approved');
  const no = d.valuations.filter((v) => v.jobId === st.id).length + 1;
  return { id: `v${st.id}-${no}-${at.toString(36)}`, jobId: st.id, no, from, to, issuedAt: at, issuedBy: by, notes, pinIds: list.map((p) => p.id), sum: summarize(list, st, d) };
}
export const nextPeriod = (st) => _nextPeriod(state, st);
export const jobStart = (st) => _jobStart(state, st);
export const valuationsFor = (jobId) => state.valuations.filter((v) => v.jobId === jobId).sort((a, b) => b.no - a.no);
export const valuation = (id) => state.valuations.find((v) => v.id === id);
// What a valuation for this period would contain right now, plus what's held back.
export function draftValuation(st, from, to) {
  const all = _candidates(state, st, dayEnd(to));
  const pass = all.filter((p) => p.qa === 'approved');
  const waiting = all.filter((p) => p.qa !== 'approved');
  return { from: dayStart(from), to: dayEnd(to), pins: pass, sum: summarize(pass, st), waiting, ready: waiting.filter((p) => p.qa === 'pending' && readyForQA(p)), inPeriod: pass.filter((p) => p.createdAt >= dayStart(from)).length };
}
export function issueValuation(st, from, to, by, notes) {
  const v = _makeValuation(state, st, dayStart(from), dayEnd(to), by, Date.now(), notes);
  state.valuations.push(v); persist();
  return v;
}
export function valuationsDue(sess) {
  return sitesFor(sess).filter((st) => st.status === 'active').map((st) => ({ st, per: nextPeriod(st) })).filter((x) => x.per.to < Date.now());
}
export function passPins(ids, by) {
  const at = Date.now();
  for (const p of state.pins) if (ids.includes(p.id)) Object.assign(p, { qa: 'approved', qaNote: '', qaBy: by, qaAt: at });
  persist();
}

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
    s.missingDocs.forEach((d) => out.push({ kind: 'missing', text: `${st.name}: ${d.label} missing`, href: `#/jobs/${st.id}/docs` }));
    s.unsigned.forEach((o) => out.push({ kind: 'missing', text: `${st.name}: RAMS unsigned by ${operative(o).name} this week`, href: `#/jobs/${st.id}/docs` }));
  }
  return out;
}

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
  { key: 'tender', label: 'Quote and tender documents', note: 'Copied from the quote' },
];

export const INSURANCE = [
  { key: 'el', label: "Employers' liability" },
  { key: 'pl', label: 'Public and products liability' },
  { key: 'car', label: 'Contractors all risks' },
  { key: 'pi', label: 'Professional indemnity' },
];

// Quote price book. rate = sell, cost = internal cost (never shown to clients).
export const CATALOGUE = [
  { key: 'sock40', group: 'Fire barrier', desc: 'Injecta Fire Barrier, 40mm sock', unit: 'm', rate: 14.5, cost: 7.2 },
  { key: 'sock50', group: 'Fire barrier', desc: 'Injecta Fire Barrier, 50mm sock', unit: 'm', rate: 16, cost: 8 },
  { key: 'sock60', group: 'Fire barrier', desc: 'Injecta Fire Barrier, 60mm sock', unit: 'm', rate: 18.5, cost: 9.4 },
  { key: 'sock80', group: 'Fire barrier', desc: 'Injecta Fire Barrier, 80mm sock', unit: 'm', rate: 23, cost: 12.1 },
  { key: 'sock100', group: 'Fire barrier', desc: 'Injecta Fire Barrier, 100mm sock', unit: 'm', rate: 28, cost: 15.4 },
  { key: 'pins', group: 'Install', desc: 'Fixing pins', unit: 'each', rate: 1.8, cost: 0.6 },
  { key: 'holes', group: 'Install', desc: 'Access holes, form and reinstate', unit: 'each', rate: 12, cost: 4 },
  { key: 'labour', group: 'Install', desc: 'Installation labour, 2-person team', unit: 'day', rate: 720, cost: 420 },
  { key: 'survey', group: 'Survey', desc: 'Cavity survey and borescope inspection', unit: 'day', rate: 650, cost: 380 },
  { key: 'mewp', group: 'Access', desc: 'MEWP hire inc. delivery', unit: 'week', rate: 540, cost: 400 },
  { key: 'prelims', group: 'Prelims', desc: 'Prelims, welfare and RAMS', unit: 'item', rate: 850, cost: 500 },
];
export const QUOTE_STATUS = {
  draft: { label: 'Draft', chip: 'c-slate' },
  sent: { label: 'Sent', chip: 'c-navy' },
  accepted: { label: 'Won', chip: 'c-green' },
  declined: { label: 'Lost', chip: 'c-red' },
  expired: { label: 'Expired', chip: 'c-amber' },
};
export const LOST_REASONS = ['Price', 'Programme', 'Went with competitor', 'Project cancelled', 'No response'];
export const VAT = 0.2;

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
    { id: 'o5', name: 'Kerry Walsh', role: 'Supervisor', rate: 28, email: 'kerry@installer.co.uk' },
  ].map((o, i) => ({
    companyId: ['o4', 'o5'].includes(o.id) ? 'i2' : 'i1',
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

  const clients = [
    { id: 'c1', name: 'Northgate Build', contacts: [{ name: 'Priya Shah', email: 'priya.shah@northgatebuild.co.uk', phone: '0113 496 0123', role: 'Project manager' }], portal: 'active', invitedAt: now - 60 * DAY },
    { id: 'c2', name: 'City of York Council', contacts: [{ name: 'Tom Leary', email: 't.leary@york.gov.uk', phone: '01904 551 200', role: 'Building surveyor' }], portal: 'active', invitedAt: now - 40 * DAY },
    { id: 'c3', name: 'Halden Homes', contacts: [{ name: 'Ruth Adeyemi', email: 'ruth@haldenhomes.co.uk', phone: '0161 496 0456', role: 'Quality lead' }], portal: 'invited', invitedAt: now - 5 * DAY },
    { id: 'c4', name: 'Castlefield Developments', contacts: [{ name: 'Owen Price', email: 'owen@castlefielddev.co.uk', phone: '0161 496 0789', role: 'Commercial manager' }], portal: 'none', invitedAt: null },
    { id: 'c5', name: 'Arden Living', contacts: [{ name: 'Sophie Wren', email: 'sophie.wren@ardenliving.co.uk', phone: '0121 496 0321', role: 'Estates manager' }], portal: 'none', invitedAt: null },
  ];

  const sites = [
    {
      id: 's1', name: 'Harbour View Tower', clientId: 'c1', address: 'Wellington Street, Leeds LS1', status: 'active',
      fireRating: 60, targetPins: 120, team: ['o1', 'o2', 'o3'], contractorId: 'k1', installerCoId: 'i1',
      elevations: [
        { id: 's1n', name: 'North', floors: 12, bays: 8 },
        { id: 's1e', name: 'East', floors: 12, bays: 5 },
        { id: 's1s', name: 'South', floors: 12, bays: 8 },
      ],
    },
    {
      id: 's2', name: 'Riverside Library', clientId: 'c2', address: 'Museum Street, York YO1', status: 'active',
      fireRating: 90, targetPins: 48, team: ['o4', 'o5'], contractorId: 'k1', installerCoId: 'i2',
      elevations: [
        { id: 's2w', name: 'West', floors: 4, bays: 10 },
        { id: 's2e', name: 'East', floors: 4, bays: 10 },
      ],
    },
    {
      id: 's3', name: 'Kingsway Student Block', clientId: 'c3', address: 'Hulme, Manchester M15', status: 'complete',
      fireRating: 120, targetPins: 30, team: ['o2', 'o3'], contractorId: 'k2', installerCoId: 'i1',
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
  const counts = { s1: 150, s2: 60, s3: 30 };
  for (const st of sites) {
    // Cavity barriers run along each floor's slab line. Work goes floor by floor, bottom up,
    // round each face left to right, so hold point numbers follow the installation order.
    const slots = [];
    const maxFloors = Math.max(...st.elevations.map((e) => e.floors));
    for (let f = 1; f < maxFloors; f++) {
      for (const el of st.elevations) {
        if (f >= el.floors) continue;
        for (let b = 0; b < el.bays; b++) slots.push({ el, x: (b + 0.5) / el.bays, y: 1 - f / el.floors - 0.004 });
      }
    }
    const n = counts[st.id];
    for (let i = 0; i < n; i++) {
      const { el, x, y } = slots[i % slots.length];
      const abutted = rnd() < 0.2;
      const span = st.status === 'complete' ? [80, 40] : [49, 0];
      const age = span[0] - (i / n) * (span[0] - span[1]) + rnd() * 0.6;
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
        qaBy: qa !== 'pending' ? 'Gemma Hart' : '', qaAt: qa !== 'pending' ? Math.min(now - 3600000, now - age * DAY + (0.4 + rnd() * 2.5) * DAY) : null,
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

  // ---- Quotes: 12 months of history, linked to the live jobs where won ----
  const cat = Object.fromEntries(CATALOGUE.map((c) => [c.key, c]));
  const line = (key, qty) => ({ id: `l${Math.floor(rnd() * 1e9)}`, key, desc: cat[key].desc, unit: cat[key].unit, qty, rate: cat[key].rate, cost: cat[key].cost });
  const titles = ['Apartment block', 'Student accommodation', 'Care home', 'Hotel refurbishment', 'Office conversion', 'School extension', 'Mixed-use block', 'Hospital wing'];
  const places = ['Leeds', 'York', 'Bradford', 'Manchester', 'Sheffield', 'Harrogate', 'Wakefield', 'Huddersfield'];
  const mkLines = (lm) => {
    const sock = pick(['sock60', 'sock80', 'sock100', 'sock80']);
    return [
      line(sock, lm), line('pins', Math.round(lm * 2)), line('holes', Math.round(lm / 3)),
      line('survey', Math.max(1, Math.round(lm / 400))), line('labour', Math.max(2, Math.round(lm / 55))),
      line('mewp', Math.max(1, Math.round(lm / 300))), line('prelims', 1),
    ];
  };
  const quotes = [];
  for (let i = 0; i < 38; i++) {
    const age = 360 - i * 9.4 + rnd() * 6;
    const created = now - age * DAY;
    const lm = Math.round(150 + rnd() * 1100);
    const roll = rnd();
    let status = age > 45 ? (roll < 0.42 ? 'accepted' : roll < 0.82 ? 'declined' : 'expired') : age > 12 ? (roll < 0.35 ? 'accepted' : roll < 0.55 ? 'declined' : 'sent') : roll < 0.5 ? 'sent' : 'draft';
    const c = pick(clients);
    const d = new Date(created);
    quotes.push({
      id: `q${i + 1}`, ref: `Q-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${String(i + 101)}`,
      clientId: c.id, title: `${pick(titles)}, ${pick(places)}`, address: '', contact: c.contacts[0].name,
      fireRating: pick([60, 60, 90, 120]), status, createdAt: created,
      sentAt: status === 'draft' ? null : created + (1 + rnd() * 3) * DAY,
      decidedAt: ['accepted', 'declined', 'expired'].includes(status) ? created + (8 + rnd() * 30) * DAY : null,
      validDays: 30, discount: rnd() < 0.25 ? 5 : 0, lines: mkLines(lm),
      notes: 'Price based on drawings supplied. Assumes clear access to cavities and working hours 08:00–17:00 Mon–Fri.',
      files: [{ id: null, name: 'Elevations rev B.pdf', size: 2400000, type: 'application/pdf', at: created }, ...(rnd() < 0.5 ? [{ id: null, name: 'Cavity section.dwg.pdf', size: 860000, type: 'application/pdf', at: created }] : [])],
      lostReason: status === 'declined' ? pick(LOST_REASONS.slice(0, 4)) : '', owner: rnd() < 0.6 ? 'Dan Whitaker' : 'Gemma Hart', jobId: null,
      contractorId: rnd() < 0.7 ? 'k1' : 'k2', installerCoId: pick(['i1', 'i2', 'i3']),
    });
  }
  // The three jobs on the system were won from quotes.
  [['s1', 'c1', 'Harbour View Tower', 'Wellington Street, Leeds LS1', 1450], ['s2', 'c2', 'Riverside Library', 'Museum Street, York YO1', 520], ['s3', 'c3', 'Kingsway Student Block', 'Hulme, Manchester M15', 380]].forEach(([sid, cid, title, address, lm], k) => {
    const q = quotes[3 + k * 4];
    const job = sites.find((x) => x.id === sid);
    Object.assign(q, { clientId: cid, title, address, contact: clients.find((c) => c.id === cid).contacts[0].name, status: 'accepted', lostReason: '', jobId: sid, lines: mkLines(lm), contractorId: job.contractorId, installerCoId: job.installerCoId });
    q.decidedAt ||= q.createdAt + 14 * DAY;
    sites.find((x) => x.id === sid).quoteId = q.id;
  });
  // A couple of live quotes for the demo client to act on in their portal.
  const q1 = quotes[quotes.length - 2];
  Object.assign(q1, { contractorId: 'k1', installerCoId: 'i1', clientId: 'c1', contact: 'Priya Shah', title: 'Harbour View Tower, phase 2 (West)', status: 'sent', decidedAt: null, lostReason: '', sentAt: now - 2 * DAY, createdAt: now - 4 * DAY });
  // Older wins were delivered before this system; one recent win still needs setting up as a job.
  quotes.forEach((q) => { if (q.status === 'accepted' && !q.jobId) q.jobId = 'delivered'; });
  Object.assign(quotes.at(-5), { contractorId: 'k1', status: 'accepted', jobId: null, lostReason: '', decidedAt: now - 2 * DAY });
  Object.assign(quotes.at(-1), { contractorId: 'k1', status: 'draft', sentAt: null, decidedAt: null, lostReason: '', createdAt: now - 1 * DAY });
  Object.assign(quotes.at(-3), { status: 'sent', decidedAt: null, lostReason: '', sentAt: now - 9 * DAY });

  const managers = [
    { id: 'm1', name: 'Dan Whitaker', role: 'manager', email: 'dan@northernfacades.co.uk' },
    { id: 'm2', name: 'Gemma Hart', role: 'office', email: 'gemma@injectaclad.co.uk' },
  ];
  const companies = [
    { id: 'k1', type: 'contractor', name: 'Northern Facades', logo: DEFAULT_LOGO, contact: 'Dan Whitaker', email: 'dan@northernfacades.co.uk' },
    { id: 'k2', type: 'contractor', name: 'Castlegate Cladding', logo: SEED_LOGOS.k2, contact: 'Alan Reid', email: 'alan@castlegatecladding.co.uk' },
    { id: 'i1', type: 'installer', name: 'Apex Cavity Solutions', logo: SEED_LOGOS.i1, contact: 'Marie Byrne', email: 'office@apexcavity.co.uk' },
    { id: 'i2', type: 'installer', name: 'Pennine Fire Protection', logo: SEED_LOGOS.i2, contact: 'Kerry Walsh', email: 'jobs@penninefire.co.uk' },
    { id: 'i3', type: 'installer', name: 'Keystone Passive Fire', logo: SEED_LOGOS.i3, contact: 'Ola Adebayo', email: 'hello@keystonepf.co.uk' },
  ];

  // Fortnightly valuations already issued on the live jobs; the latest finished fortnight is left due.
  const valuations = [];
  const d = { pins, quotes, valuations, sites };
  for (const st of sites.filter((x) => x.status === 'active')) {
    for (let guard = 0; guard < 20; guard++) {
      const per = _nextPeriod(d, st);
      if (per.to > now - 14 * DAY) break;
      valuations.push(_makeValuation(d, st, per.from, per.to, 'Gemma Hart', per.to + 2 * DAY));
    }
  }

  return {
    valuations,
    operatives, company, sites, pins, days, clients, quotes, managers, companies,
    branding: { cobrand: true },
    session: null, draft: null, quoteDraft: null, lastBatch: {},
  };
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
export function resetBranding(companyId) { const c = companyOf(companyId); if (c) c.logo = companyId === 'k1' ? DEFAULT_LOGO : SEED_LOGOS[companyId] || DEFAULT_LOGO; persist(); }

