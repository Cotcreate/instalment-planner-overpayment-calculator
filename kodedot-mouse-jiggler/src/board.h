#pragma once
// Thin hardware layer: AMOLED + LVGL, touch, buttons, status LED.
#include <Arduino.h>
#include <lvgl.h>

namespace board {

// Touch hook: called on every touch poll with the raw pressed state.
// Return true to swallow the touch (LVGL sees "released").
using TouchHook = bool (*)(bool pressed);

bool begin();                       // bring up everything; false on fatal error
void tick();                        // pump LVGL, call every loop
void setTouchHook(TouchHook hook);

void setBacklight(uint8_t level);   // 0-255, NOT persisted (safe to call per frame)
uint8_t userBacklight();            // kodeOS-saved brightness, as 0-255

bool topButton();                   // true while pressed
bool bottomButton();                // true while pressed (polled via IO expander)

void led(uint8_t r, uint8_t g, uint8_t b);

}  // namespace board
