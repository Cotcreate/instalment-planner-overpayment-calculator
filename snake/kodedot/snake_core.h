// snake_core.h — Snake rules + autopilot for the Kode Dot (ESP32, Arduino/ESP-IDF).
// Mirrors ../snake-core.js line for line. No heap, no display, no input code:
// your sketch draws the board and calls step() on a timer.
//
//   SnakeGame game;  SnakeAutopilot pilot;
//   game.reset(esp_random(), 1);  pilot.reset(esp_random());   // 1 = classic, 5 = feast
//   game.status = SnakeGame::PLAYING;
//   every tick:  game.step(autoOn ? pilot.decide(game) : -1);
//   on input:    game.turn(dir);            // 0 up, 1 right, 2 down, 3 left
#pragma once
#include <stdint.h>
#include <string.h>

namespace snake {

constexpr int W = 16, H = 17, N = W * H;  // W must be even (see README)
constexpr int MAX_FOOD = 5;
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
  int dir = 1, score = 0;
  int16_t foods[MAX_FOOD]; int nFood = 0, maxFood = 1;
  uint8_t isFood[N];
  uint32_t moves = 0;
  int8_t queue[2]; int qn = 0;
  Status status = READY;
  Death death = NONE;
  Rng rng;

  int at(int k) const { return body[(headAt - k + N) % N]; }  // k=0 head, k=len-1 tail
  int head() const { return body[headAt]; }
  int tail() const { return body[tailAt]; }

  void reset(uint32_t seed, int apples = 1) {
    rng.seed(seed);
    maxFood = apples < 1 ? 1 : apples > MAX_FOOD ? MAX_FOOD : apples;
    memset(occ, 0, sizeof occ);
    memset(isFood, 0, sizeof isFood); nFood = 0;
    int hx = W / 2, hy = H / 2;
    len = 3; tailAt = 0; headAt = 2;
    for (int k = 0; k < 3; k++) { int c = hy * W + hx - 2 + k; body[k] = c; occ[c] = 1; }
    dir = 1; qn = 0; score = 0; moves = 0; status = READY; death = NONE;
    spawnFood();
  }

  // Top up to maxFood apples on random empty cells.
  void spawnFood() {
    while (nFood < maxFood) {
      int free = N - len - nFood;
      if (free <= 0) return;
      int pick = rng.below(free);
      for (int c = 0; c < N; c++) if (!occ[c] && !isFood[c]) {
        if (pick == 0) { foods[nFood++] = c; isFood[c] = 1; break; }
        pick--;
      }
    }
  }

  void setMaxFood(int apples) {  // extras above a lowered limit just get eaten
    maxFood = apples < 1 ? 1 : apples > MAX_FOOD ? MAX_FOOD : apples;
    if (status != WON) spawnFood();
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
    bool grow = isFood[n];
    int oldTail = tail();
    if (!grow) { occ[oldTail] = 0; tailAt = (tailAt + 1) % N; len--; }
    if (occ[n]) {
      if (!grow) { tailAt = (tailAt - 1 + N) % N; len++; occ[oldTail] = 1; }
      status = DEAD; death = SELF; return;
    }
    headAt = (headAt + 1) % N; body[headAt] = n; occ[n] = 1; len++;
    if (grow) {
      isFood[n] = 0;
      for (int k = 0; k < nFood; k++) if (foods[k] == n) { foods[k] = foods[--nFood]; break; }
      score++;
      if (len == N) { status = WON; return; }
      spawnFood();
    }
  }
};

// ---------------- Autopilot ----------------
struct SnakeAutopilot {
  Cycle cycle, trial;
  bool hasCycle = false, greedyOff = false;
  uint32_t tick = 0;
  Rng rng;

  // Early game: below this length (3 + 25 apples) head straight for the nearest apple.
  static constexpr int GREEDY_LEN = 28;

  void reset(uint32_t seed = 0) { if (seed) rng.seed(seed); hasCycle = false; greedyOff = false; }

  // Survivable if the head can catch up with its own trail (a body cell that has
  // emptied by the time the head gets there), or has more room than the snake is long.
  // body[0] = head. Each apple on the board may hold the tail still for a move.
  static bool escapable(const int16_t* body, int L, const uint8_t* occ, int slack) {
    static int16_t freeAt[N], dist[N], q[N];
    memset(freeAt, 0, sizeof freeAt);
    for (int j = 0; j < L; j++) freeAt[body[L - 1 - j]] = j + 1 + slack;
    for (int c = 0; c < N; c++) dist[c] = -1;
    int qh = 0, qt = 0, room = 0;
    dist[body[0]] = 0; q[qt++] = body[0];
    while (qh < qt) {
      int c = q[qh++];
      for (int d = 0; d < 4; d++) {
        int m = neighbor(c, d);
        if (m < 0 || dist[m] >= 0) continue;
        int t = dist[c] + 1;
        if (occ[m]) { if (freeAt[m] && t >= freeAt[m]) return true; continue; }
        dist[m] = t; q[qt++] = m;
        if (++room >= L) return true;
      }
    }
    return false;
  }

  // Shortest path to the nearest apple, only if the snake can still escape after
  // eating it. Returns a direction, or -1 if there's no safe dash.
  static int greedy(const SnakeGame& g) {
    static int16_t prev[N], q[N], path[N], body[N + 1];
    static uint8_t occ[N], food[N];
    int head = g.head(), tail = g.tail();
    for (int c = 0; c < N; c++) prev[c] = -2;
    prev[head] = -1;
    int qh = 0, qt = 0, target = -1;
    q[qt++] = head;
    while (qh < qt && target < 0) {
      int c = q[qh++];
      for (int d = 0; d < 4; d++) {
        int m = neighbor(c, d);
        if (m < 0 || prev[m] != -2 || (g.occ[m] && m != tail)) continue;
        prev[m] = c; q[qt++] = m;
        if (g.isFood[m]) { target = m; break; }
      }
    }
    if (target < 0) return -1;
    int pl = 0;
    for (int p = target; p != head; p = prev[p]) path[pl++] = p;
    // Walk a copy of the snake along the path (path is stored end-first).
    int L = g.len;
    for (int k = 0; k < L; k++) body[k] = g.at(k);
    memcpy(occ, g.occ, N); memcpy(food, g.isFood, N);
    for (int k = pl - 1; k >= 0; k--) {
      int n = path[k]; bool grow = food[n];
      if (!grow) occ[body[--L]] = 0;
      if (occ[n]) return -1;
      memmove(body + 1, body, L * sizeof(int16_t)); body[0] = n; L++; occ[n] = 1;
      if (grow) food[n] = 0;
    }
    if (L < N && !escapable(body, L, occ, g.maxFood)) return -1;
    return dirTo(head, path[pl - 1]);
  }

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
    static uint8_t food[N];
    constexpr int CAP = N + 4;
    memcpy(occ, g.occ, N);
    memcpy(food, g.isFood, N);
    for (int k = 0; k < g.len; k++) ring[k] = g.at(g.len - 1 - k);
    int tailAt = 0, headAt = g.len - 1, len = g.len;
    int pos = c.ord[g.head()], steps = g.len + 2;
    for (int k = 0; k < steps; k++) {
      pos = (pos + 1) % N;
      int nx = c.seq[pos];
      bool grow = food[nx];
      if (!grow) { occ[ring[tailAt]] = 0; tailAt = (tailAt + 1) % CAP; len--; }
      if (occ[nx]) return false;
      occ[nx] = 1; headAt = (headAt + 1) % CAP; ring[headAt] = nx; len++;
      if (grow) { food[nx] = 0; if (len == N) return true; }
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
      bool grow = g.isFood[n];
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
      int nx = n % W, ny = n / W, md = 99;
      for (int q = 0; q < g.nFood; q++) {
        int fx = g.foods[q] % W, fy = g.foods[q] / W;
        int m = (fx > nx ? fx - nx : nx - fx) + (fy > ny ? fy - ny : ny - fy);
        if (m < md) md = m;
      }
      long score = (tailOk ? 10000000L : 0) + count * 100L - md + (grow && tailOk ? 50 : 0);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  int decide(const SnakeGame& g) {
    int head = g.head();
    if (g.len < GREEDY_LEN && !greedyOff) {
      int gd = greedy(g);
      if (gd >= 0) { hasCycle = false; return gd; }  // fresh route picked when the dash phase ends
      greedyOff = true;                               // first sign of risk: play safe from here on
    }
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

    int h = cycle.ord[head], t = cycle.ord[g.tail()];
    int toTail = dist(h, t), toFood = N;
    for (int q = 0; q < g.nFood; q++) {  // next apple along the route
      int fd = dist(h, cycle.ord[g.foods[q]]);
      if (fd < toFood) toFood = fd;
    }
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
