/*
 * Snake core: game rules + autopilot. No DOM, no canvas, no timers.
 * Everything here is plain integer logic so it ports 1:1 to C++ on the Kode Dot
 * (see kodedot/snake_core.h, which mirrors this file).
 *
 * Cells are indexed i = y * W + x. W must be even (needed for the autopilot's
 * Hamiltonian cycle: a grid with an odd number of cells cannot have one, so a
 * 15x17 board could never be cleared by a guaranteed route. 16x17 can).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SnakeCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 0 up, 1 right, 2 down, 3 left
  var DX = [0, 1, 0, -1];
  var DY = [-1, 0, 1, 0];

  function rngFrom(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- Random Hamiltonian cycle ----------
   * 1. Random spanning tree over (W/2) x floor(H/2) blocks (Kruskal).
   * 2. Walk around the tree's walls: every 2x2 block becomes part of one loop
   *    that visits every cell exactly once.
   * 3. If H is odd, the last row is stitched in: each bottom block's floor
   *    edge is swapped for a 3-step dip through the extra row.
   * 4. Random mirror X / mirror Y / direction, so every game takes a new route.
   */
  function buildCycle(W, H, rng) {
    if (W % 2) throw new Error('W must be even');
    var bw = W / 2, bh = Math.floor(H / 2), nb = bw * bh, N = W * H;
    var parent = new Int32Array(nb);
    for (var p = 0; p < nb; p++) parent[p] = p;
    function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }

    var edges = [];
    for (var j = 0; j < bh; j++) for (var i = 0; i < bw; i++) {
      var n = j * bw + i;
      if (i + 1 < bw) edges.push(n * 2);      // right
      if (j + 1 < bh) edges.push(n * 2 + 1);  // down
    }
    for (var e = edges.length - 1; e > 0; e--) {
      var r = Math.floor(rng() * (e + 1)); var tmp = edges[e]; edges[e] = edges[r]; edges[r] = tmp;
    }
    var hasR = new Uint8Array(nb), hasD = new Uint8Array(nb);
    edges.forEach(function (code) {
      var a = code >> 1, down = code & 1, b = down ? a + bw : a + 1;
      var ra = find(a), rb = find(b);
      if (ra !== rb) { parent[ra] = rb; if (down) hasD[a] = 1; else hasR[a] = 1; }
    });

    var adj = [];
    for (var c = 0; c < N; c++) adj.push([]);
    function id(x, y) { return y * W + x; }
    function link(a, b) { adj[a].push(b); adj[b].push(a); }
    function unlink(a, b) { adj[a].splice(adj[a].indexOf(b), 1); adj[b].splice(adj[b].indexOf(a), 1); }

    for (j = 0; j < bh; j++) for (i = 0; i < bw; i++) {
      n = j * bw + i;
      var x = 2 * i, y = 2 * j;
      var TL = id(x, y), TR = id(x + 1, y), BL = id(x, y + 1), BR = id(x + 1, y + 1);
      var up = j > 0 && hasD[n - bw], left = i > 0 && hasR[n - 1];
      if (!up) link(TL, TR);
      if (!hasD[n]) link(BL, BR);
      if (!left) link(TL, BL);
      if (!hasR[n]) link(TR, BR);
      if (hasR[n]) { link(TR, id(x + 2, y)); link(BR, id(x + 2, y + 1)); }
      if (hasD[n]) { link(BL, id(x, y + 2)); link(BR, id(x + 1, y + 2)); }
    }
    if (H % 2) {
      var yb = H - 2, ye = H - 1;
      for (i = 0; i < bw; i++) {
        var a = id(2 * i, yb), b = id(2 * i + 1, yb);
        unlink(a, b);
        link(a, id(2 * i, ye)); link(id(2 * i, ye), id(2 * i + 1, ye)); link(id(2 * i + 1, ye), b);
      }
    }

    var seq = new Int32Array(N), prev = -1, cur = 0;
    for (var k = 0; k < N; k++) {
      seq[k] = cur;
      var nx = adj[cur][0] !== prev ? adj[cur][0] : adj[cur][1];
      prev = cur; cur = nx;
    }
    if (cur !== 0) throw new Error('cycle did not close');

    var fx = rng() < 0.5, fy = rng() < 0.5, rev = rng() < 0.5;
    for (k = 0; k < N; k++) {
      var cx = seq[k] % W, cy = (seq[k] / W) | 0;
      if (fx) cx = W - 1 - cx;
      if (fy) cy = H - 1 - cy;
      seq[k] = cy * W + cx;
    }
    if (rev) seq.reverse();
    var ord = new Int32Array(N);
    for (k = 0; k < N; k++) ord[seq[k]] = k;
    return { seq: seq, ord: ord };
  }

  /* ---------- Game ---------- */
  // maxFood: apples on the board at once (1 = classic, 5 = feast).
  function Game(W, H, seed, maxFood) {
    this.W = W; this.H = H; this.N = W * H;
    this.maxFood = maxFood || 1;
    this.rng = rngFrom(seed == null ? (Math.random() * 4294967296) >>> 0 : seed);
    this.reset();
  }

  Game.prototype.reset = function () {
    var W = this.W, H = this.H;
    this.occ = new Uint8Array(this.N);
    var hx = W / 2, hy = Math.floor(H / 2);
    this.snake = [];             // head first
    for (var k = 0; k < 3; k++) { var c = hy * W + hx - k; this.snake.push(c); this.occ[c] = 1; }
    this.dir = 1;
    this.queue = [];
    this.status = 'ready';       // ready | playing | paused | dead | won
    this.deathReason = '';
    this.score = 0;
    this.moves = 0;
    this.lastEat = -1;
    this.foods = [];
    this.isFood = new Uint8Array(this.N);
    this.spawnFood();
  };

  Game.prototype.setMaxFood = function (k) {
    this.maxFood = k;            // extras above a lowered limit just get eaten, not replaced
    if (this.status !== 'won') this.spawnFood();
  };

  // Top up to maxFood apples on random empty cells.
  Game.prototype.spawnFood = function () {
    while (this.foods.length < this.maxFood) {
      var free = this.N - this.snake.length - this.foods.length;
      if (free <= 0) return;
      var pick = Math.floor(this.rng() * free);
      for (var c = 0; c < this.N; c++) {
        if (!this.occ[c] && !this.isFood[c]) {
          if (pick === 0) { this.foods.push(c); this.isFood[c] = 1; break; }
          pick--;
        }
      }
    }
  };

  // Manual input. Ignores reversals and repeats; buffers up to 2 turns.
  Game.prototype.turn = function (d) {
    var last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (d === last || d === (last + 2) % 4) return false;
    if (this.queue.length < 2) this.queue.push(d);
    return true;
  };

  Game.prototype.neighbor = function (c, d) {
    var x = c % this.W + DX[d], y = ((c / this.W) | 0) + DY[d];
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return -1;
    return y * this.W + x;
  };

  // Advance one tick. forcedDir comes from the autopilot.
  Game.prototype.step = function (forcedDir) {
    if (this.status !== 'playing') return;
    var d = forcedDir != null ? forcedDir : (this.queue.length ? this.queue.shift() : this.dir);
    if (forcedDir != null) this.queue.length = 0;
    this.dir = d;
    var head = this.snake[0], n = this.neighbor(head, d);
    this.moves++;
    if (n < 0) { this.status = 'dead'; this.deathReason = 'wall'; return; }
    var grow = this.isFood[n] === 1;
    if (!grow) { var t = this.snake.pop(); this.occ[t] = 0; }
    if (this.occ[n]) { this.status = 'dead'; this.deathReason = 'self'; if (!grow) { this.snake.push(t); this.occ[t] = 1; } return; }
    this.snake.unshift(n); this.occ[n] = 1;
    if (grow) {
      this.isFood[n] = 0;
      this.foods.splice(this.foods.indexOf(n), 1);
      this.score++;
      this.lastEat = this.moves;
      if (this.snake.length === this.N) { this.status = 'won'; return; }
      this.spawnFood();
    }
  };

  /* ---------- Autopilot ----------
   * Works with any number of apples: it always aims for the next one along
   * its route, and extra growth never breaks the cycle guarantee.
   * Follows a random Hamiltonian cycle, which on its own guarantees a full
   * board. To look like a person rather than a lawnmower it cuts corners
   * toward the food while the board is roomy, but only along moves that keep
   * the body in cycle order, so the guarantee is never broken.
   * It can be switched on mid-game: it picks a cycle the current body can
   * merge into safely, then takes over.
   */
  function Autopilot(game, seed) {
    this.g = game;
    this.rng = rngFrom(seed == null ? (Math.random() * 4294967296) >>> 0 : seed);
    this.cycle = null;
  }

  Autopilot.prototype.reset = function () { this.cycle = null; };

  function dist(a, b, N) { return (b - a + N) % N; }

  // Body sits in cycle order from tail to head: the safe state.
  Autopilot.prototype.aligned = function (cyc) {
    var g = this.g, s = g.snake, N = g.N, ord = cyc.ord;
    var t = ord[s[s.length - 1]], last = -1;
    for (var k = s.length - 1; k >= 0; k--) {
      var r = dist(t, ord[s[k]], N);
      if (r <= last) return false;
      last = r;
    }
    return true;
  };

  // Would strict cycle-following from here reach the aligned state without a crash?
  Autopilot.prototype.safeToFollow = function (cyc) {
    var g = this.g, N = g.N, s = g.snake, L = s.length;
    // Ring buffer of the body, tail at index tailAt, head at headAt.
    var ring = this._ring || (this._ring = new Int32Array(N + 4));
    var occ = this._occ || (this._occ = new Uint8Array(N));
    occ.set(g.occ);
    for (var k = 0; k < L; k++) ring[k] = s[L - 1 - k];
    var tailAt = 0, headAt = L - 1, len = L, cap = ring.length;
    var food = this._food || (this._food = new Uint8Array(N));
    food.set(g.isFood);
    var h = s[0], pos = cyc.ord[h], steps = L + 2;
    for (k = 0; k < steps; k++) {
      pos = (pos + 1) % N;
      var nx = cyc.seq[pos];
      var grow = food[nx] === 1;
      if (!grow) { occ[ring[tailAt]] = 0; tailAt = (tailAt + 1) % cap; len--; }
      if (occ[nx]) return false;
      occ[nx] = 1; headAt = (headAt + 1) % cap; ring[headAt] = nx; len++;
      if (grow) { food[nx] = 0; if (len === N) return true; }
    }
    return true;
  };

  Autopilot.prototype.findCycle = function (tries) {
    for (var k = 0; k < tries; k++) {
      var cyc = buildCycle(this.g.W, this.g.H, this.rng);
      if (this.safeToFollow(cyc)) return cyc;
    }
    return null;
  };

  Autopilot.prototype.dirTo = function (from, to) {
    var W = this.g.W, dx = to % W - from % W, dy = ((to / W) | 0) - ((from / W) | 0);
    if (dx === 1) return 1; if (dx === -1) return 3; if (dy === 1) return 2; return 0;
  };

  // Last resort while no safe cycle exists yet: survive. Prefer moves that keep
  // the tail reachable (so the snake can always chase it), then the most room.
  Autopilot.prototype.roomiest = function (flagsOnly) {
    var g = this.g, W = g.W, N = g.N, head = g.snake[0];
    var best = g.dir, bestScore = -Infinity, flags = [false, false, false, false];
    for (var d = 0; d < 4; d++) {
      var n = g.neighbor(head, d);
      if (n < 0) continue;
      var grow = g.isFood[n] === 1;
      var tail = g.snake[g.snake.length - 1];
      if (g.occ[n] && !(n === tail && !grow)) continue;
      // Board after the move.
      var occ = new Uint8Array(g.occ);
      var newTail = tail;
      if (!grow) { occ[tail] = 0; newTail = g.snake[g.snake.length - 2]; }
      occ[n] = 1;
      // Flood from the new head: room, and whether the tail can be reached.
      var seen = new Uint8Array(N), stack = [n], count = 0, tailOk = false;
      seen[n] = 1;
      while (stack.length) {
        var c = stack.pop();
        for (var e = 0; e < 4; e++) {
          var m = g.neighbor(c, e);
          if (m < 0 || seen[m]) continue;
          if (m === newTail) tailOk = true;
          if (occ[m]) continue;
          seen[m] = 1; count++; stack.push(m);
        }
      }
      flags[d] = tailOk;
      var nx = n % W, ny = (n / W) | 0, near = 99;
      for (var q = 0; q < g.foods.length; q++) {
        var fq = g.foods[q], md = Math.abs(fq % W - nx) + Math.abs(((fq / W) | 0) - ny);
        if (md < near) near = md;
      }
      var score = (tailOk ? 1e7 : 0) + count * 100 - near + (grow && tailOk ? 50 : 0);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return flagsOnly ? flags : best;
  };

  Autopilot.prototype.decide = function () {
    var g = this.g, N = g.N, head = g.snake[0];

    if (!this.cycle || !this.aligned(this.cycle)) {
      // Merging in (just switched on, or a new game).
      if (!this.cycle || !this.safeToFollow(this.cycle)) {
        this.tick = (this.tick || 0) + 1;
        var found = !this.cycle ? this.findCycle(60) : (this.tick % 4 === 0 ? this.findCycle(8) : null);
        if (found) this.cycle = found;
        else {
          if (!this.cycle) this.cycle = buildCycle(g.W, g.H, this.rng);
          // No clean merge yet: ride the current cycle where that's safe, else survive.
          var nxt = this.cycle.seq[(this.cycle.ord[head] + 1) % N];
          var dn = this.dirTo(head, nxt), safe = this.roomiest(true);
          return safe[dn] ? dn : this.roomiest();
        }
      }
      return this.dirTo(head, this.cycle.seq[(this.cycle.ord[head] + 1) % N]);
    }

    var cyc = this.cycle, ord = cyc.ord;
    var h = ord[head], t = ord[g.snake[g.snake.length - 1]];
    var toTail = dist(h, t, N), toFood = N;
    for (var q = 0; q < g.foods.length; q++) {   // next apple along the route
      var fd = dist(h, ord[g.foods[q]], N);
      if (fd < toFood) toFood = fd;
    }
    var free = N - g.snake.length - 1;

    var cut = toTail - 4;                       // never run up close behind the tail
    if (free < N / 2) cut = 0;                  // crowded board: pure cycle, zero risk
    else if (toFood < toTail) {
      cut -= 1;
      if ((toTail - toFood) * 4 > free) cut -= 10;
    }
    if (toFood < cut) cut = toFood;             // don't overshoot the food
    if (cut < 1) cut = 1;

    var best = cyc.seq[(h + 1) % N], bestD = 1;
    for (var d = 0; d < 4; d++) {
      var n = g.neighbor(head, d);
      if (n < 0 || g.occ[n]) continue;
      var dn = dist(h, ord[n], N);
      if (dn > bestD && dn <= cut) { best = n; bestD = dn; }
    }
    return this.dirTo(head, best);
  };

  return { Game: Game, Autopilot: Autopilot, buildCycle: buildCycle, rngFrom: rngFrom, DX: DX, DY: DY };
});
