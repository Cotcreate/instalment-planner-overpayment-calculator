// node snake/tests/autopilot.test.js  -> plays many full games on autopilot, fails on any loss.
const { Game, Autopilot, buildCycle, rngFrom } = require('../snake-core.js');
const W = 16, H = 17, N = W * H;

// 1. Cycles are valid Hamiltonian cycles
for (let s = 1; s <= 300; s++) {
  const { seq } = buildCycle(W, H, rngFrom(s));
  const seen = new Set(seq);
  if (seen.size !== N) throw new Error('cycle misses cells, seed ' + s);
  for (let k = 0; k < N; k++) {
    const a = seq[k], b = seq[(k + 1) % N];
    if (Math.abs(a % W - b % W) + Math.abs(((a / W) | 0) - ((b / W) | 0)) !== 1) throw new Error('non-adjacent step, seed ' + s);
  }
}
console.log('cycles ok');

function play(seed, manualSteps) {
  const g = new Game(W, H, seed), ap = new Autopilot(g, seed * 7 + 1), r = rngFrom(seed * 13 + 5);
  g.status = 'playing';
  // Simulate a person playing a while (random but not suicidal) before switching auto on.
  for (let k = 0; k < manualSteps && g.status === 'playing'; k++) {
    if (r() < 0.25) g.turn(Math.floor(r() * 4));
    const d = g.queue.length ? g.queue[0] : g.dir;
    const n = g.neighbor(g.snake[0], d);
    if (n < 0 || (g.occ[n] && n !== g.snake[g.snake.length - 1])) { g.queue.length = 0; g.step(ap.roomiest()); }
    else g.step();
  }
  if (g.status !== 'playing') return { skipped: true };
  const startLen = g.snake.length;
  let guard = 0;
  while (g.status === 'playing' && guard++ < 200000) g.step(ap.decide());
  return { status: g.status, reason: g.deathReason, moves: g.moves, len: g.snake.length, startLen };
}

let wins = 0, losses = 0, skipped = 0, moves = 0;
const GAMES = +(process.argv[2] || 120);
for (let s = 1; s <= GAMES; s++) {
  const manual = s % 3 === 0 ? 0 : Math.floor(rngFrom(s)() * 400);
  const res = play(s, manual);
  if (res.skipped) { skipped++; continue; }
  if (res.status === 'won') { wins++; moves += res.moves; }
  else { losses++; console.log('LOSS seed', s, res); }
}
console.log({ wins, losses, skipped, avgMoves: Math.round(moves / wins) });
if (losses) process.exit(1);

// 2. Auto on -> off (person plays a bit) -> back on. Guaranteed range: snake under 100 long.
let w2 = 0, l2 = 0, trapped = 0;
for (let s = 1; s <= GAMES; s++) {
  const g = new Game(W, H, 1000 + s), ap = new Autopilot(g, 2000 + s), r = rngFrom(3000 + s);
  g.status = 'playing';
  const target = 5 + Math.floor(r() * 90);
  while (g.status === 'playing' && g.snake.length < target) g.step(ap.decide());
  const off = 10 + Math.floor(r() * 60);
  for (let k = 0; k < off && g.status === 'playing'; k++) {
    let d = r() < 0.3 ? Math.floor(r() * 4) : g.dir; const n = g.neighbor(g.snake[0], d);
    if (n < 0 || (g.occ[n] && n !== g.snake[g.snake.length - 1])) d = ap.roomiest();
    g.step(d);
  }
  if (g.status !== 'playing') continue;
  if (!ap.roomiest(true).some(Boolean)) { trapped++; continue; } // person already boxed themselves in
  if (s % 2) ap.reset();
  let guard = 0;
  while (g.status === 'playing' && guard++ < 100000) g.step(ap.decide());
  if (g.status === 'won') w2++; else { l2++; console.log('RE-ENGAGE FAIL', s, g.status, g.deathReason, g.snake.length); }
}
console.log({ reengageWins: w2, reengageFails: l2, alreadyTrapped: trapped });
if (l2) process.exit(1);
