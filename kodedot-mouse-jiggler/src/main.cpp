// Mouse Jiggler app for the Kode Dot (ESP32-S3 / kodeOS).
//
// This is the on-device control panel: pick a mode (Normal / Stealth / Timed),
// set the Timed interval and distance, start/stop, and watch the countdown.
// It has NO USB or mouse output - it is the UI/settings front end only.
//
// Controls:
//   Touch         - mode chips, interval steppers, START/STOP
//   Top button    - start / stop
//   Bottom button - cycle mode
//
// Screen care (the panel is on the whole time this app runs):
//   - true-black background so most AMOLED pixels stay off
//   - auto-dims toward black after ~20 s without touch, full brightness on touch
//   - the whole layout drifts a few pixels every ~90 s to avoid burn-in
#include <Arduino.h>

#include "board.h"
#include "controller.h"
#include "ui.h"

namespace {

// ---- Auto-dim ----
constexpr uint32_t DIM_AFTER_MS   = 20000;   // start dimming after this idle time
constexpr uint32_t DIM_FADE_MS    = 4000;    // fade duration
constexpr uint8_t  DIM_FLOOR_PCT  = 15;      // never fully off (still readable)
uint32_t lastActivity = 0;

// ---- Anti burn-in drift ----
constexpr uint32_t SHIFT_EVERY_MS = 90000;
const int8_t SHIFTS[][2] = {{0, 0}, {3, 2}, {-3, 3}, {2, -3}, {-2, -2}, {3, -1}, {-3, 1}};
constexpr int N_SHIFTS = sizeof(SHIFTS) / sizeof(SHIFTS[0]);
uint32_t lastShift = 0;
int shiftIdx = 0;

// ---- Button edge detection ----
bool topPrev = false, bottomPrev = false;
bool touchPrev = false;

void markActivity() { lastActivity = millis(); }

// Touch hook: wakes the screen; we never swallow touches (return false).
bool touchHook(bool pressed) {
  if (pressed && !touchPrev) markActivity();
  touchPrev = pressed;
  return false;
}

void onCycle() {
  ui::pulse();
  board::led(0, 40, 36);   // brief teal blip
}

void applyDimming(uint32_t now) {
  const uint8_t full = board::userBacklight();
  const uint8_t floor = (uint8_t)((uint16_t)full * DIM_FLOOR_PCT / 100);
  const uint32_t idle = now - lastActivity;

  uint8_t level;
  if (idle < DIM_AFTER_MS) {
    level = full;
  } else if (idle < DIM_AFTER_MS + DIM_FADE_MS) {
    const uint32_t t = idle - DIM_AFTER_MS;
    level = full - (uint8_t)((uint32_t)(full - floor) * t / DIM_FADE_MS);
  } else {
    level = floor;
  }
  board::setBacklight(level);
}

void applyShift(uint32_t now) {
  if (now - lastShift < SHIFT_EVERY_MS) return;
  lastShift = now;
  shiftIdx = (shiftIdx + 1) % N_SHIFTS;
  ui::setShift(SHIFTS[shiftIdx][0], SHIFTS[shiftIdx][1]);
}

}  // namespace

void setup() {
  Serial.begin(115200);

  if (!board::begin()) {
    Serial.println("[FATAL] board init failed");
    while (true) delay(1000);
  }
  board::setTouchHook(touchHook);

  controller::begin();
  controller::onCycle(onCycle);

  ui::begin();

  lastActivity = millis();
  lastShift = millis();

  // Fade the backlight up now that the UI is drawn.
  board::setBacklight(board::userBacklight());
  board::led(0, 6, 10);
}

void loop() {
  const uint32_t now = millis();

  // Top button: start/stop (rising edge).
  const bool top = board::topButton();
  if (top && !topPrev) { controller::toggle(); markActivity(); }
  topPrev = top;

  // Bottom button: cycle mode (rising edge).
  const bool bottom = board::bottomButton();
  if (bottom && !bottomPrev) { controller::cycleMode(); markActivity(); }
  bottomPrev = bottom;

  controller::loop();

  static uint32_t lastUi = 0;
  if (now - lastUi >= 33) {   // ~30 Hz UI refresh
    lastUi = now;
    ui::refresh();
    applyDimming(now);
    applyShift(now);
    // Idle LED: dim to off; running keeps a faint pilot.
    if (!controller::running()) board::led(0, 0, 0);
  }

  board::tick();
  delay(2);
}
