// g++ -O2 -std=c++17 host_test.cpp -o /tmp/st && /tmp/st   — plays full games on the PC.
#include "snake_core.h"
#include <cstdio>
#include <cstdlib>
using namespace snake;
int main(int argc, char** argv) {
  int apples = argc > 1 ? atoi(argv[1]) : 1;  // 1 classic, 5 feast
  static SnakeGame g; static SnakeAutopilot p;
  int wins = 0, losses = 0, re = 0, reFail = 0; unsigned long moves = 0;
  for (uint32_t s = 1; s <= 300; s++) {
    g.reset(s * 2654435761u, apples); p.reset(s * 40503u + 7); g.status = SnakeGame::PLAYING;
    while (g.status == SnakeGame::PLAYING && g.moves < 200000) g.step(p.decide(g));
    if (g.status == SnakeGame::WON) { wins++; moves += g.moves; } else { losses++; printf("loss seed %u len %d death %d\n", s, g.len, g.death); }
  }
  // Switch on mid-game after some "manual" play.
  for (uint32_t s = 1; s <= 300; s++) {
    g.reset(s * 977u + 3, apples); p.reset(s * 131u + 1); g.status = SnakeGame::PLAYING;
    Rng r; r.seed(s * 31u + 9); int target = 5 + r.below(90);
    while (g.status == SnakeGame::PLAYING && g.len < target) g.step(p.decide(g));
    int off = 10 + r.below(60); bool flags[4];
    for (int k = 0; k < off && g.status == SnakeGame::PLAYING; k++) {
      int d = r.next() < 0.3f ? r.below(4) : g.dir; int n = neighbor(g.head(), d);
      if (n < 0 || (g.occ[n] && n != g.tail())) d = SnakeAutopilot::roomiest(g, flags);
      g.step(d);
    }
    if (g.status != SnakeGame::PLAYING) continue;
    SnakeAutopilot::roomiest(g, flags); if (!(flags[0] || flags[1] || flags[2] || flags[3])) continue;
    p.reset();
    while (g.status == SnakeGame::PLAYING && g.moves < 300000) g.step(p.decide(g));
    if (g.status == SnakeGame::WON) re++; else { reFail++; printf("re-engage fail seed %u len %d\n", s, g.len); }
  }
  printf("apples %d | from start: %d won, %d lost, avg %lu moves | re-engage: %d won, %d failed\n", apples, wins, losses, wins ? moves / wins : 0, re, reFail);
  return losses || reFail;
}
