#pragma once
// App state: the three modes, their timing, the running countdown, and
// persistence. This is UI/logic only - it emits no USB or mouse output.
#include <Arduino.h>

enum class Mode : uint8_t { Normal = 0, Stealth = 1, Timed = 2 };

namespace controller {

// ---- Mode timing ----
// Reference values the on-screen readout shows for each mode.
constexpr uint32_t NORMAL_INTERVAL_MS = 10000;   // steady 10 s
constexpr uint32_t STEALTH_MIN_MS     = 45000;   // random 45-150 s
constexpr uint32_t STEALTH_MAX_MS     = 150000;

void begin();   // load saved settings
void loop();    // advance the countdown; call every main-loop pass

void start();
void stop();
void toggle();
bool running();

Mode mode();
void setMode(Mode m);
void cycleMode();
const char *modeName(Mode m);

// Countdown to the next scheduled cycle.
uint32_t msUntilNext();
uint32_t cycleLengthMs();   // length of the current interval

uint32_t cycleCount();      // how many cycles have elapsed this session
uint32_t activeMs();        // total running time this session

// Timed-mode settings (stepped on screen).
uint32_t timedIntervalMs();
uint8_t  timedDistance();
const char *timedIntervalLabel();
void stepTimedInterval(int dir);
void stepTimedDistance(int dir);

// Fired once whenever a cycle elapses (drives a screen pulse only).
using CycleCallback = void (*)();
void onCycle(CycleCallback cb);

}  // namespace controller
