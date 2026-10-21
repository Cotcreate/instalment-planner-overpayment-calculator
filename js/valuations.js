// Fortnightly valuations: what's billable for a period (installed by period end + QA passed, never billed twice),
// one-tap QA for complete hold points, issue, and a branded report + spreadsheet to attach to the invoice.
import * as db from './store.js';
import { pinRow } from './pinlist.js';
import {
  esc, I, toast, setAction, openSheet, rowItem, sectionHead, coLogo, money, moneyK, num, dateShort, date,
  downloadFile, csv, wordmark, iconBubble,
} from './ui.js';

const DAY = 86400000;
const staff = (sess) => sess.role === 'manager' || sess.role === 'office';
const iso = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
const range = (a, b) => `${dateShort(a)} – ${dateShort(b)}`;
export const valRef = (v) => `VAL-${v.jobId.toUpperCase()}-${String(v.no).padStart(3, '0')}`;

export function valuationRow(v) {
  const st = db.site(v.jobId);
  return rowItem({
    href: `#/valuation/${v.id}`,
    lead: coLogo(db.jobInstaller(st), 64, 44),
    title: `Valuation ${v.no} · ${esc(st.name)}`,
    sub: `${range(v.from, v.to)} · ${v.sum.count} HP · ${num(v.sum.lm, 0)} m`,
    trail: `<span>${moneyK(v.sum.value)}</span><span class="chip c-green">Issued</span>`,
  });
}

// ---------- Hub ----------
export function viewValuations(ctx) {
  const { main, sess } = ctx;
  const due = db.valuationsDue(sess);
  const upcoming = db.sitesFor(sess).filter((st) => st.status === 'active' && !due.some((d) => d.st === st)).map((st) => ({ st, per: db.nextPeriod(st) }));
  const ids = new Set(db.sitesFor(sess).map((s) => s.id));
  const issued = db.S().valuations.filter((v) => ids.has(v.jobId)).sort((a, b) => b.issuedAt - a.issuedAt);
  const dueVal = due.reduce((t, d) => t + db.draftValuation(d.st, d.per.from, d.per.to).sum.value, 0);

  main.innerHTML = `
    <div class="pagehead"><div><p class="eyebrow">Every ${db.PERIOD_DAYS} days · applications for payment</p><h1>Valuations</h1></div></div>
    <section class="hero">
      <p class="eyebrow">Ready to value</p>
      <div class="big">${moneyK(dueVal)}</div>
      <p class="sub" style="margin:4px 0 0">${due.length} job${due.length === 1 ? '' : 's'} with a finished fortnight to bill · ex VAT</p>
      ${due.length ? `<a class="btn accent block" style="margin-top:16px" href="#/valuations/${due[0].st.id}">Prepare ${esc(due[0].st.name)}</a>` : ''}
    </section>
    ${due.length ? `${sectionHead('Due now')}<div class="group">${due.map(({ st, per }) => {
      const dv = db.draftValuation(st, per.from, per.to);
      return rowItem({ href: `#/valuations/${st.id}`, lead: coLogo(db.jobInstaller(st), 64, 44), title: `${esc(st.name)} · No. ${per.no}`, sub: `${range(per.from, per.to)} · ${dv.pins.length} HP passed${dv.waiting.length ? ` · ${dv.waiting.length} held back` : ''}`, trail: `<span>${moneyK(dv.sum.value)}</span><span class="chip c-orange">Due</span>` });
    }).join('')}</div>` : ''}
    ${upcoming.length ? `${sectionHead('In progress')}<div class="group">${upcoming.map(({ st, per }) => rowItem({ href: `#/valuations/${st.id}`, lead: coLogo(db.jobInstaller(st), 64, 44), title: `${esc(st.name)} · No. ${per.no}`, sub: `Period ends ${dateShort(per.to)}`, trail: '<span class="chip c-slate">Open</span>' })).join('')}</div>` : ''}
    ${sectionHead('Issued')}
    <div class="group">${issued.slice(0, 20).map(valuationRow).join('') || '<div class="empty small">None yet.</div>'}</div>`;
  setAction(main, null);
}

// ---------- Prepare ----------
export function viewValuationBuilder(ctx, jobId, params) {
  const { main, sess } = ctx;
  const st = db.site(jobId);
  if (!st || !db.sitesFor(sess).includes(st)) { main.innerHTML = '<p class="empty card">Job not found.</p>'; setAction(main, null); return; }
  const per = db.nextPeriod(st);
  const from = params?.get('from') ? fromISO(params.get('from')) : per.from;
  const to = params?.get('to') ? fromISO(params.get('to')) : Math.min(per.to, Date.now());
  const dv = db.draftValuation(st, from, to);
  const held = dv.waiting.filter((p) => !dv.ready.includes(p));
  const prev = db.valuationsFor(st.id);
  const toDate = prev.reduce((t, v) => t + v.sum.value, 0);
  const byFace = {};
  dv.pins.forEach((p) => { const f = db.elevation(st, p.elevationId)?.name || '—'; byFace[f] = (byFace[f] || 0) + 1; });
  const maxF = Math.max(1, ...Object.values(byFace));
  const ended = per.to < Date.now();

  main.innerHTML = `
    <a class="btn sm ghost" href="#/valuations" style="margin:-8px 0 8px -12px">${I.back}Valuations</a>
    <p class="eyebrow">${esc(db.clientName(st))}</p>
    <h1 style="margin-bottom:6px">${esc(st.name)} · Valuation ${per.no}</h1>
    <div class="cobar">${[['Installer', db.jobInstaller(st)], ['Contractor', db.companyOf(st.contractorId)]].filter(([, co]) => co).map(([l, co]) => `<span class="copill">${coLogo(co, 64, 32)}<span>${l} <b>${esc(co.name)}</b></span></span>`).join('')}</div>

    <section class="card">
      <div class="spread"><p class="eyebrow" style="margin:0">Period</p>${ended ? '<span class="chip c-orange">Fortnight ended · due</span>' : `<span class="chip c-slate">Ends ${dateShort(per.to)}</span>`}</div>
      <div class="row" style="flex-wrap:nowrap;margin-top:10px">
        <div class="field" style="flex:1;margin:0"><label for="vf" class="small">From</label><input id="vf" type="date" value="${iso(dv.from)}"></div>
        <div class="field" style="flex:1;margin:0"><label for="vt" class="small">To</label><input id="vt" type="date" value="${iso(dv.to)}" max="${iso(Date.now())}"></div>
      </div>
      <p class="hint">Starts the day after Valuation ${per.no - 1 || '—'}${prev.length ? ` (${dateShort(prev[0].to)})` : ''}. Hold points can't be billed twice.</p>
    </section>

    <section class="hero">
      <p class="eyebrow">This valuation · ex VAT</p>
      <div class="big">${money(dv.sum.value)}</div>
      <p class="sub" style="margin:4px 0 0">${dv.pins.length} hold points passed QA${dv.pins.length - dv.inPeriod ? ` · ${dv.pins.length - dv.inPeriod} carried over from earlier` : ''}</p>
      <div class="hero-stats" style="margin-bottom:0">
        <div><b>${num(dv.sum.lm, 0)}m</b><span>Injected</span></div>
        <div><b>${dv.sum.fixings}</b><span>Fixing pins</span></div>
        <div><b>${dv.sum.pails}</b><span>Pails</span></div>
      </div>
    </section>

    ${dv.ready.length ? `
    <section class="card warn">
      <div style="display:flex;gap:12px;align-items:flex-start">${iconBubble(I.qa, 'orange')}
        <div style="flex:1"><h3 style="margin:2px 0 4px">${dv.ready.length} complete hold point${dv.ready.length > 1 ? 's are' : ' is'} waiting for QA</h3>
        <p class="muted small" style="margin:0 0 12px">All 8 photo headings and every measurement are in. Pass them now and they go on this valuation.</p>
        <button class="btn good block" id="passready">${I.check}Pass ${dv.ready.length} and include</button></div></div>
    </section>` : ''}
    ${held.length ? `
    <div class="group">${rowItem({ href: '#/qa', lead: iconBubble(I.clock, 'slate'), title: `${held.length} held back`, sub: `${held.filter((p) => p.qa === 'rejected').length} in rework, ${held.filter((p) => p.qa === 'pending').length} with gaps. They roll into the next valuation once passed.` })}</div>` : ''}

    <div class="twocol">
      <div>
        ${sectionHead('Priced at quoted rates')}
        <div class="group">${dv.sum.lines.map((l) => `<div class="qline"><span><span class="d">${esc(l.desc)}</span><br><span class="m">${num(l.qty, 1)} ${l.unit} × ${money(l.rate, 2)}</span></span><span class="t">${money(l.amount)}</span></div>`).join('') || '<div class="empty small">Nothing billable in this period yet.</div>'}
          <div class="totals"><div class="grand"><span>Total ex VAT</span><span>${money(dv.sum.value)}</span></div>
          <div class="small muted"><span>Job to date after this</span><span>${moneyK(toDate + dv.sum.value)} · ${prev.length + 1} valuations</span></div></div></div>
      </div>
      <div>
        ${sectionHead('By face')}
        <section class="card"><ul class="bars">${Object.entries(byFace).map(([f, n]) => `<li><span class="lbl">${esc(f)}</span><span class="val">${n} HP</span><span class="track"><i class="won" style="width:${(n / maxF) * 100}%"></i></span></li>`).join('') || '<li class="muted">—</li>'}</ul></section>
        <details class="disc"><summary><span>All ${dv.pins.length} hold points</span></summary>${dv.pins.slice().sort((a, b) => a.no - b.no).slice(0, 120).map((p) => pinRow(p, { compact: true })).join('')}${dv.pins.length > 120 ? `<div class="empty small">…and ${dv.pins.length - 120} more on the report.</div>` : ''}</details>
      </div>
    </div>
    <div class="field" style="margin-top:6px"><label for="vn">Note on the report <span class="muted">(optional)</span></label><textarea id="vn" rows="2" placeholder="e.g. Includes North and East elevations, levels 1–4"></textarea></div>`;

  const go = (f, t) => { location.hash = `#/valuations/${st.id}?from=${iso(f)}&to=${iso(t)}`; };
  main.querySelector('#vf').addEventListener('change', (e) => e.target.value && go(fromISO(e.target.value), dv.to));
  main.querySelector('#vt').addEventListener('change', (e) => e.target.value && go(dv.from, fromISO(e.target.value)));
  main.querySelector('#passready')?.addEventListener('click', () => {
    db.passPins(dv.ready.map((p) => p.id), sess.name);
    toast(`${dv.ready.length} hold points passed QA`);
    ctx.render();
  });

  const bar = setAction(main, `<button class="btn primary" id="issue" ${dv.pins.length ? '' : 'disabled'}>Issue valuation ${per.no} · ${moneyK(dv.sum.value)}</button>`);
  bar.querySelector('#issue').addEventListener('click', () => openSheet({
    title: `Issue valuation ${per.no}`,
    body: `<p><strong>${dv.pins.length} hold points</strong>, ${num(dv.sum.lm, 0)} m injected, <strong>${money(dv.sum.value)}</strong> ex VAT for ${range(dv.from, dv.to)}.</p>
      <p class="muted small">Once issued these hold points are locked to this valuation and won't appear on another. You'll get the report and spreadsheet to attach to your invoice.</p>`,
    primary: 'Issue',
    onPrimary: () => {
      const v = db.issueValuation(st, dv.from, dv.to, sess.name, main.querySelector('#vn').value.trim());
      toast(`Valuation ${v.no} issued`);
      location.hash = `#/valuation/${v.id}`;
    },
  }));
}

// ---------- Issued report ----------
export function viewValuationDoc(ctx, id) {
  const { main, sess } = ctx;
  const v = db.valuation(id);
  const st = v && db.site(v.jobId);
  if (!v || !db.sitesFor(sess).includes(st)) { main.innerHTML = '<p class="empty card">Valuation not found.</p>'; setAction(main, null); return; }
  const pins = v.pinIds.map(db.pin).filter(Boolean).sort((a, b) => a.no - b.no);
  const con = db.companyOf(st.contractorId);
  const inst = db.jobInstaller(st);
  const all = db.valuationsFor(st.id).filter((x) => x.no <= v.no);
  const toDate = all.reduce((t, x) => t + x.sum.value, 0);
  const passedToDate = all.reduce((t, x) => t + x.sum.count, 0);
  const vat = v.sum.value * db.VAT;
  const faces = {};
  pins.forEach((p) => { const f = db.elevation(st, p.elevationId)?.name || '—'; (faces[f] ||= { n: 0, lm: 0, levels: new Set() }); faces[f].n++; faces[f].lm += p.length; faces[f].levels.add(p.level); });
  const isClient = sess.role === 'client';

  main.innerHTML = `
    <div class="spread noprint" style="margin:-8px 0 10px">
      <a class="btn sm ghost" href="${staff(sess) ? '#/valuations' : `#/jobs/${st.id}/valuations`}" style="margin-left:-12px">${I.back}Back</a>
      <div class="row" style="gap:8px;flex-wrap:nowrap"><button class="btn sm" id="xls">${I.records}Spreadsheet</button><button class="btn sm primary" id="pdf">${I.file}Print / PDF</button></div>
    </div>
    <article class="doc vdoc" aria-label="Valuation ${v.no}">
      <header class="doc-head">
        ${con ? `<img src="${con.logo}" alt="${esc(con.name)}">` : ''}
        <div class="ttl"><b>VALUATION ${v.no}</b><span class="mono">${valRef(v)}</span></div>
      </header>
      <div class="doc-meta">
        <div><p class="eyebrow">Job</p><p><strong>${esc(st.name)}</strong><br><span class="small">${esc(st.address || '')}</span></p></div>
        <div><p class="eyebrow">Client</p><p><strong>${esc(db.clientName(st))}</strong></p></div>
        <div><p class="eyebrow">Period</p><p><strong>${date(v.from)} – ${date(v.to)}</strong></p></div>
        <div><p class="eyebrow">Issued</p><p>${date(v.issuedAt)} · ${esc(v.issuedBy)}</p></div>
      </div>
      <div class="vsum">
        <div><b>${v.sum.count}</b><span>Hold points passed QA</span></div>
        <div><b>${num(v.sum.lm, 1)} m</b><span>Barrier injected</span></div>
        <div><b>${v.sum.fixings}</b><span>Fixing pins</span></div>
        <div><b>${money(v.sum.value)}</b><span>Value ex VAT</span></div>
      </div>
      <table>
        <thead><tr><th>Item</th><th class="num">Qty</th><th class="num hide-sm">Rate</th><th class="num">Amount</th></tr></thead>
        <tbody>${v.sum.lines.map((l) => `<tr><td>${esc(l.desc)}</td><td class="num">${num(l.qty, 1)} ${l.unit}</td><td class="num hide-sm">${money(l.rate, 2)}</td><td class="num">${money(l.amount, 2)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="doc-tot">
        <div><span>This valuation</span><span>${money(v.sum.value, 2)}</span></div>
        <div><span>VAT 20%</span><span>${money(vat, 2)}</span></div>
        <div class="grand"><span>Total</span><span>${money(v.sum.value + vat, 2)}</span></div>
        <div class="small muted"><span>Valued to date (ex VAT)</span><span>${money(toDate, 2)}</span></div>
        <div class="small muted"><span>Hold points to date</span><span>${passedToDate} of ${st.targetPins}</span></div>
      </div>
      ${v.notes ? `<p class="eyebrow" style="margin-top:18px">Notes</p><p class="small">${esc(v.notes)}</p>` : ''}
      <p class="eyebrow" style="margin-top:22px">By face</p>
      <table><thead><tr><th>Face</th><th class="num">Hold points</th><th class="num">Metres</th><th class="hide-sm">Levels</th></tr></thead>
        <tbody>${Object.entries(faces).map(([f, x]) => `<tr><td>${esc(f)}</td><td class="num">${x.n}</td><td class="num">${num(x.lm, 1)}</td><td class="hide-sm small">${[...x.levels].sort((a, b) => (a === 'Ground' ? -1 : b === 'Ground' ? 1 : a.localeCompare(b, undefined, { numeric: true }))).join(', ')}</td></tr>`).join('')}</tbody></table>
      <p class="eyebrow pb" style="margin-top:22px">Schedule of hold points · ${pins.length}</p>
      <table class="sched">
        <thead><tr><th>HP</th><th>Face · level</th><th class="hide-sm">Installed</th><th class="hide-sm">QA passed</th><th>Sock</th><th class="num">m</th><th class="num hide-sm">Pins</th><th class="hide-sm">Batch</th></tr></thead>
        <tbody>${pins.map((p) => `<tr><td class="mono">${String(p.no).padStart(2, '0')}</td><td>${esc(db.elevation(st, p.elevationId)?.name)} · ${esc(p.level)}</td><td class="hide-sm">${dateShort(p.createdAt)}</td><td class="hide-sm">${p.qaAt ? dateShort(p.qaAt) : ''}</td><td class="mono">${p.socks.join('+')}</td><td class="num">${num(p.length, 1)}</td><td class="num hide-sm">${p.pinQty}</td><td class="mono hide-sm">${esc(p.batch)}</td></tr>`).join('')}</tbody>
      </table>
      <footer class="doc-foot">
        <span class="small muted">Every hold point listed has photographic QA evidence in Injectatrace.${inst ? ` Installed by ${esc(inst.name)}, an Injectaclad Approved Installer.` : ''}</span>
        <span class="powered">QA records by ${wordmark()}</span>
      </footer>
    </article>`;

  main.querySelector('#pdf').addEventListener('click', () => window.print());
  main.querySelector('#xls').addEventListener('click', () => {
    const rows = [
      [`Valuation ${v.no}`, valRef(v)], ['Job', st.name], ['Client', db.clientName(st)], ['Contractor', con?.name || ''], ['Installer', inst?.name || ''],
      ['Period', `${iso(v.from)} to ${iso(v.to)}`], ['Issued', `${iso(v.issuedAt)} by ${v.issuedBy}`], [],
      ['Item', 'Qty', 'Unit', 'Rate £', 'Amount £'],
      ...v.sum.lines.map((l) => [l.desc, l.qty, l.unit, l.rate.toFixed(2), l.amount.toFixed(2)]),
      ['Total ex VAT', '', '', '', v.sum.value.toFixed(2)], ['VAT 20%', '', '', '', vat.toFixed(2)], ['Total', '', '', '', (v.sum.value + vat).toFixed(2)], [],
      ['HP', 'Face', 'Level', 'Bay', 'Installed', 'QA passed', 'Sock mm', 'Length m', 'Fixing pins', isClient ? null : 'Pails', 'Pail batch', 'Cavity depth mm', 'Installed by'].filter((x) => x !== null),
      ...pins.map((p) => [p.no, db.elevation(st, p.elevationId)?.name, p.level, p.bay || '', iso(p.createdAt), p.qaAt ? iso(p.qaAt) : '', p.socks.join('+'), p.length, p.pinQty, isClient ? null : p.pails, p.batch, p.cavityDepth, db.operative(p.operative)?.name || ''].filter((x, i) => !(isClient && i === 9))),
    ];
    downloadFile(`Valuation-${v.no}-${st.name.replace(/\W+/g, '-')}-${iso(v.to)}.csv`, csv(rows));
    toast('Spreadsheet downloaded');
  });
  setAction(main, null);
}

// Job tab: next valuation + history.
export function jobValuations(ctx, st, host) {
  const isStaff = staff(ctx.sess);
  const per = db.nextPeriod(st);
  const list = db.valuationsFor(st.id);
  const dv = isStaff ? db.draftValuation(st, per.from, Math.min(per.to, Date.now())) : null;
  host.innerHTML = `
    ${isStaff ? `<section class="card ${per.to < Date.now() ? 'warn' : ''}">
      <div class="spread"><div><p class="eyebrow" style="margin:0">Next · Valuation ${per.no}</p><h3 style="margin:4px 0 2px">${range(per.from, per.to)}</h3><p class="muted small" style="margin:0">${dv.pins.length} HP passed so far · ${moneyK(dv.sum.value)}${dv.ready.length ? ` · ${dv.ready.length} ready for QA` : ''}</p></div>
        ${per.to < Date.now() ? '<span class="chip c-orange">Due</span>' : '<span class="chip c-slate">Open</span>'}</div>
      <a class="btn primary block" style="margin-top:14px" href="#/valuations/${st.id}">Prepare valuation ${per.no}</a>
    </section>` : ''}
    ${sectionHead(`Issued <span class="mono muted" style="font-size:15px">${list.length}</span>`)}
    <div class="group">${list.map(valuationRow).join('') || '<div class="empty small">No valuations yet.</div>'}</div>`;
}
