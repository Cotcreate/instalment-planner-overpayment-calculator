#include "controller.h"

#include <Preferences.h>
#include <esp_random.h>

namespace controller {
namespace {

Preferences prefs;

// Timed-mode choices, stepped with -/+ on screen.
const uint16_t INTERVALS_S[] = {5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 300, 600, 900};
const char *INTERVAL_LABELS[] = {"5s", "10s", "15s", "30s", "45s", "1m", "90s",
                                 "2m", "3m",  "4m",  "5m",  "10m", "15m"};
const uint8_t DISTANCES_PX[] = {1, 2, 5, 10, 20, 40, 80};
constexpr int N_INTERVALS = sizeof(INTERVALS_S) / sizeof(INTERVALS_S[0]);
constexpr int N_DISTANCES = sizeof(DISTANCES_PX) / sizeof(DISTANCES_PX[0]);

Mode curMode = Mode::Normal;
int intervalIdx = 5;   // 60 s
int distanceIdx = 3;   // 10 px

bool isRunning = false;
uint32_t cycleStart = 0;
uint32_t nextAt = 0;
uint32_t cycles = 0;
uint32_t activeAccum = 0;
uint32_t runStartedAt = 0;

bool saveDirty = false;
uint32_t saveAt = 0;

CycleCallback cycleCb = nullptr;

uint32_t randomBetween(uint32_t lo, uint32_t hi) {
  return lo + esp_random() % (hi - lo + 1);
}

uint32_t pickInterval() {
  switch (curMode) {
    case Mode::Normal:  return NORMAL_INTERVAL_MS;
    case Mode::Stealth: return randomBetween(STEALTH_MIN_MS, STEALTH_MAX_MS);
    case Mode::Timed:   return (uint32_t)INTERVALS_S[intervalIdx] * 1000UL;
  }
  return NORMAL_INTERVAL_MS;
}

void schedule(uint32_t now) {
  cycleStart = now;
  nextAt = now + pickInterval();
}

void markDirty() {
  saveDirty = true;
  saveAt = millis() + 1500;   // debounce writes to NVS
}

void persist() {
  prefs.begin("jiggler", false);
  prefs.putUChar("mode", (uint8_t)curMode);
  prefs.putInt("ival", intervalIdx);
  prefs.putInt("dist", distanceIdx);
  prefs.end();
  saveDirty = false;
}

}  // namespace

void begin() {
  prefs.begin("jiggler", true);
  curMode = (Mode)prefs.getUChar("mode", (uint8_t)Mode::Normal);
  intervalIdx = prefs.getInt("ival", 5);
  distanceIdx = prefs.getInt("dist", 3);
  prefs.end();
  if ((uint8_t)curMode > (uint8_t)Mode::Timed) curMode = Mode::Normal;
  intervalIdx = constrain(intervalIdx, 0, N_INTERVALS - 1);
  distanceIdx = constrain(distanceIdx, 0, N_DISTANCES - 1);
}

void loop() {
  const uint32_t now = millis();

  if (isRunning && (int32_t)(now - nextAt) >= 0) {
    cycles++;
    if (cycleCb) cycleCb();
    schedule(now);
  }

  if (saveDirty && (int32_t)(now - saveAt) >= 0) persist();
}

void start() {
  if (isRunning) return;
  isRunning = true;
  runStartedAt = millis();
  schedule(runStartedAt);
}

void stop() {
  if (!isRunning) return;
  isRunning = false;
  activeAccum += millis() - runStartedAt;
}

void toggle() { isRunning ? stop() : start(); }
bool running() { return isRunning; }

Mode mode() { return curMode; }

void setMode(Mode m) {
  if (m == curMode) return;
  curMode = m;
  markDirty();
  if (isRunning) schedule(millis());
}

void cycleMode() {
  setMode((Mode)(((uint8_t)curMode + 1) % 3));
}

const char *modeName(Mode m) {
  switch (m) {
    case Mode::Normal:  return "NORMAL";
    case Mode::Stealth: return "STEALTH";
    case Mode::Timed:   return "TIMED";
  }
  return "?";
}

uint32_t msUntilNext() {
  if (!isRunning) return cycleLengthMs();
  const int32_t left = (int32_t)(nextAt - millis());
  return left > 0 ? (uint32_t)left : 0;
}

uint32_t cycleLengthMs() {
  if (isRunning) return nextAt - cycleStart;
  switch (curMode) {
    case Mode::Normal:  return NORMAL_INTERVAL_MS;
    case Mode::Stealth: return (STEALTH_MIN_MS + STEALTH_MAX_MS) / 2;
    case Mode::Timed:   return (uint32_t)INTERVALS_S[intervalIdx] * 1000UL;
  }
  return NORMAL_INTERVAL_MS;
}

uint32_t cycleCount() { return cycles; }

uint32_t activeMs() {
  return activeAccum + (isRunning ? millis() - runStartedAt : 0);
}

uint32_t timedIntervalMs() { return (uint32_t)INTERVALS_S[intervalIdx] * 1000UL; }
uint8_t timedDistance() { return DISTANCES_PX[distanceIdx]; }
const char *timedIntervalLabel() { return INTERVAL_LABELS[intervalIdx]; }

void stepTimedInterval(int dir) {
  intervalIdx = constrain(intervalIdx + (dir > 0 ? 1 : -1), 0, N_INTERVALS - 1);
  markDirty();
  if (isRunning && curMode == Mode::Timed) schedule(millis());
}

void stepTimedDistance(int dir) {
  distanceIdx = constrain(distanceIdx + (dir > 0 ? 1 : -1), 0, N_DISTANCES - 1);
  markDirty();
}

void onCycle(CycleCallback cb) { cycleCb = cb; }

}  // namespace controller
