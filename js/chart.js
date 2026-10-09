// Single-series bar chart drawn at the container's real pixel width, so labels stay
// readable at 375px instead of shrinking with a scaled viewBox. Tap or hover a bar for its value.

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((n) => n >= v);
}

export function barChart(host, { data, unit = '', height = 220, label }) {
  host.classList.add('chart');
  let sel = null;

  function render() {
    const W = Math.max(280, host.clientWidth);
    const H = height, ml = 40, mr = 8, mt = 22, mb = 30;
    const iw = W - ml - mr, ih = H - mt - mb;
    const max = niceMax(Math.max(...data.map((d) => d.value)));
    const band = iw / data.length;
    const bw = Math.min(40, band * 0.62);
    const every = band < 44 ? 2 : 1;
    const y = (v) => mt + ih - (v / max) * ih;
    const top = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);

    let g = '<g class="grid axis">';
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, yy = y(v);
      g += `<line x1="${ml}" x2="${W - mr}" y1="${yy}" y2="${yy}"/><text x="${ml - 6}" y="${yy + 4}" text-anchor="end">${+v.toFixed(1)}</text>`;
    }
    g += '</g>';

    let bars = '', hits = '', xl = '<g class="axis">';
    data.forEach((d, i) => {
      const cx = ml + band * i + band / 2;
      const h = Math.max(0, (d.value / max) * ih);
      const r = Math.min(4, h / 2, bw / 2);
      const x0 = cx - bw / 2, y0 = mt + ih - h;
      // Rounded data end, square at the baseline.
      bars += h > 0
        ? `<path class="bar${i === sel ? ' sel' : ''}" d="M${x0},${mt + ih}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${mt + ih}Z"/>`
        : '';
      hits += `<rect class="hit" data-i="${i}" x="${ml + band * i}" y="${mt}" width="${band}" height="${ih + mb}" tabindex="0" role="img" aria-label="${d.label}: ${d.value} ${unit}"/>`;
      if (i % every === (data.length - 1) % every) xl += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${d.label}</text>`;
      if (i === top || i === data.length - 1) bars += `<text class="val" x="${cx}" y="${y0 - 6}" text-anchor="middle">${d.value}</text>`;
    });
    xl += '</g>';

    host.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="${label}">${g}${bars}${xl}${hits}</svg>`;
    if (sel != null) showTip(sel, ml + band * sel + band / 2, y(data[sel].value));
  }

  function showTip(i, x, yy) {
    const t = document.createElement('div');
    t.className = 'tip';
    t.textContent = `${data[i].detail ?? data[i].label}: ${data[i].value} ${unit}`;
    host.appendChild(t);
    const half = t.offsetWidth / 2;
    t.style.left = `${Math.min(host.clientWidth - half, Math.max(half, x))}px`;
    t.style.top = `${yy - 8}px`;
  }

  const choose = (e) => {
    const i = e.target.closest('.hit')?.dataset.i;
    if (i == null) return;
    if (e.type !== 'click' && sel === +i) return;
    // Touch taps toggle; a mouse click after hover keeps the tooltip.
    sel = sel === +i && e.pointerType !== 'mouse' ? null : +i;
    render();
    if (e.type === 'focusin') host.querySelector(`.hit[data-i="${i}"]`)?.focus();
  };
  host.addEventListener('click', choose);
  host.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse') choose(e); });
  host.addEventListener('focusin', choose);
  host.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { sel = null; render(); } });

  const ro = new ResizeObserver(render);
  ro.observe(host);
  render();
  return { destroy: () => ro.disconnect() };
}
