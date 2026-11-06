# Kode Snake

Snake for the Kode Dot (410×502 screen), playable now on a phone. Hidden autopilot clears the entire board.

## Play it now

Open `index.html` through any static server (or the published link). Swipe on the screen or use the D-pad.

- Board: **16 × 17 = 272 cells**. Hit a wall or yourself and it's over. Fill all 272 to win.
- **Modes**: *Classic* (1 apple) or *Feast* (5 apples on screen at once, ~4× faster game). Switch with the Mode
  toggle, by tapping the pill on the start/game-over card (works on the Kode Dot touchscreen), or `M` on a keyboard.
  Best score is kept per mode.
- **Autopilot**: Test bench switch, or the secret ones: **tap GO (OK) 3× fast**, or triple-tap the score
  (keyboard: `Space` ×3 or `K K K`). A single GO tap still starts/pauses; a triple-tap never shows "Paused".
  While it drives, your swipes are ignored, so you can keep swiping for show.
- Turn it on early. Takeover is tested at 100% for snakes under ~100 long; past that it usually works but isn't guaranteed.
- A full clear is ~10,000 moves in Classic (~20 min) and ~2,500 in Feast (~6 min). Test bench has 2×/4×/16× for testing.

## Why 16 × 17, not 15 × 17

The autopilot's guaranteed win comes from a loop that visits every cell once (a Hamiltonian cycle).
A grid with an odd number of cells (15 × 17 = 255) can't have one, so it could never promise a clear.
One extra column fixes it and still fits the Kode Dot screen at 25 px per cell.

## How the autopilot wins

1. Every game it builds a **new random loop** through all 272 cells (random maze → wall-follow → stitch the 17th row).
2. Following that loop alone can't fail, but looks robotic. So while the board is roomy it **cuts corners toward the food**,
   only taking shortcuts that keep the body in loop order. That keeps the guarantee and makes it look like a good player.
3. Past half-full it sticks to the loop, which is what an expert does in the endgame anyway.
4. In Feast mode it aims for the next apple along its route; extra growth can't break the guarantee.
5. Switched on mid-game, it searches for a random loop the current body can merge into without crashing, then takes over.

## Files

| File | What |
|---|---|
| `snake-core.js` | Rules + autopilot. No DOM, ports 1:1 to C++. |
| `index.html` | Phone/browser front end: canvas at the Kode Dot's 410×502, swipe + D-pad, test bench. |
| `kodedot/snake_core.h` | Same engine in C++ for the ESP32. No heap, ~3 KB RAM. |
| `kodedot/host_test.cpp` | Plays 600 games on a PC to prove the C++ port (`/tmp/st 5` for Feast). |
| `tests/autopilot.test.js` | Plays 1,000+ games in Node. Fails on any loss. 2nd arg = apples (1 or 5). |

```bash
node snake/tests/autopilot.test.js 300 1   # classic
node snake/tests/autopilot.test.js 300 5   # feast
g++ -O2 -std=c++17 snake/kodedot/host_test.cpp -o /tmp/st && /tmp/st
```

## Moving to the Kode Dot

The engine is done. When the device arrives, the sketch only needs:

1. **Draw**: same layout as `index.html` → HUD in the top 58 px, board at x=5, y=66, 25 px cells, sand checkerboard in a clay frame. Redraw only cells that changed each tick (head, neck, old tail, apples).
2. **Input**: swipes on the touchscreen → `game.turn(dir)`.
3. **The combo**: 3 presses of the OK button within ~450 ms → `autoOn = !autoOn`. A lone press waits 450 ms before pausing, so the triple never flashes "Paused" (see `okPress()` in `index.html`).
4. **Tick**: `game.step(autoOn ? pilot.decide(game) : -1)` every 190 ms, dropping to 110 ms as the snake grows (same curve as `interval()` in `index.html`).
