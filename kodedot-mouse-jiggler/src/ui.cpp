#include "ui.h"

#include <lvgl.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

#include "controller.h"

// Screen layout (410 x 502):
//   title 16 | ring 44-284 | info 292 | mode chips 322 | timed panel / history 372 | button 436

namespace ui {
namespace {

constexpr int RING = 240;
constexpr int RING_X = (410 - RING) / 2;
constexpr int RING_Y = 44;
constexpr float RING_R = RING / 2.0f - 5.0f;      // centre line of the 10 px arc
constexpr float CX = RING_X + RING / 2.0f;
constexpr float CY = RING_Y + RING / 2.0f;
constexpr int HIST_N = 12;
constexpr int RIPPLE_GROW = 56;

constexpr uint32_t COL_BG      = 0x000000;
constexpr uint32_t COL_CARD    = 0x0D0F14;
constexpr uint32_t COL_RING_BG = 0x1C2330;
constexpr uint32_t COL_IDLE    = 0x3A4256;
constexpr uint32_t COL_ACCENT  = 0x18E0C8;  // teal   - Normal
constexpr uint32_t COL_STEALTH = 0x8A6CFF;  // violet - Stealth
constexpr uint32_t COL_TIMED   = 0xFFB347;  // amber  - Timed
constexpr uint32_t COL_TEXT    = 0xF2F5FA;
constexpr uint32_t COL_MUTED   = 0x8A93A6;

lv_obj_t *shiftRoot = nullptr;
lv_obj_t *glow = nullptr;
lv_obj_t *ring = nullptr;
lv_obj_t *ripple = nullptr;
lv_obj_t *comet[3] = {nullptr, nullptr, nullptr};
lv_obj_t *modeLabel = nullptr;
lv_obj_t *countLabel = nullptr;
lv_obj_t *subLabel = nullptr;
lv_obj_t *infoLabel = nullptr;
lv_obj_t *modeChips[3] = {nullptr, nullptr, nullptr};
lv_obj_t *timedPanel = nullptr;
lv_obj_t *histRow = nullptr;
lv_obj_t *histDots[HIST_N] = {nullptr};
lv_obj_t *ivalLabel = nullptr;
lv_obj_t *distLabel = nullptr;
lv_obj_t *startBtn = nullptr;
lv_obj_t *startLabel = nullptr;
lv_obj_t *veil = nullptr;

int8_t hist[HIST_N];   // mode of each past cycle, -1 = empty
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

void fmtHms(char *out, size_t n, uint32_t ms) {
  const uint32_t s = ms / 1000;
  snprintf(out, n, "%lu:%02lu:%02lu", (unsigned long)(s / 3600), (unsigned long)((s / 60) % 60),
           (unsigned long)(s % 60));
}

// Only touch a label when its text really changed, so LVGL redraws less.
void setText(lv_obj_t *label, const char *text) {
  const char *cur = lv_label_get_text(label);
  if (!cur || strcmp(cur, text) != 0) lv_label_set_text(label, text);
}

lv_obj_t *makeCircle(lv_obj_t *parent, int size, uint32_t color) {
  lv_obj_t *o = lv_obj_create(parent);
  lv_obj_remove_style_all(o);
  lv_obj_set_size(o, size, size);
  lv_obj_set_style_radius(o, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_color(o, lv_color_hex(color), 0);
  lv_obj_set_style_bg_opa(o, LV_OPA_COVER, 0);
  lv_obj_remove_flag(o, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_remove_flag(o, LV_OBJ_FLAG_SCROLLABLE);
  return o;
}

// ---- animations ----
void glowExec(void *var, int32_t v) {
  lv_obj_set_style_arc_opa(static_cast<lv_obj_t *>(var), (lv_opa_t)v, LV_PART_INDICATOR);
}

void rippleExec(void *var, int32_t v) {
  lv_obj_t *o = static_cast<lv_obj_t *>(var);
  lv_obj_set_size(o, v, v);
  lv_obj_align_to(o, ring, LV_ALIGN_CENTER, 0, 0);
  const int32_t t = (v - RING) * 255 / RIPPLE_GROW;          // 0..255 as it grows
  lv_obj_set_style_border_opa(o, (lv_opa_t)(200 - (200 * t) / 255), 0);
}

void rippleDone(lv_anim_t *a) {
  lv_obj_add_flag(static_cast<lv_obj_t *>(a->var), LV_OBJ_FLAG_HIDDEN);
}

// ---- events ----
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
  lv_obj_set_size(b, 38, 38);
  lv_obj_set_style_radius(b, 12, 0);
  lv_obj_set_style_bg_color(b, lv_color_hex(COL_RING_BG), 0);
  lv_obj_set_style_shadow_width(b, 0, 0);
  lv_obj_set_style_transform_scale(b, 240, LV_STATE_PRESSED);
  lv_obj_add_event_cb(b, cb, LV_EVENT_CLICKED, nullptr);
  lv_obj_t *l = lv_label_create(b);
  lv_label_set_text(l, sym);
  lv_obj_set_style_text_color(l, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_text_font(l, &lv_font_montserrat_20, 0);
  lv_obj_center(l);
  return b;
}

lv_obj_t *makeGroup(lv_obj_t *parent) {
  lv_obj_t *g = lv_obj_create(parent);
  lv_obj_remove_style_all(g);
  lv_obj_set_size(g, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(g, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(g, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(g, 4, 0);
  lv_obj_remove_flag(g, LV_OBJ_FLAG_SCROLLABLE);
  return g;
}

lv_obj_t *makeValueLabel(lv_obj_t *parent, const char *text) {
  lv_obj_t *l = lv_label_create(parent);
  lv_label_set_text(l, text);
  lv_obj_set_width(l, 74);
  lv_obj_set_style_text_align(l, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_style_text_color(l, lv_color_hex(COL_TEXT), 0);
  lv_obj_set_style_text_font(l, &lv_font_montserrat_14, 0);
  return l;
}

}  // namespace

void begin() {
  memset(hist, -1, sizeof(hist));

  lv_obj_t *scr = lv_screen_active();
  lv_obj_set_style_bg_color(scr, lv_color_hex(COL_BG), 0);
  lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);

  shiftRoot = lv_obj_create(scr);
  lv_obj_remove_style_all(shiftRoot);
  lv_obj_set_size(shiftRoot, LV_HOR_RES, LV_VER_RES);
  lv_obj_set_style_bg_opa(shiftRoot, LV_OPA_TRANSP, 0);
  lv_obj_remove_flag(shiftRoot, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t *title = lv_label_create(shiftRoot);
  lv_label_set_text(title, "MOUSE  JIGGLER");
  lv_obj_set_style_text_color(title, lv_color_hex(COL_MUTED), 0);
  lv_obj_set_style_text_font(title, &lv_font_montserrat_12, 0);
  lv_obj_set_style_text_letter_space(title, 3, 0);
  lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 16);

  // Breathing glow behind the ring (only visible while running).
  const int glowSize = RING + 12;
  glow = lv_arc_create(shiftRoot);
  lv_obj_set_size(glow, glowSize, glowSize);
  lv_arc_set_rotation(glow, 270);
  lv_arc_set_bg_angles(glow, 0, 360);
  lv_arc_set_range(glow, 0, 1000);
  lv_arc_set_value(glow, 1000);
  lv_obj_remove_style(glow, nullptr, LV_PART_KNOB);
  lv_obj_remove_flag(glow, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_style_arc_width(glow, 22, LV_PART_MAIN);
  lv_obj_set_style_arc_width(glow, 22, LV_PART_INDICATOR);
  lv_obj_set_style_arc_opa(glow, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_arc_opa(glow, 40, LV_PART_INDICATOR);
  lv_obj_set_pos(glow, RING_X - 6, RING_Y - 6);
  lv_obj_add_flag(glow, LV_OBJ_FLAG_HIDDEN);

  lv_anim_t breathe;
  lv_anim_init(&breathe);
  lv_anim_set_var(&breathe, glow);
  lv_anim_set_exec_cb(&breathe, glowExec);
  lv_anim_set_values(&breathe, 15, 75);
  lv_anim_set_duration(&breathe, 1800);
  lv_anim_set_reverse_duration(&breathe, 1800);
  lv_anim_set_repeat_count(&breathe, LV_ANIM_REPEAT_INFINITE);
  lv_anim_set_path_cb(&breathe, lv_anim_path_ease_in_out);
  lv_anim_start(&breathe);

  // Progress ring: fills as the interval elapses.
  ring = lv_arc_create(shiftRoot);
  lv_obj_set_size(ring, RING, RING);
  lv_arc_set_rotation(ring, 270);
  lv_arc_set_bg_angles(ring, 0, 360);
  lv_arc_set_range(ring, 0, 1000);
  lv_arc_set_value(ring, 1000);
  lv_obj_remove_style(ring, nullptr, LV_PART_KNOB);
  lv_obj_remove_flag(ring, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_style_arc_width(ring, 10, LV_PART_MAIN);
  lv_obj_set_style_arc_width(ring, 10, LV_PART_INDICATOR);
  lv_obj_set_style_arc_color(ring, lv_color_hex(COL_RING_BG), LV_PART_MAIN);
  lv_obj_set_style_arc_color(ring, lv_color_hex(COL_ACCENT), LV_PART_INDICATOR);
  lv_obj_set_pos(ring, RING_X, RING_Y);

  // Expanding ripple, fired on every elapsed cycle.
  ripple = lv_obj_create(shiftRoot);
  lv_obj_remove_style_all(ripple);
  lv_obj_set_size(ripple, RING, RING);
  lv_obj_set_style_radius(ripple, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_opa(ripple, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(ripple, 3, 0);
  lv_obj_set_style_border_color(ripple, lv_color_hex(COL_ACCENT), 0);
  lv_obj_remove_flag(ripple, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_flag(ripple, LV_OBJ_FLAG_HIDDEN);

  // Comet: bright head plus two fading tail dots.
  static const int sizes[3] = {14, 10, 7};
  static const lv_opa_t opas[3] = {255, 150, 80};
  for (int i = 0; i < 3; i++) {
    comet[i] = makeCircle(shiftRoot, sizes[i], COL_ACCENT);
    lv_obj_set_style_bg_opa(comet[i], opas[i], 0);
    lv_obj_add_flag(comet[i], LV_OBJ_FLAG_HIDDEN);
  }

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
  lv_obj_align_to(countLabel, ring, LV_ALIGN_CENTER, 0, 6);

  subLabel = lv_label_create(shiftRoot);
  lv_label_set_text(subLabel, "paused");
  lv_obj_set_style_text_color(subLabel, lv_color_hex(COL_MUTED), 0);
  lv_obj_set_style_text_font(subLabel, &lv_font_montserrat_14, 0);
  lv_obj_align_to(subLabel, ring, LV_ALIGN_CENTER, 0, 46);

  infoLabel = lv_label_create(shiftRoot);
  lv_label_set_text(infoLabel, "0:00:00 active  |  0 cycles");
  lv_obj_set_style_text_color(infoLabel, lv_color_hex(COL_MUTED), 0);
  lv_obj_set_style_text_font(infoLabel, &lv_font_montserrat_14, 0);
  lv_obj_align(infoLabel, LV_ALIGN_TOP_MID, 0, 292);

  // Mode chips
  static const char *names[3] = {"Normal", "Stealth", "Timed"};
  lv_obj_t *chipRow = lv_obj_create(shiftRoot);
  lv_obj_remove_style_all(chipRow);
  lv_obj_set_size(chipRow, 360, 40);
  lv_obj_set_flex_flow(chipRow, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(chipRow, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(chipRow, 10, 0);
  lv_obj_remove_flag(chipRow, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_align(chipRow, LV_ALIGN_TOP_MID, 0, 322);
  for (int i = 0; i < 3; i++) {
    lv_obj_t *c = lv_button_create(chipRow);
    lv_obj_set_size(c, 108, 40);
    lv_obj_set_style_radius(c, 20, 0);
    lv_obj_set_style_shadow_width(c, 0, 0);
    lv_obj_set_style_bg_color(c, lv_color_hex(COL_CARD), 0);
    lv_obj_set_style_transform_scale(c, 244, LV_STATE_PRESSED);
    lv_obj_add_event_cb(c, onModeChip, LV_EVENT_CLICKED, (void *)(intptr_t)i);
    lv_obj_t *l = lv_label_create(c);
    lv_label_set_text(l, names[i]);
    lv_obj_set_style_text_font(l, &lv_font_montserrat_14, 0);
    lv_obj_center(l);
    modeChips[i] = c;
  }

  // History strip: the last 12 cycles, coloured by the mode they ran in.
  histRow = lv_obj_create(shiftRoot);
  lv_obj_remove_style_all(histRow);
  lv_obj_set_size(histRow, 380, 54);
  lv_obj_set_flex_flow(histRow, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(histRow, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(histRow, 8, 0);
  lv_obj_remove_flag(histRow, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_align(histRow, LV_ALIGN_TOP_MID, 0, 372);
  for (int i = 0; i < HIST_N; i++) histDots[i] = makeCircle(histRow, 10, COL_RING_BG);

  // Timed settings: interval and distance steppers.
  timedPanel = lv_obj_create(shiftRoot);
  lv_obj_remove_style_all(timedPanel);
  lv_obj_set_size(timedPanel, 380, 54);
  lv_obj_set_style_bg_color(timedPanel, lv_color_hex(COL_CARD), 0);
  lv_obj_set_style_bg_opa(timedPanel, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(timedPanel, 18, 0);
  lv_obj_set_flex_flow(timedPanel, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(timedPanel, LV_FLEX_ALIGN_SPACE_EVENLY, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_remove_flag(timedPanel, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_align(timedPanel, LV_ALIGN_TOP_MID, 0, 372);

  lv_obj_t *g1 = makeGroup(timedPanel);
  makeStepBtn(g1, "-", onIvalMinus);
  ivalLabel = makeValueLabel(g1, "every 1m");
  makeStepBtn(g1, "+", onIvalPlus);

  lv_obj_t *g2 = makeGroup(timedPanel);
  makeStepBtn(g2, "-", onDistMinus);
  distLabel = makeValueLabel(g2, "10 px");
  makeStepBtn(g2, "+", onDistPlus);

  // START / STOP
  startBtn = lv_button_create(shiftRoot);
  lv_obj_set_size(startBtn, 240, 54);
  lv_obj_set_style_radius(startBtn, 27, 0);
  lv_obj_set_style_shadow_width(startBtn, 0, 0);
  lv_obj_set_style_bg_color(startBtn, lv_color_hex(COL_ACCENT), 0);
  lv_obj_set_style_transform_scale(startBtn, 244, LV_STATE_PRESSED);
  lv_obj_add_event_cb(startBtn, onStart, LV_EVENT_CLICKED, nullptr);
  lv_obj_align(startBtn, LV_ALIGN_TOP_MID, 0, 436);
  startLabel = lv_label_create(startBtn);
  lv_label_set_text(startLabel, "START");
  lv_obj_set_style_text_color(startLabel, lv_color_hex(0x04120F), 0);
  lv_obj_set_style_text_font(startLabel, &lv_font_montserrat_20, 0);
  lv_obj_set_style_text_letter_space(startLabel, 2, 0);
  lv_obj_center(startLabel);

  // Dimming veil over the whole UI.
  veil = lv_obj_create(scr);
  lv_obj_remove_style_all(veil);
  lv_obj_set_size(veil, LV_HOR_RES, LV_VER_RES);
  lv_obj_set_style_bg_color(veil, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_opa(veil, LV_OPA_TRANSP, 0);
  lv_obj_add_flag(veil, LV_OBJ_FLAG_IGNORE_LAYOUT);
  lv_obj_remove_flag(veil, LV_OBJ_FLAG_CLICKABLE);

  refresh();
}

void refresh() {
  const Mode m = controller::mode();
  const bool run = controller::running();
  const uint32_t accent = accentFor(m);
  const lv_color_t accentC = lv_color_hex(accent);

  // Resting ring width after a cycle pulse.
  if (pulseLevel > 0) {
    pulseLevel = (pulseLevel > 24) ? pulseLevel - 24 : 0;
    lv_obj_set_style_arc_width(ring, 10 + (int16_t)((uint16_t)pulseLevel * 8 / 255), LV_PART_INDICATOR);
  }

  setText(modeLabel, controller::modeName(m));
  lv_obj_set_style_text_color(modeLabel, accentC, 0);

  // Ring fills as the interval elapses; full grey while paused.
  const uint32_t len = controller::cycleLengthMs();
  const uint32_t left = controller::msUntilNext();
  float elapsed = 1.0f;
  if (run && len) elapsed = 1.0f - (float)left / (float)len;
  if (elapsed < 0) elapsed = 0;
  if (elapsed > 1) elapsed = 1;
  lv_arc_set_value(ring, (int32_t)(elapsed * 1000));
  lv_obj_set_style_arc_color(ring, lv_color_hex(run ? accent : COL_IDLE), LV_PART_INDICATOR);

  // Glow + comet only while running.
  if (run) {
    lv_obj_remove_flag(glow, LV_OBJ_FLAG_HIDDEN);
    lv_obj_set_style_arc_color(glow, accentC, LV_PART_INDICATOR);
  } else {
    lv_obj_add_flag(glow, LV_OBJ_FLAG_HIDDEN);
  }
  static const float lag[3] = {0.0f, 0.03f, 0.06f};
  for (int i = 0; i < 3; i++) {
    if (!run) { lv_obj_add_flag(comet[i], LV_OBJ_FLAG_HIDDEN); continue; }
    lv_obj_remove_flag(comet[i], LV_OBJ_FLAG_HIDDEN);
    lv_obj_set_style_bg_color(comet[i], accentC, 0);
    const float th = 2.0f * (float)M_PI * (elapsed - lag[i]) - (float)M_PI / 2.0f;
    const int d = lv_obj_get_width(comet[i]);
    lv_obj_set_pos(comet[i], (int)lroundf(CX + RING_R * cosf(th) - d / 2.0f),
                             (int)lroundf(CY + RING_R * sinf(th) - d / 2.0f));
  }

  char buf[32];
  fmtCountdown(buf, sizeof(buf), left);
  setText(countLabel, buf);
  lv_obj_align_to(countLabel, ring, LV_ALIGN_CENTER, 0, 6);
  lv_obj_set_style_text_color(countLabel, lv_color_hex(run ? COL_TEXT : 0x9AA2B4), 0);
  setText(subLabel, run ? "next move in" : "paused");

  char hms[16];
  fmtHms(hms, sizeof(hms), controller::activeMs());
  const unsigned long n = controller::cycleCount();
  snprintf(buf, sizeof(buf), "%s active  |  %lu %s", hms, n, n == 1 ? "cycle" : "cycles");
  setText(infoLabel, buf);

  for (int i = 0; i < 3; i++) {
    const bool sel = ((int)m == i);
    lv_obj_set_style_bg_color(modeChips[i], lv_color_hex(sel ? accent : COL_CARD), 0);
    lv_obj_set_style_text_color(lv_obj_get_child(modeChips[i], 0), lv_color_hex(sel ? 0x05110E : COL_TEXT), 0);
  }

  // Timed panel in Timed mode, otherwise the cycle history.
  if (m == Mode::Timed) {
    lv_obj_remove_flag(timedPanel, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(histRow, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_add_flag(timedPanel, LV_OBJ_FLAG_HIDDEN);
    lv_obj_remove_flag(histRow, LV_OBJ_FLAG_HIDDEN);
  }
  snprintf(buf, sizeof(buf), "every %s", controller::timedIntervalLabel());
  setText(ivalLabel, buf);
  snprintf(buf, sizeof(buf), "%u px", (unsigned)controller::timedDistance());
  setText(distLabel, buf);

  for (int i = 0; i < HIST_N; i++) {
    if (hist[i] < 0) {
      lv_obj_set_style_bg_color(histDots[i], lv_color_hex(COL_RING_BG), 0);
      lv_obj_set_style_bg_opa(histDots[i], LV_OPA_COVER, 0);
    } else {
      lv_obj_set_style_bg_color(histDots[i], lv_color_hex(accentFor((Mode)hist[i])), 0);
      lv_obj_set_style_bg_opa(histDots[i], (lv_opa_t)(64 + 191 * (i + 1) / HIST_N), 0);
    }
  }

  lv_obj_set_style_bg_color(startBtn, lv_color_hex(run ? 0x2A3142 : accent), 0);
  setText(startLabel, run ? "STOP" : "START");
  lv_obj_set_style_text_color(startLabel, lv_color_hex(run ? COL_TEXT : 0x05110E), 0);
}

void pulse() {
  const Mode m = controller::mode();

  // Record the cycle in the history strip.
  memmove(hist, hist + 1, HIST_N - 1);
  hist[HIST_N - 1] = (int8_t)m;

  // Brief ring thickening + expanding ripple.
  pulseLevel = 255;
  lv_obj_set_style_arc_width(ring, 18, LV_PART_INDICATOR);

  lv_obj_set_style_border_color(ripple, lv_color_hex(accentFor(m)), 0);
  lv_obj_remove_flag(ripple, LV_OBJ_FLAG_HIDDEN);
  lv_anim_delete(ripple, rippleExec);
  lv_anim_t a;
  lv_anim_init(&a);
  lv_anim_set_var(&a, ripple);
  lv_anim_set_exec_cb(&a, rippleExec);
  lv_anim_set_values(&a, RING, RING + RIPPLE_GROW);
  lv_anim_set_duration(&a, 900);
  lv_anim_set_path_cb(&a, lv_anim_path_ease_out);
  lv_anim_set_completed_cb(&a, rippleDone);
  lv_anim_start(&a);
}

void setShift(int8_t dx, int8_t dy) {
  if (shiftRoot) lv_obj_set_pos(shiftRoot, dx, dy);
}

void setDimVeil(uint8_t alpha) {
  if (!veil) return;
  lv_obj_set_style_bg_opa(veil, alpha, 0);
}

}  // namespace ui
