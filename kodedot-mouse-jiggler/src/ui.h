#pragma once
// LVGL screen for the Mouse Jiggler app.
#include <Arduino.h>

namespace ui {

void begin();              // build the screen (after board + controller begin)
void refresh();            // update dynamic labels/arc; call ~30 Hz
void pulse();              // flash the ring when a cycle elapses

// Anti burn-in: nudge the whole layout by a few pixels.
void setShift(int8_t dx, int8_t dy);

// Dimming overlay (0 = none ... 255 = fully black) layered over the UI.
void setDimVeil(uint8_t alpha);

}  // namespace ui
