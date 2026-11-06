// Re-engage success by snake length after a short manual detour.
const { Game, Autopilot, rngFrom } = require('../snake-core.js');
const W = 16, H = 17;
const buckets = {};
const G = +(process.argv[2] || 400);
for (let s = 1; s <= G; s++) {
  const g = new Game(W, H, 1000 + s), ap = new Autopilot(g, 2000 + s), r = rngFrom(3000 + s);
  g.status = 'playing';
  const target = 5 + Math.floor(r() * 220);
  while (g.status === 'playing' && g.snake.length < target) g.step(ap.decide());
  const off = 10 + Math.floor(r() * (process.argv[3] ? +process.argv[3] : 60));
  for (let k = 0; k < off && g.status === 'playing'; k++) {
    let d = r() < 0.3 ? Math.floor(r() * 4) : g.dir; const n = g.neighbor(g.snake[0], d);
    if (n < 0 || (g.occ[n] && n !== g.snake[g.snake.length - 1])) d = ap.roomiest();
    g.step(d);
  }
  if (g.status !== 'playing') continue;
  const L = g.snake.length; ap.reset();
  let guard = 0; while (g.status === 'playing' && guard++ < 60000) g.step(ap.decide());
  const b = Math.floor(L / 25) * 25; buckets[b] = buckets[b] || [0, 0, 0]; buckets[b][g.status === 'won' ? 0 : g.status==='dead' ? 1 : 2]++;
}
for (const b of Object.keys(buckets).sort((a, c) => a - c)) console.log(`len ${b}-${+b + 24}: won ${buckets[b][0]}, lost ${buckets[b][1]}, stuck ${buckets[b][2]}`);
