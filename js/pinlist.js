// Hold point browser: search by HP number, sort, group and filter. Used by the job's Hold points tab
// and the installer's Records. Options are remembered per list on this device.
import * as db from './store.js';
import { esc, I, openSheet, readJSON, writeJSON, num, ago, rowItem, iconBubble, qaChip } from './ui.js';

const SORTS = [['no', 'Hold point no.'], ['face', 'Face'], ['level', 'Level, top down'], ['newest', 'Newest first']];
const GROUPS = [['none', 'No grouping'], ['face', 'By face'], ['level', 'By level'], ['status', 'By QA status']];
const STATUS = [['pending', 'Awaiting QA'], ['rejected', 'Rework'], ['approved', 'Passed']];
const DEFAULTS = { sort: 'no', group: 'face', status: [], faces: [], installer: 'all', q: '' };
const PAGE = 60;

export const levelNo = (l) => (l === 'Ground' ? 0 : +String(l).replace(/\D/g, '') || 0);

const SHORT = { approved: ['c-green', 'Passed'], pending: ['c-red', 'In QA'], rejected: ['c-red', 'Rework'] };

export function pinRow(p, { showSite = false, hide = '', compact = false } = {}) {
  const st = db.site(p.siteId);
  const el = db.elevation(st, p.elevationId);
  const gaps = db.photoGaps(p).length;
  const where = [hide !== 'face' && esc(el?.name), hide !== 'level' && esc(p.level)].filter(Boolean).join(' · ');
  return rowItem({
    href: `#/pin/${p.id}`,
    lead: iconBubble(I.capture, p.qa === 'approved' ? 'green' : 'red'),
    title: `<span class="mono">${db.pinLabel(p)}</span>${where ? ` · ${where}` : ''}`,
    sub: `${showSite ? `${esc(st.name)} · ` : ''}${num(p.length)} m · ${p.socks.map((s) => `${s}mm`).join('+')}${gaps ? ` · <span style="color:var(--red);font-weight:700">${gaps} photo gap${gaps > 1 ? 's' : ''}</span>` : ` · ${ago(p.createdAt)}`}`,
    trail: compact ? `<span class="chip ${SHORT[p.qa][0]}">${SHORT[p.qa][1]}</span>` : qaChip(p.qa),
  });
}

/**
 * pinBrowser(host, { pins, key, showSite, installers })
 *  pins: hold points to browse; key: storage key for remembered options
 */
export function pinBrowser(host, { pins, key, showSite = false, installers = true, defaults = {} }) {
  const storeKey = `injectatrace.pins.${key}`;
  const base = { ...DEFAULTS, ...defaults };
  let o = { ...base, ...readJSON(storeKey, {}) };
  let shown = PAGE;
  const faceName = (p) => db.elevation(db.site(p.siteId), p.elevationId)?.name || '—';
  const faceOrder = [...new Set(pins.map((p) => `${db.site(p.siteId).elevations.findIndex((e) => e.id === p.elevationId)}|${faceName(p)}`))].sort();
  const faces = [...new Set(faceOrder.map((f) => f.split('|')[1]))];
  const people = [...new Set(pins.map((p) => p.operative))].map((id) => db.operative(id)).filter(Boolean);
  const save = () => writeJSON(storeKey, o);

  const cmp = {
    no: (a, b) => (showSite ? a.siteId.localeCompare(b.siteId) : 0) || a.no - b.no,
    face: (a, b) => faces.indexOf(faceName(a)) - faces.indexOf(faceName(b)) || a.no - b.no,
    level: (a, b) => levelNo(b.level) - levelNo(a.level) || faces.indexOf(faceName(a)) - faces.indexOf(faceName(b)) || a.no - b.no,
    newest: (a, b) => b.createdAt - a.createdAt,
  };
  const groupOf = {
    none: () => '',
    face: (p) => faceName(p),
    level: (p) => p.level,
    status: (p) => STATUS.find((s) => s[0] === p.qa)[1],
  };
  const groupOrder = {
    face: (a, b) => faces.indexOf(a) - faces.indexOf(b),
    level: (a, b) => levelNo(b) - levelNo(a),
    status: (a, b) => STATUS.findIndex((s) => s[1] === a) - STATUS.findIndex((s) => s[1] === b),
  };

  function filtered() {
    const q = o.q.replace(/\D/g, '');
    return pins.filter((p) => (!o.status.length || o.status.includes(p.qa))
      && (!o.faces.length || o.faces.includes(faceName(p)))
      && (o.installer === 'all' || p.operative === o.installer)
      && (!q || String(p.no).includes(q)))
      .sort(cmp[o.sort]);
  }

  function chips() {
    const c = [];
    o.status.forEach((s) => c.push(['status', s, STATUS.find((x) => x[0] === s)[1]]));
    o.faces.forEach((f) => c.push(['faces', f, f]));
    if (o.installer !== 'all') c.push(['installer', o.installer, db.operative(o.installer)?.name || 'Installer']);
    return c;
  }

  function draw() {
    const list = filtered();
    const active = chips();
    let body = '';
    if (o.group === 'none') {
      body = `<div class="group">${list.slice(0, shown).map((p) => pinRow(p, { showSite, compact: true })).join('') || '<div class="empty">No hold points match.</div>'}</div>`;
    } else {
      const groups = new Map();
      list.forEach((p) => { const g = groupOf[o.group](p); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(p); });
      const names = [...groups.keys()].sort(groupOrder[o.group]);
      let budget = shown;
      body = names.map((g) => {
        const ps = groups.get(g);
        const green = ps.filter((p) => p.qa === 'approved').length;
        const take = ps.slice(0, Math.max(0, budget));
        budget -= take.length;
        if (!take.length) return '';
        return `<div class="group"><div class="gh pgh"><span>${esc(g)}</span><span class="pgh-n"><span class="dot" style="color:var(--green)"></span>${green}<span class="dot" style="color:var(--red);margin-left:8px"></span>${ps.length - green}<span class="mono" style="margin-left:8px">${ps.length}</span></span></div>${take.map((p) => pinRow(p, { showSite, compact: true, hide: o.group })).join('')}</div>`;
      }).join('') || '<div class="group"><div class="empty">No hold points match.</div></div>';
    }
    host.innerHTML = `
      <div class="pinbar">
        <label class="search"><span class="sr">Find hold point number</span>${I.records}<input type="text" inputmode="numeric" id="pq" placeholder="Find HP no." value="${esc(o.q)}" autocomplete="off"></label>
        <button type="button" class="btn" id="popts" aria-haspopup="dialog">${I.filter}Sort &amp; filter${active.length ? ` <span class="chip c-navy" style="padding:1px 8px">${active.length}</span>` : ''}</button>
      </div>
      <p class="muted small pinmeta">${list.length} of ${pins.length} · ${SORTS.find((s) => s[0] === o.sort)[1].toLowerCase()}${o.group !== 'none' ? ` · ${GROUPS.find((g) => g[0] === o.group)[1].toLowerCase()}` : ''}</p>
      ${active.length ? `<div class="row" style="gap:8px;margin:-4px 0 12px">${active.map(([k, v, l]) => `<button type="button" class="btn sm fchip" data-k="${k}" data-v="${esc(v)}" aria-label="Remove filter ${esc(l)}">${esc(l)}${I.x}</button>`).join('')}<button type="button" class="btn sm ghost" id="pclear">Clear all</button></div>` : ''}
      ${body}
      ${list.length > shown ? `<button type="button" class="btn block" id="pmore">Show ${Math.min(PAGE, list.length - shown)} more</button>` : ''}`;

    const q = host.querySelector('#pq');
    q.addEventListener('input', () => {
      o.q = q.value; save(); shown = PAGE;
      const pos = q.selectionStart;
      draw();
      const nq = host.querySelector('#pq'); nq.focus(); nq.setSelectionRange(pos, pos);
    });
    host.querySelector('#popts').addEventListener('click', openOpts);
    host.querySelector('#pmore')?.addEventListener('click', () => { shown += PAGE; draw(); });
    host.querySelector('#pclear')?.addEventListener('click', () => { Object.assign(o, { status: [], faces: [], installer: 'all' }); save(); draw(); });
    host.querySelectorAll('.fchip').forEach((b) => b.addEventListener('click', () => {
      const { k, v } = b.dataset;
      if (k === 'installer') o.installer = 'all'; else o[k] = o[k].filter((x) => x !== v);
      save(); draw();
    }));
  }

  function openOpts() {
    const radios = (name, opts, cur) => `<div class="choices c2">${opts.map(([k, l]) => `<label class="choice"><input type="radio" name="${name}" value="${k}" ${k === cur ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
    const checks = (name, opts, cur) => `<div class="choices c3">${opts.map(([k, l]) => `<label class="choice"><input type="checkbox" name="${name}" value="${esc(k)}" ${cur.includes(k) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>`;
    openSheet({
      title: 'Sort & filter',
      body: `
        <fieldset class="field"><legend>Sort by</legend>${radios('sort', SORTS, o.sort)}</fieldset>
        <fieldset class="field"><legend>Group</legend>${radios('group', GROUPS, o.group)}</fieldset>
        <fieldset class="field"><legend>QA status</legend>${checks('status', STATUS, o.status)}<p class="hint">None ticked shows all.</p></fieldset>
        ${faces.length > 1 ? `<fieldset class="field"><legend>Face</legend>${checks('faces', faces.map((f) => [f, f]), o.faces)}</fieldset>` : ''}
        ${installers && people.length > 1 ? `<div class="field"><label for="pin-inst">Installer</label><select id="pin-inst"><option value="all">Everyone</option>${people.map((p) => `<option value="${p.id}" ${p.id === o.installer ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>` : ''}`,
      primary: 'Show hold points',
      secondary: 'Reset',
      onPrimary: (sh) => {
        o.sort = sh.querySelector('[name=sort]:checked').value;
        o.group = sh.querySelector('[name=group]:checked').value;
        o.status = [...sh.querySelectorAll('[name=status]:checked')].map((x) => x.value);
        o.faces = [...sh.querySelectorAll('[name=faces]:checked')].map((x) => x.value);
        o.installer = sh.querySelector('#pin-inst')?.value || 'all';
        shown = PAGE; save(); draw();
      },
      onSecondary: (sh) => {
        sh.querySelectorAll('[name=sort],[name=group]').forEach((r) => { r.checked = r.value === base[r.name]; });
        sh.querySelectorAll('[name=status],[name=faces]').forEach((c) => { c.checked = false; });
        const inst = sh.querySelector('#pin-inst'); if (inst) inst.value = 'all';
      },
    });
  }

  draw();
}
