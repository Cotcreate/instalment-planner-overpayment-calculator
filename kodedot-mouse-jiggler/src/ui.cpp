#include "ui.h"

#include <lvgl.h>

#include "controller.h"

namespace ui {
namespace {

// Palette (deep near-black base so the AMOLED stays mostly off).
constexpr uint32_t COL_BG      = 0x000000;
constexpr uint32_t COL_CARD    = 0x0D0F14;
constexpr uint32_t COL_RING_BG = 0x1C2330;
constexpr uint32_t COL_IDLE    = 0x3A4256;
constexpr uint32_t COL_ACCENT  = 0x18E0C8;  // teal - running
constexpr uint32_t COL_STEALTH = 0x8A6CFF;  // violet - stealth
constexpr uint32_t COL_TIMED   = 0xFFB347;  // amber - timed
constexpr uint32_t COL_TEXT    = 0xF2F5FA;
constexpr uint32_t COL_MUTED   = 0x6B7280;

lv_obj_t *shiftRoot = nullptr;   // everything lives here so we can nudge it
lv_obj_t *arc = nullptr;
lv_obj_t *ring = nullptr;
lv_obj_t *modeLabel = nullptr;
lv_obj_t *countLabel = nullptr;
lv_obj_t *subLabel = nullptr;
lv_obj_t *startBtn = nullptr;
lv_obj_t *startLabel = nullptr;
lv_obj_t *statusLabel = nullptr;
lv_obj_t *modeChips[3] = {nullptr, nullptr, nullptr};
lv_obj_t *timedPanel = nullptr;
lv_obj_t *ivalLabel = nullptr;
lv_obj_t *distLabel = nullptr;
lv_obj_t *veil = nullptr;

uint8_t pulseLevel = 0;

uint32_t accentFor(Mode m) {
  switch (m) {
    case Mode::Normal:  return COL_ACCENT;
    case Mode::Stealth: return COL_STEALTH;
    case Mode::Timed:   return COL_TIMED;
  }
  return COL_ACCENT;
}

void fmtCountdown(char *out, size_t n, uint32_t ms) {
  const uint32_t s = (ms + 999) / 1000;
  if (s >= 60) snprintf(out, n, "%lu:%02lu", (unsigned long)(s / 60), (unsigned long)(s % 60));
  else         snprintf(out, n, "%lus", (unsigned long)s);
}

// ---- event handlers ----
void onStart(lv_event_t *) { controller::toggle(); refresh(); }
void onModeChip(lv_event_t *e) {
  controller::setMode((Mode)(intptr_t)lv_event_get_user_data(e));
  refresh();
}
void onIvalMinus(lv_event_t *) { controller::stepTimedInterval(-1); refresh(); }
void onIvalPlus(lv_event_t *)  { controller::stepTimedInterval(+1); refresh(); }
void onDistMinus(lv_event_t *) { controller::stepTimedDistance(-1); refresh(); }
void onDistPlus(lv_event_t *)  { controller::stepTimedDistance(+1); refresh(); }

lv_obj_t *makeStepBtn(lv_obj_t *parent, const char *sym, lv_event_cb_t cb) {
  lv_obj_t *b = lv_button_create(parent);
  lv_obj_set_size(b, 54, 54);
  lv_obj_set_style_radius(b, 16, 0);
  lv_obj_set_style_bg_color(b, lv_color_hex(COL_RING_BG), 0);
  lv_obj_set_style_shadow_width(b, 0, 0);
  lv_obj_add_event_cb(b, cb, LV_EVENT_CLICKED, nullptr);
  lv_obj_t *l = lv_label_create(b);
  lv_label_set_text(l, sym);
  lv_obj_set_style_text_color(l, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_text_font(l, &lv_font_montserrat_28, 0);
  lv_obj_center(l);
  return b;
}

}  // namespace

void begin() {
  lv_obj_t *scr = lv_screen_active();
  lv_obj_set_style_bg_color(scr, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);

  shiftRoot = lv_obj_create(scr);
  lv_obj_remove_style_all(shiftRoot);
  lv_obj_set_size(shiftRoot, LV_HOR_RES, LV_VER_RES);
  lv_obj_set_style_bg_opa(shiftRoot, LV_OPA_TRANSP, 0);
  lv_obj_clear_flag(shiftRoot, LV_OBJ_FLAG_SCROLLABLE);

  // Title
  lv_obj_t *title = lv_label_create(shiftRoot);
  lv_label_set_text(title, "MOUSE  JIGGLER");
  lv_obj_set_style_text_color(title, lv_color_hex(0x8A93A6), 0);
  lv_obj_set_style_text_font(title, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_letter_space(title, 3, 0);
  lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 26);

  // Countdown ring (background track + value arc)
  ring = lv_arc_create(shiftRoot);
  lv_obj_set_size(ring, 300, 300);
  lv_arc_set_rotation(ring, 270);
  lv_arc_set_bg_angles(ring, 0, 360);
  lv_arc_set_range(ring, 0, 1000);
  lv_arc_set_value(ring, 1000);
  lv_obj_remove_style(ring, nullptr, LV_PART_KNOB);
  lv_obj_clear_flag(ring, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_style_arc_width(ring, 10, LV_PART_MAIN);
  lv_obj_set_style_arc_width(ring, 10, LV_PART_INDICATOR);
  lv_obj_set_style_arc_color(ring, lv_color_hex(COL_RING_BG), LV_PART_MAIN);
  lv_obj_set_style_arc_color(ring, lv_color_hex(COL_ACCENT), LV_PART_INDICATOR);
  lv_obj_align(ring, LV_ALIGN_TOP_MID, 0, 66);
  arc = ring;

  // Mode name + countdown inside the ring
  modeLabel = lv_label_create(shiftRoot);
  lv_label_set_text(modeLabel, "NORMAL");
  lv_obj_set_style_text_color(modeLabel, lv_color_hex(COL_ACCENT), 0);
  lv_obj_set_style_text_font(modeLabel, &lv_font_montserrat_20, 0);
  lv_obj_set_style_text_letter_space(modeLabel, 2, 0);
  lv_obj_align_to(modeLabel, ring, LV_ALIGN_CENTER, 0, -34);

  countLabel = lv_label_create(shiftRoot);
  lv_label_set_text(countLabel, "10s");
  lv_obj_set_style_text_color(countLabel, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_text_font(countLabel, &lv_font_montserrat_48, 0);
  lv_obj_align_to(countLabel, ring, LV_ALIGN_CENTER, 0, 10);

  subLabel = lv_label_create(shiftRoot);
  lv_label_set_text(subLabel, "paused");
  lv_obj_set_style_text_color(subLabel, lv_color_hex(0x8A93A6), 0);
  lv_obj_set_style_text_font(subLabel, &lv_font_montserrat_14, 0);
  lv_obj_align_to(subLabel, ring, LV_ALIGN_CENTER, 0, 52);

  // Mode chips
  static const char *names[3] = {"Normal", "Stealth", "Timed"};
  lv_obj_t *chipRow = lv_obj_create(shiftRoot);
  lv_obj_remove_style_all(chipRow);
  lv_obj_set_size(chipRow, 360, 44);
  lv_obj_set_flex_flow(chipRow, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(chipRow, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(chipRow, 10, 0);
  lv_obj_align(chipRow, LV_ALIGN_TOP_MID, 0, 378);
  for (int i = 0; i < 3; i++) {
    lv_obj_t *c = lv_button_create(chipRow);
    lv_obj_set_size(c, 108, 40);
    lv_obj_set_style_radius(c, 20, 0);
    lv_obj_set_style_shadow_width(c, 0, 0);
    lv_obj_set_style_bg_color(c, lv_color_hex(COL_CARD), 0);
    lv_obj_add_event_cb(c, onModeChip, LV_EVENT_CLICKED, (void *)(intptr_t)i);
    lv_obj_t *l = lv_label_create(c);
    lv_label_set_text(l, names[i]);
    lv_obj_set_style_text_font(l, &lv_font_montserrat_14, 0);
    lv_obj_center(l);
    modeChips[i] = c;
  }

  // Timed settings panel (interval + distance steppers)
  timedPanel = lv_obj_create(shiftRoot);
  lv_obj_remove_style_all(timedPanel);
  lv_obj_set_size(timedPanel, 380, 72);
  lv_obj_set_style_bg_color(timedPanel, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_bg_opa(timedPanel, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(timedPanel, 18, 0);
  lv_obj_clear_flag(timedPanel, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_align(timedPanel, LV_ALIGN_TOP_MID, 0, 428);

  makeStepBtn(timedPanel, "-", onIvalMinus);  // left side = interval
  ivalLabel = lv_label_create(timedPanel);
  lv_label_set_text(ivalLabel, "60s");
  lv_obj_set_style_text_color(ivalLabel, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_text_font(ivalLabel, &lv_font_montserrat_20, 0);
  lv_obj_align(lv_obj_get_child(timedPanel, 0), LV_ALIGN_LEFT_MID, 8, 0);
  lv_obj_align(ivalLabel, LV_ALIGN_LEFT_MID, 72, 0);
  lv_obj_t *ivalPlus = makeStepBtn(timedPanel, "+", onIvalPlus);
  lv_obj_align(ivalPlus, LV_ALIGN_LEFT_MID, 132, 0);

  // (distance steppers were trimmed to keep the panel readable at this size;
  //  interval is the primary control. Distance still steps via the API.)
  distLabel = lv_label_create(timedPanel);
  lv_label_set_text(distLabel, "10 px");
  lv_obj_set_style_text_color(distLabel, lv_color_hex(0x8A93A6), 0);
  lv_obj_set_style_text_font(distLabel, &lv_font_montserrat_14, 0);
  lv_obj_align(distLabel, LV_ALIGN_RIGHT_MID, -14, 0);

  // START / STOP
  startBtn = lv_button_create(shiftRoot);
  lv_obj_set_size(startBtn, 240, 60);
  lv_obj_set_style_radius(startBtn, 30, 0);
  lv_obj_set_style_shadow_width(startBtn, 0, 0);
  lv_obj_set_style_bg_color(startBtn, lv_color_hex(COL_ACCENT), 0);
  lv_obj_add_event_cb(startBtn, onStart, LV_EVENT_CLICKED, nullptr);
  lv_obj_align(startBtn, LV_ALIGN_BOTTOM_MID, 0, -20);
  startLabel = lv_label_create(startBtn);
  lv_label_set_text(startLabel, "START");
  lv_obj_set_style_text_color(startLabel, lv_color_hex(0x04120F), 0);
  lv_obj_set_style_text_font(startLabel, &lv_font_montserrat_20, 0);
  lv_obj_set_style_text_letter_space(startLabel, 2, 0);
  lv_obj_center(startLabel);

  statusLabel = lv_label_create(shiftRoot);
  lv_label_set_text(statusLabel, "0 cycles");
  lv_obj_set_style_text_color(statusLabel, lv_color_hex(0x5A6274), 0);
  lv_obj_set_style_text_font(statusLabel, &lv_font_montserrat_12, 0);
  lv_obj_align(statusLabel, LV_ALIGN_BOTTOM_MID, 0, -88);

  // Dimming veil over the whole UI
  veil = lv_obj_create(scr);
  lv_obj_remove_style_all(veil);
  lv_obj_set_size(veil, LV_HOR_RES, LV_VER_RES);
  lv_obj_set_style_bg_color(veil, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_opa(veil, LV_OPA_TRANSP, 0);
  lv_obj_add_flag(veil, LV_OBJ_FLAG_IGNORE_LAYOUT);
  lv_obj_clear_flag(veil, LV_OBJ_FLAG_CLICKABLE);

  refresh();
}

void refresh() {
  const Mode m = controller::mode();
  const bool run = controller::running();
  const uint32_t accent = accentFor(m);

  // Decay the cycle pulse back to the resting ring width.
  if (pulseLevel > 0) {
    pulseLevel = (pulseLevel > 24) ? pulseLevel - 24 : 0;
    const int16_t w = 10 + (int16_t)((uint16_t)pulseLevel * 8 / 255);
    lv_obj_set_style_arc_width(ring, w, LV_PART_INDICATOR);
  }

  lv_label_set_text(modeLabel, controller::modeName(m));
  lv_obj_set_style_text_color(modeLabel, lv_color_hex(accent), 0);

  // Ring colour + fill from countdown progress.
  lv_obj_set_style_arc_color(ring, lv_color_hex(run ? accent : COL_IDLE), LV_PART_INDICATOR);
  const uint32_t len = controller::cycleLengthMs();
  const uint32_t left = controller::msUntilNext();
  uint32_t v = len ? (uint32_t)((uint64_t)left * 1000 / len) : 0;
  if (v > 1000) v = 1000;
  lv_arc_set_value(ring, v);

  char buf[16];
  fmtCountdown(buf, sizeof(buf), left);
  lv_label_set_text(countLabel, buf);
  lv_obj_align_to(countLabel, ring, LV_ALIGN_CENTER, 0, 10);
  lv_obj_set_style_text_color(countLabel, lv_color_hex(run ? COL_TEXT : 0x9AA2B4), 0);

  lv_label_set_text(subLabel, run ? "next move in" : "paused");

  // Chip highlighting.
  for (int i = 0; i < 3; i++) {
    const bool sel = ((int)m == i);
    lv_obj_set_style_bg_color(modeChips[i], lv_color_hex(sel ? accent : COL_CARD), 0);
    lv_obj_t *l = lv_obj_get_child(modeChips[i], 0);
    lv_obj_set_style_text_color(l, lv_color_hex(sel ? 0x05110E : COL_TEXT), 0);
  }

  // Timed panel only in Timed mode.
  if (m == Mode::Timed) lv_obj_clear_flag(timedPanel, LV_OBJ_FLAG_HIDDEN);
  else                  lv_obj_add_flag(timedPanel, LV_OBJ_FLAG_HIDDEN);
  lv_label_set_text(ivalLabel, controller::timedIntervalLabel());
  char dbuf[16];
  snprintf(dbuf, sizeof(dbuf), "%u px", (unsigned)controller::timedDistance());
  lv_label_set_text(distLabel, dbuf);

  // Start button.
  lv_obj_set_style_bg_color(startBtn, lv_color_hex(run ? 0x2A3142 : accent), 0);
  lv_label_set_text(startLabel, run ? "STOP" : "START");
  lv_obj_set_style_text_color(startLabel, lv_color_hex(run ? COL_TEXT : 0x05110E), 0);

  char sbuf[32];
  snprintf(sbuf, sizeof(sbuf), "%lu cycles", (unsigned long)controller::cycleCount());
  lv_label_set_text(statusLabel, sbuf);
}

void pulse() {
  pulseLevel = 255;
  lv_obj_set_style_arc_width(ring, 18, LV_PART_INDICATOR);
}

void setShift(int8_t dx, int8_t dy) {
  if (shiftRoot) lv_obj_set_pos(shiftRoot, dx, dy);
}

void setDimVeil(uint8_t alpha) {
  if (!veil) return;
  lv_obj_set_style_bg_opa(veil, alpha, 0);
}

}  // namespace ui
