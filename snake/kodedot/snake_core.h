// snake_core.h — Snake rules + autopilot for the Kode Dot (ESP32, Arduino/ESP-IDF).
// Mirrors ../snake-core.js line for line. No heap, no display, no input code:
// your sketch draws the board and calls step() on a timer.
//
//   SnakeGame game;  SnakeAutopilot pilot;
//   game.reset(esp_random());  pilot.reset(esp_random());
//   game.status = SnakeGame::PLAYING;
//   every tick:  game.step(autoOn ? pilot.decide(game) : -1);
//   on input:    game.turn(dir);            // 0 up, 1 right, 2 down, 3 left
#pragma once
#include <stdint.h>
#include <string.h>

namespace snake {

constexpr int W = 16, H = 17, N = W * H;  // W must be even (see README)
constexpr int8_t DX[4] = {0, 1, 0, -1};
constexpr int8_t DY[4] = {-1, 0, 1, 0};

struct Rng {
  uint32_t s = 1;
  void seed(uint32_t v) { s = v ? v : 1; }
  float next() {  // mulberry32, same as the JS
    s += 0x6D2B79F5u;
    uint32_t t = s;
    t = (t ^ (t >> 15)) * (t | 1u);
    t ^= t + (t ^ (t >> 7)) * (t | 61u);
    return (float)((t ^ (t >> 14)) >> 0) / 4294967296.0f;
  }
  int below(int n) { int r = (int)(next() * n); return r >= n ? n - 1 : r; }
};

inline int neighbor(int c, int d) {
  int x = c % W + DX[d], y = c / W + DY[d];
  if (x < 0 || y < 0 || x >= W || y >= H) return -1;
  return y * W + x;
}

// ---------------- Random Hamiltonian cycle ----------------
struct Cycle {
  int16_t seq[N];  // position -> cell
  int16_t ord[N];  // cell -> position

  void build(Rng& rng) {
    constexpr int BW = W / 2, BH = H / 2, NB = BW * BH;
    static int16_t parent[NB];
    static int16_t edges[NB * 2];
    static uint8_t hasR[NB], hasD[NB];
    static int16_t adj[N][2];
    static uint8_t deg[N];
    int ne = 0;
    for (int i = 0; i < NB; i++) { parent[i] = i; hasR[i] = hasD[i] = 0; }
    for (int j = 0; j < BH; j++) for (int i = 0; i < BW; i++) {
      int n = j * BW + i;
      if (i + 1 < BW) edges[ne++] = n * 2;
      if (j + 1 < BH) edges[ne++] = n * 2 + 1;
    }
    for (int e = ne - 1; e > 0; e--) { int r = rng.below(e + 1); int16_t t = edges[e]; edges[e] = edges[r]; edges[r] = t; }
    auto find = [&](int a) { while (parent[a] != a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    for (int e = 0; e < ne; e++) {
      int a = edges[e] >> 1, down = edges[e] & 1, b = down ? a + BW : a + 1;
      int ra = find(a), rb = find(b);
      if (ra != rb) { parent[ra] = rb; if (down) hasD[a] = 1; else hasR[a] = 1; }
    }
    memset(deg, 0, sizeof deg);
    auto id = [](int x, int y) { return y * W + x; };
    auto link = [&](int a, int b) { adj[a][deg[a]++] = b; adj[b][deg[b]++] = a; };
    auto unlink = [&](int a, int b) {
      for (int k = 0; k < deg[a]; k++) if (adj[a][k] == b) { adj[a][k] = adj[a][--deg[a]]; break; }
      for (int k = 0; k < deg[b]; k++) if (adj[b][k] == a) { adj[b][k] = adj[b][--deg[b]]; break; }
    };
    for (int j = 0; j < BH; j++) for (int i = 0; i < BW; i++) {
      int n = j * BW + i, x = 2 * i, y = 2 * j;
      int TL = id(x, y), TR = id(x + 1, y), BL = id(x, y + 1), BR = id(x + 1, y + 1);
      bool up = j > 0 && hasD[n - BW], left = i > 0 && hasR[n - 1];
      if (!up) link(TL, TR);
      if (!hasD[n]) link(BL, BR);
      if (!left) link(TL, BL);
      if (!hasR[n]) link(TR, BR);
      if (hasR[n]) { link(TR, id(x + 2, y)); link(BR, id(x + 2, y + 1)); }
      if (hasD[n]) { link(BL, id(x, y + 2)); link(BR, id(x + 1, y + 2)); }
    }
    if (H % 2) {
      for (int i = 0; i < BW; i++) {
        int a = id(2 * i, H - 2), b = id(2 * i + 1, H - 2);
        unlink(a, b);
        link(a, id(2 * i, H - 1)); link(id(2 * i, H - 1), id(2 * i + 1, H - 1)); link(id(2 * i + 1, H - 1), b);
      }
    }
    int prev = -1, cur = 0;
    for (int k = 0; k < N; k++) {
      seq[k] = cur;
      int nx = adj[cur][0] != prev ? adj[cur][0] : adj[cur][1];
      prev = cur; cur = nx;
    }
    bool fx = rng.next() < 0.5f, fy = rng.next() < 0.5f, rev = rng.next() < 0.5f;
    for (int k = 0; k < N; k++) {
      int cx = seq[k] % W, cy = seq[k] / W;
      if (fx) cx = W - 1 - cx;
      if (fy) cy = H - 1 - cy;
      seq[k] = cy * W + cx;
    }
    if (rev) for (int a = 0, b = N - 1; a < b; a++, b--) { int16_t t = seq[a]; seq[a] = seq[b]; seq[b] = t; }
    for (int k = 0; k < N; k++) ord[seq[k]] = k;
  }
  int next(int cell) const { return seq[(ord[cell] + 1) % N]; }
};

// ---------------- Game ----------------
struct SnakeGame {
  enum Status : uint8_t { READY, PLAYING, PAUSED, DEAD, WON };
  enum Death : uint8_t { NONE, WALL, SELF };

  int16_t body[N];   // ring buffer, head at body[headAt], tail at body[tailAt]
  int headAt = 0, tailAt = 0, len = 0;
  uint8_t occ[N];
  int dir = 1, food = -1, score = 0;
  uint32_t moves = 0;
  int8_t queue[2]; int qn = 0;
  Status status = READY;
  Death death = NONE;
  Rng rng;

  int at(int k) const { return body[(headAt - k + N) % N]; }  // k=0 head, k=len-1 tail
  int head() const { return body[headAt]; }
  int tail() const { return body[tailAt]; }

  void reset(uint32_t seed) {
    rng.seed(seed);
    memset(occ, 0, sizeof occ);
    int hx = W / 2, hy = H / 2;
    len = 3; tailAt = 0; headAt = 2;
    for (int k = 0; k < 3; k++) { int c = hy * W + hx - 2 + k; body[k] = c; occ[c] = 1; }
    dir = 1; qn = 0; score = 0; moves = 0; status = READY; death = NONE;
    spawnFood();
  }

  void spawnFood() {
    int free = N - len;
    if (free <= 0) { food = -1; return; }
    int pick = rng.below(free);
    for (int c = 0; c < N; c++) if (!occ[c]) { if (pick == 0) { food = c; return; } pick--; }
  }

  bool turn(int d) {
    int last = qn ? queue[qn - 1] : dir;
    if (d == last || d == (last + 2) % 4) return false;
    if (qn < 2) queue[qn++] = d;
    return true;
  }

  // forcedDir = -1 for manual play, else the autopilot's choice.
  void step(int forcedDir = -1) {
    if (status != PLAYING) return;
    int d;
    if (forcedDir >= 0) { d = forcedDir; qn = 0; }
    else if (qn) { d = queue[0]; queue[0] = queue[1]; qn--; }
    else d = dir;
    dir = d;
    int n = neighbor(head(), d);
    moves++;
    if (n < 0) { status = DEAD; death = WALL; return; }
    bool grow = n == food;
    int oldTail = tail();
    if (!grow) { occ[oldTail] = 0; tailAt = (tailAt + 1) % N; len--; }
    if (occ[n]) {
      if (!grow) { tailAt = (tailAt - 1 + N) % N; len++; occ[oldTail] = 1; }
      status = DEAD; death = SELF; return;
    }
    headAt = (headAt + 1) % N; body[headAt] = n; occ[n] = 1; len++;
    if (grow) {
      score++;
      if (len == N) { food = -1; status = WON; return; }
      spawnFood();
    }
  }
};

// ---------------- Autopilot ----------------
struct SnakeAutopilot {
  Cycle cycle, trial;
  bool hasCycle = false;
  uint32_t tick = 0;
  Rng rng;

  void reset(uint32_t seed = 0) { if (seed) rng.seed(seed); hasCycle = false; }

  static int dist(int a, int b) { return (b - a + N) % N; }

  static bool aligned(const SnakeGame& g, const Cycle& c) {
    int t = c.ord[g.tail()], last = -1;
    for (int k = g.len - 1; k >= 0; k--) {
      int r = dist(t, c.ord[g.at(k)]);
      if (r <= last) return false;
      last = r;
    }
    return true;
  }

  static bool safeToFollow(const SnakeGame& g, const Cycle& c) {
    static uint8_t occ[N];
    static int16_t ring[N + 4];
    constexpr int CAP = N + 4;
    memcpy(occ, g.occ, N);
    for (int k = 0; k < g.len; k++) ring[k] = g.at(g.len - 1 - k);
    int tailAt = 0, headAt = g.len - 1, len = g.len, food = g.food;
    int pos = c.ord[g.head()], steps = g.len + 2;
    for (int k = 0; k < steps; k++) {
      pos = (pos + 1) % N;
      int nx = c.seq[pos];
      bool grow = nx == food;
      if (!grow) { occ[ring[tailAt]] = 0; tailAt = (tailAt + 1) % CAP; len--; }
      if (occ[nx]) return false;
      occ[nx] = 1; headAt = (headAt + 1) % CAP; ring[headAt] = nx; len++;
      if (grow) { food = -1; if (len == N) return true; }
    }
    return true;
  }

  bool findCycle(const SnakeGame& g, int tries) {
    for (int k = 0; k < tries; k++) {
      trial.build(rng);
      if (safeToFollow(g, trial)) { cycle = trial; hasCycle = true; return true; }
    }
    return false;
  }

  static int dirTo(int from, int to) {
    int dx = to % W - from % W, dy = to / W - from / W;
    if (dx == 1) return 1;
    if (dx == -1) return 3;
    if (dy == 1) return 2;
    return 0;
  }

  // Survival move: keep the tail reachable, then most room. flags[d] = tail reachable.
  static int roomiest(const SnakeGame& g, bool flags[4]) {
    static uint8_t occ[N], seen[N];
    static int16_t stack[N];
    int best = g.dir; long bestScore = -1000000000L;
    for (int d = 0; d < 4; d++) {
      flags[d] = false;
      int n = neighbor(g.head(), d);
      if (n < 0) continue;
      bool grow = n == g.food;
      int tail = g.tail();
      if (g.occ[n] && !(n == tail && !grow)) continue;
      memcpy(occ, g.occ, N);
      int newTail = tail;
      if (!grow) { occ[tail] = 0; newTail = g.len > 1 ? g.at(g.len - 2) : n; }
      occ[n] = 1;
      memset(seen, 0, N);
      int sp = 0, count = 0; bool tailOk = false;
      stack[sp++] = n; seen[n] = 1;
      while (sp) {
        int c = stack[--sp];
        for (int e = 0; e < 4; e++) {
          int m = neighbor(c, e);
          if (m < 0 || seen[m]) continue;
          if (m == newTail) tailOk = true;
          if (occ[m]) continue;
          seen[m] = 1; count++; stack[sp++] = m;
        }
      }
      flags[d] = tailOk;
      int fx = g.food % W, fy = g.food / W, nx = n % W, ny = n / W;
      int md = (fx > nx ? fx - nx : nx - fx) + (fy > ny ? fy - ny : ny - fy);
      long score = (tailOk ? 10000000L : 0) + count * 100L - md + (grow && tailOk ? 50 : 0);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  int decide(const SnakeGame& g) {
    int head = g.head();
    if (!hasCycle || !aligned(g, cycle)) {
      if (!hasCycle || !safeToFollow(g, cycle)) {
        tick++;
        // Fewer tries per tick than the JS: spreads the work so the ESP32 never stutters.
        bool found = !hasCycle ? findCycle(g, 30) : (tick % 4 == 0 ? findCycle(g, 4) : false);
        if (!found) {
          if (!hasCycle) { cycle.build(rng); hasCycle = true; }
          bool flags[4];
          int best = roomiest(g, flags);
          int dn = dirTo(head, cycle.next(head));
          return flags[dn] ? dn : best;
        }
      }
      return dirTo(head, cycle.next(head));
    }

    int h = cycle.ord[head], t = cycle.ord[g.tail()], f = cycle.ord[g.food];
    int toTail = dist(h, t), toFood = dist(h, f);
    int free = N - g.len - 1;
    int cut = toTail - 4;
    if (free < N / 2) cut = 0;
    else if (toFood < toTail) {
      cut -= 1;
      if ((toTail - toFood) * 4 > free) cut -= 10;
    }
    if (toFood < cut) cut = toFood;
    if (cut < 1) cut = 1;

    int best = cycle.next(head), bestD = 1;
    for (int d = 0; d < 4; d++) {
      int n = neighbor(head, d);
      if (n < 0 || g.occ[n]) continue;
      int dn = dist(h, cycle.ord[n]);
      if (dn > bestD && dn <= cut) { best = n; bestD = dn; }
    }
    return dirTo(head, best);
  }
};

}  // namespace snake
