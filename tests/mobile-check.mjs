// Mobile acceptance check. One end-to-end story per viewport (375, 390, tablet, desktop):
//   manager quotes + sends -> client accepts in portal -> manager makes it a job for one installer
//   -> installer signs RAMS, captures a hold point, logs daily temps -> back office passes QA.
// Every screen is audited for horizontal scroll, tap targets under 48px, inputs under 16px and JS errors.
// Screenshots go to test-output/. Usage: npm test
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { serve } from '../scripts/serve.mjs';

const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const OUT = 'test-output';
const VIEWPORTS = [
  { name: '375', width: 375, height: 812, mobile: true },
  { name: '390', width: 390, height: 844, mobile: true },
  { name: 'tablet', width: 820, height: 1180, mobile: true },
  { name: 'desktop', width: 1366, height: 900, mobile: false },
];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const failures = [];
const fail = (m) => { failures.push(m); console.log('  FAIL', m); };
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('injectatrace.v5')));

async function audit(page, vp, label) {
  await page.waitForTimeout(150);
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const sel = 'a.btn, button, select, textarea, input[type=text], input[type=email], input[type=password], input[type=date], input[inputmode], .choice span, .bottomnav a, .capture, label.toggle, .seg a, .seg button, a.ri, label.ri, .tile, .ptile, .dropzone';
    const small = [];
    for (const el of document.querySelectorAll(sel)) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || el.closest('[hidden]') || getComputedStyle(el).visibility === 'hidden') continue;
      if (el.closest('.capture') && el.tagName === 'SPAN') continue;
      if (el.matches('.doc *')) continue;
      if (b.width < 48 || b.height < 47.5) small.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 24)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    // Bare checkboxes must sit inside a tappable label row.
    const loose = [...document.querySelectorAll('input[type=checkbox]')].filter((c) => c.offsetParent && !c.closest('label')).length;
    const tiny = [...document.querySelectorAll('select, textarea, input:not([type=file]):not([type=radio]):not([type=checkbox])')].filter((e) => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16).length;
    return { overflow: doc.scrollWidth - doc.clientWidth, small, tiny, loose };
  });
  if (r.overflow > 0) fail(`[${vp.name}] ${label}: horizontal overflow ${r.overflow}px`);
  r.small.forEach((s) => fail(`[${vp.name}] ${label}: tap target under 48px: ${s}`));
  if (r.tiny) fail(`[${vp.name}] ${label}: ${r.tiny} inputs under 16px`);
  if (r.loose) fail(`[${vp.name}] ${label}: ${r.loose} checkboxes without a tappable row`);
  await page.screenshot({ path: `${OUT}/${vp.name}-${label}.png`, fullPage: true });
  console.log(`  ok  ${label}`);
}

async function run(browser, vp) {
  console.log(`\n${vp.name} (${vp.width}x${vp.height})`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`[${vp.name}] JS error: ${e.message}`));
  const tap = (l) => (vp.mobile ? l.tap() : l.click());
  const go = async (hash, sel) => { await page.goto(`${BASE}#/${hash}`); await page.waitForSelector(sel); };
  const sheetOpen = async () => { await page.waitForSelector('.sheet.open'); await page.waitForTimeout(300); };
  const sheetClosed = () => page.waitForSelector('.sheet', { state: 'detached' });
  const signIn = async (role) => {
    await page.goto(BASE);
    if (await page.locator('#acct').isVisible()) { await page.evaluate(() => document.getElementById('signout').click()); }
    await page.waitForSelector('#f');
    await page.locator(`label.choice:has(input[value=${role}])`).click();
    await page.locator('#f button[type=submit]').click();
    await page.mouse.move(0, 0);
    await page.waitForSelector('.bottomnav a');
  };

  await page.goto(BASE);
  await page.waitForSelector('#f');
  await audit(page, vp, '00-signin');

  // ===== Contractor manager: quote =====
  await signIn('manager');
  await page.waitForSelector('.hero');
  const nav = await page.locator('.bottomnav').boundingBox();
  if (vp.width < 1024 && Math.abs(nav.y + nav.height - vp.height) > 1) fail(`[${vp.name}] bottom nav not pinned`);
  if (!(await page.locator('.brandslot img').getAttribute('src')).startsWith('data:image')) fail(`[${vp.name}] contractor logo missing from top bar`);
  await audit(page, vp, '01-manager-home');

  await go('jobs?f=all', '.group');
  if (await page.locator('.group a.ri').count() !== 2) fail(`[${vp.name}] contractor sees jobs that aren't theirs`);
  if (!(await page.locator('.group a.ri .cologo img').count())) fail(`[${vp.name}] job rows missing installer logo`);
  await go('quotes/new', '#cl');
  if (await page.locator('#pick-contractor').count()) fail(`[${vp.name}] contractor can change contractor on quote`);
  await page.selectOption('#cl', 'c4');
  await page.selectOption('#pick-installer', 'i1');
  await page.waitForSelector('[data-cologo=i1]');
  await page.locator('#ti').fill('Canal Wharf apartments');
  await page.locator('#ti').dispatchEvent('input');
  await page.locator('#ad').fill('Canal Street, Manchester M1');
  await audit(page, vp, '02-quote-client');
  await tap(page.locator('#next'));
  await page.waitForSelector('#build');
  if (!(await page.locator('#next').isDisabled())) fail(`[${vp.name}] quote scope Next enabled with no lines`);
  await page.locator('#lm').fill('480');
  await page.locator('#lm').dispatchEvent('input');
  await tap(page.locator('label.choice:has(input[value=sock100])'));
  await tap(page.locator('#build'));
  await page.waitForSelector('.qline');
  if (await page.locator('.qline').count() !== 7) fail(`[${vp.name}] quick build did not create 7 lines`);
  await tap(page.locator('#addline'));
  await sheetOpen();
  await page.selectOption('#cat', 'mewp');
  await tap(page.locator('.sheet [data-primary]'));
  await sheetClosed();
  if (await page.locator('.qline').count() !== 8) fail(`[${vp.name}] add line failed`);
  await audit(page, vp, '03-quote-scope');
  await tap(page.locator('#next'));
  await page.waitForSelector('#dz');
  await page.locator('#up').setInputFiles([{ name: 'Elevations rev A.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') }, { name: 'site.png', mimeType: 'image/png', buffer: PNG }]);
  await page.waitForFunction(() => document.querySelectorAll('#files .ri').length === 2);
  await audit(page, vp, '04-quote-files');
  await tap(page.locator('#next'));
  await page.waitForSelector('.doc');
  await audit(page, vp, '05-quote-review');
  await tap(page.locator('#sendnow'));
  await sheetOpen();
  await tap(page.locator('.sheet [data-primary]'));
  await sheetClosed();
  let st = await state(page);
  const quote = st.quotes.find((q) => q.title === 'Canal Wharf apartments');
  if (!quote || quote.status !== 'sent' || quote.files.length !== 2 || quote.lines.length !== 8) fail(`[${vp.name}] quote not saved and sent correctly`);
  await audit(page, vp, '06-quote-sent');
  await go('quotes', '.seg');
  await audit(page, vp, '07-quotes');

  // Reports
  await go('reports', '.chart svg');
  await audit(page, vp, '08-reports');
  await page.waitForTimeout(300);
  await tap(page.locator('.chart .hit').nth(10));
  if (!(await page.locator('.tip').isVisible())) fail(`[${vp.name}] report chart tap shows no value`);
  await tap(page.locator('#gen'));
  await sheetOpen();
  const dl = page.waitForEvent('download');
  await tap(page.locator('[data-r=register]'));
  const file = await dl;
  if (!file.suggestedFilename().startsWith('quote-register')) fail(`[${vp.name}] CSV export failed`);

  // Client setup: give Castlefield portal access and a contact
  await go('clients/c4', '#invite');
  await audit(page, vp, '09-client-setup');
  await tap(page.locator('#invite'));
  await page.waitForTimeout(200);
  st = await state(page);
  if (st.clients.find((c) => c.id === 'c4').portal !== 'invited') fail(`[${vp.name}] portal invite not recorded`);

  // Branding
  await go('branding', '#lg');
  await page.locator('#lg').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForFunction(() => document.querySelector('.brandslot img').src.startsWith('data:image/png'));
  await audit(page, vp, '10-branding');
  await tap(page.locator('#reset'));

  await go('more', '.tiles');
  await audit(page, vp, '11-more');
  for (const t of ['overview', 'pins', 'daily', 'docs', 'team']) {
    await go(`jobs/s1/${t}`, '.seg');
    await page.waitForTimeout(150);
    await audit(page, vp, `12-job-${t}`);
  }
  // Hold point browser: sort, group, filter, search
  await go('jobs/s1/pins', '.pinbar');
  await tap(page.locator('#popts'));
  await sheetOpen();
  await audit(page, vp, '12b-pin-sort-filter');
  await tap(page.locator('.sheet label.choice:has(input[name=sort][value=no])'));
  await tap(page.locator('.sheet label.choice:has(input[name=group][value=level])'));
  await tap(page.locator('.sheet label.choice:has(input[name=status][value=approved])'));
  await tap(page.locator('.sheet [data-primary]'));
  await sheetClosed();
  const groups = await page.$$eval('.pgh > span:first-child', (h) => h.map((x) => x.textContent));
  const lv = (l) => (l === 'Ground' ? 0 : +l.replace(/\D/g, ''));
  if (groups.some((g, i) => i && lv(g) > lv(groups[i - 1]))) fail(`[${vp.name}] level groups not top-down: ${groups.join(',')}`);
  const firstGroup = await page.$$eval('.group:first-of-type .ri-title .mono, .pinbar ~ .group .ri-title .mono', (t) => t.slice(0, 8).map((x) => +x.textContent.replace(/\D/g, '')));
  if (firstGroup.some((n, i) => i && n < firstGroup[i - 1])) fail(`[${vp.name}] hold points not sorted by number within group`);
  if (await page.locator('.pinbar ~ .group .chip.c-red').count()) fail(`[${vp.name}] status filter let red pins through`);
  await audit(page, vp, '12c-pins-grouped');
  await page.locator('#pq').fill('12');
  await page.waitForTimeout(100);
  const hits = await page.$$eval('.ri-title .mono', (t) => t.map((x) => x.textContent));
  if (!hits.length || hits.some((h) => !h.includes('12'))) fail(`[${vp.name}] HP search wrong: ${hits.join(',')}`);
  await page.locator('#pq').fill('');
  await tap(page.locator('#pclear'));

  // Drawing display options
  await go('jobs/s1/overview', '.drawopts');
  await page.waitForTimeout(200);
  await tap(page.locator('[data-show=red]'));
  if (await page.locator('.elev-pins .pin.approved').count()) fail(`[${vp.name}] red filter still shows green pins`);
  await tap(page.locator('.drawopts label.toggle'));
  if (!(await page.locator('.plabel').count())) fail(`[${vp.name}] HP number labels not shown`);
  await audit(page, vp, '12d-drawing-options');
  await tap(page.locator('[data-show=all]'));
  await tap(page.locator('.drawopts label.toggle'));

  await go('company?t=insurance', '.seg');
  await audit(page, vp, '13-compliance');

  // ===== Injectaclad backend: companies, logos, quoting with contractor + installer =====
  await signIn('office');
  if (!(await page.locator('.brandslot img').getAttribute('src')).includes('injectaclad')) fail(`[${vp.name}] backend not showing Injectaclad logo`);
  await go('jobs?f=all', '.group');
  if (await page.locator('.group a.ri').count() !== 3) fail(`[${vp.name}] backend can't see every job`);
  await go('companies', '.seg');
  await audit(page, vp, '13b-companies');
  await tap(page.locator('#add'));
  await sheetOpen();
  await page.locator('#kn').fill('Summit Cavity Barriers');
  await page.locator('#kl').setInputFiles({ name: 'summit.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('#kprev img');
  await tap(page.locator('.sheet [data-primary]'));
  await page.waitForSelector('.cologo img');
  const summit = (await state(page)).companies.find((c) => c.name === 'Summit Cavity Barriers');
  if (!summit || !summit.logo?.startsWith('data:image')) fail(`[${vp.name}] new installer company or logo not saved`);
  await audit(page, vp, '13c-company-card');
  await go('quotes/new', '#cl');
  await page.selectOption('#cl', 'c2');
  await page.selectOption('#pick-contractor', 'k2');
  await page.selectOption('#pick-installer', summit.id);
  await page.waitForSelector(`[data-cologo="${summit.id}"]`);
  await page.locator('#ti').fill('Minster Court');
  await page.locator('#ti').dispatchEvent('input');
  await audit(page, vp, '13d-backend-quote');
  if (await page.locator('#next').isDisabled()) fail(`[${vp.name}] backend quote step 1 blocked`);
  await tap(page.locator('#cancel'));

  // ===== Client: accepts the quote in their portal =====
  // Castlefield has no demo login, so hand the quote to Northgate for the portal test.
  await page.evaluate((id) => { const s = JSON.parse(localStorage.getItem('injectatrace.v5')); s.quotes.find((q) => q.id === id).clientId = 'c1'; localStorage.setItem('injectatrace.v5', JSON.stringify(s)); }, quote.id);
  await signIn('client');
  await page.waitForSelector('.hero');
  await audit(page, vp, '14-client-home');
  const jobsBefore = (await state(page)).sites.filter((s) => s.clientId === 'c1').length;
  await go(`quotes/${quote.id}`, '#accept');
  if (/Margin|Internal only/.test(await page.locator('main').innerText())) fail(`[${vp.name}] client can see margin`);
  await audit(page, vp, '15-client-quote');
  await tap(page.locator('#accept'));
  await sheetOpen();
  await tap(page.locator('.sheet label.toggle'));
  await tap(page.locator('.sheet [data-primary]'));
  await sheetClosed();
  if ((await state(page)).quotes.find((q) => q.id === quote.id).status !== 'accepted') fail(`[${vp.name}] client accept failed`);
  await go('pin/s1-3', '.spec');
  if (/Pails used|Materials|£/.test(await page.locator('main').innerText())) fail(`[${vp.name}] client can see pails or costs`);
  await go('jobs/s1', '.seg');
  if (await page.locator('a[href$="/team"]').count()) fail(`[${vp.name}] client can see team`);

  // ===== Manager: won quote -> job for Jay only =====
  await signIn('manager');
  await go(`quotes/${quote.id}`, '#mkjob');
  await tap(page.locator('#mkjob'));
  await sheetOpen();
  await tap(page.locator('.sheet label.ri:has(input[value=o2])'));
  await audit(page, vp, '16-create-job');
  await tap(page.locator('.sheet [data-primary]'));
  await page.waitForSelector('.ministats');
  st = await state(page);
  const job = st.sites.find((s) => s.quoteId === quote.id);
  if (!job || job.team.join() !== 'o1' || job.clientId !== 'c1' || job.docs.tender.length !== 2) fail(`[${vp.name}] job not created from quote correctly`);
  if (st.sites.filter((s) => s.clientId === 'c1').length !== jobsBefore + 1) fail(`[${vp.name}] job not visible to client`);

  // ===== Installer =====
  await signIn('installer');
  await page.waitForSelector('.hero');
  if (!(await page.locator('.brandslot img').getAttribute('src')).includes('injecta-fire-barrier')) fail(`[${vp.name}] installer not showing Injecta Fire Barrier logo`);
  if (!(await page.locator('main').innerText()).includes('Canal Wharf')) fail(`[${vp.name}] assigned installer can't see new job`);
  await audit(page, vp, '17-installer-today');
  await tap(page.locator('.hero #next'));
  await sheetOpen();
  await page.locator('.sheet label.toggle').click();
  const pad = await page.locator('#sig').boundingBox();
  await page.mouse.move(pad.x + 30, pad.y + 100); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(pad.x + 30 + i * 20, pad.y + 100 + Math.sin(i) * 30);
  await page.mouse.up(); await page.mouse.move(0, 0);
  await tap(page.locator('.sheet [data-primary]'));
  await sheetClosed();

  await go('capture?site=s1', '.trail');
  await tap(page.locator('label.choice', { hasText: 'North' }));
  await audit(page, vp, '18-capture-location');
  await tap(page.locator('#next'));
  await page.waitForSelector('.elev-view');
  await page.waitForTimeout(200);
  const scale0 = await page.$eval('.elev-stage', (s) => new DOMMatrix(getComputedStyle(s).transform).a);
  await page.$eval('.elev-view', (v) => {
    const r = v.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ev = (t, id, x) => v.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: x, clientY: cy, bubbles: true }));
    ev('pointerdown', 11, cx - 30); ev('pointerdown', 12, cx + 30);
    for (let i = 1; i <= 10; i++) { ev('pointermove', 11, cx - 30 - i * 8); ev('pointermove', 12, cx + 30 + i * 8); }
    ev('pointerup', 11, cx - 110); ev('pointerup', 12, cx + 110);
  });
  if (!((await page.$eval('.elev-stage', (s) => new DOMMatrix(getComputedStyle(s).transform).a)) > scale0 * 1.5)) fail(`[${vp.name}] pinch did not zoom`);
  if (await page.locator('.elev-confirm').isVisible()) fail(`[${vp.name}] pinch dropped a pin`);
  await tap(page.locator('[data-z=fit]'));
  const box = await page.locator('.elev-view').boundingBox();
  const [tx, ty] = [box.x + box.width * 0.45, box.y + box.height * 0.45];
  if (vp.mobile) await page.touchscreen.tap(tx, ty); else await page.mouse.click(tx, ty);
  await page.waitForSelector('.elev-confirm:not([hidden])');
  if (!(await page.locator('#next').isDisabled())) fail(`[${vp.name}] Next enabled before pin confirmed`);
  await audit(page, vp, '19-capture-pin');
  await tap(page.locator('[data-c=ok]'));
  await page.waitForFunction(() => document.querySelector('#pinstate').textContent.includes('Pinned'));
  await tap(page.locator('#next'));
  await page.waitForSelector('#cavityDepth');
  for (let i = 0; i < 20; i++) await tap(page.locator('[aria-label="Increase Cavity depth"]'));
  await tap(page.locator('label.choice:has(input[name=sock0][value="80"])'));
  await page.locator('#length').fill('3.5');
  await page.locator('#length').dispatchEvent('input');
  for (let i = 0; i < 6; i++) await tap(page.locator('[aria-label="Increase Pins installed"]'));
  await page.locator('#batch').fill('ifb-2431');
  if (await page.locator('#cavityDepth').inputValue() !== '100') fail(`[${vp.name}] cavity stepper wrong`);
  await audit(page, vp, '20-capture-measure');
  await tap(page.locator('#next'));
  await page.waitForSelector('.shotrow');
  if ((await page.$$eval('.shotrow input[type=file]', (ins) => ins.map((i) => i.getAttribute('capture')))).some((c) => c !== 'environment')) fail(`[${vp.name}] photo input not rear camera`);
  for (const k of ['area', 'access', 'clear', 'measure', 'pins', 'sock', 'injected', 'reinstated']) await page.locator(`.shotrow input[data-k=${k}][accept="image/*"]`).setInputFiles({ name: `${k}.png`, mimeType: 'image/png', buffer: PNG });
  await page.waitForFunction(() => document.querySelectorAll('.shot img').length === 8);
  await audit(page, vp, '21-capture-photos');
  await tap(page.locator('#next'));
  await page.waitForSelector('.list');
  const n0 = (await state(page)).pins.length;
  await tap(page.locator('#next'));
  await page.waitForSelector('text=recorded');
  if ((await state(page)).pins.length !== n0 + 1) fail(`[${vp.name}] hold point not saved`);

  await go('daily?site=s1', '[data-open=am]');
  await audit(page, vp, '22-daily');
  await tap(page.locator('[data-open=am]'));
  await sheetOpen();
  await tap(page.locator('.sheet [data-primary]'));
  await sheetClosed();
  if (!(await state(page)).days.find((d) => d.siteId === 's1' && d.date === new Date().toISOString().slice(0, 10))?.am) fail(`[${vp.name}] AM temps not saved`);
  await go('records', '.pinbar');
  await audit(page, vp, '23-records');

  // ===== Back office: QA the new hold point =====
  await signIn('office');
  const newest = (await state(page)).pins.at(-1).id;
  await go(`pin/${newest}`, '#pass');
  await audit(page, vp, '24-office-pin');
  await tap(page.locator('#pass'));
  await page.waitForTimeout(200);
  if ((await state(page)).pins.find((p) => p.id === newest).qa !== 'approved') fail(`[${vp.name}] QA pass failed`);
  await go('qa', 'h1');
  await audit(page, vp, '25-office-qa');

  await ctx.close();
}

await mkdir(OUT, { recursive: true });
const server = await serve(PORT);
const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) await run(browser, vp);
} catch (e) {
  fail(`crashed: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
  server.close();
}
console.log(failures.length ? `\n${failures.length} failure(s)` : '\nAll checks passed');
process.exit(failures.length ? 1 : 0);
