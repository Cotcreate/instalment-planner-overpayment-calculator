/*
 * Tally Block for Kode Dot (ESP32-S3)
 * ------------------------------------------------------------
 * A full-screen tap counter with vibrant block colours.
 *
 *  - Tap anywhere          -> +1
 *  - Double-tap            -> -1 (never below 0)
 *  - Hold the reset pill   -> reset to 0 after 1.2 s (let go early to cancel)
 *  - After a reset, an UNDO button shows for 6 s
 *  - Every number gets its own block colour; the new colour floods out
 *    from where you tapped. The RGB LED matches the current block.
 *  - The count is saved to flash (NVS), so it survives power-off.
 *
 * Built on the official kodediy/kodedot_examples layout (KodeDotBSP + LVGL 9).
 */
#include <Arduino.h>
#include <lvgl.h>
#include <Preferences.h>
#include <Adafruit_NeoPixel.h>
#include <esp_pm.h>
#include <math.h>
#include <kodedot/display_manager.h>
#include <kodedot/pin_config.h>

// Fonts (Bricolage Grotesque, generated with lv_font_conv, 4 bpp)
extern const lv_font_t Tally_260;  // digits, 1-2 digit numbers
extern const lv_font_t Tally_180;  // digits, 3 digit numbers
extern const lv_font_t Tally_124;  // digits, 4-5 digit numbers
extern const lv_font_t Tally_22;   // UI labels

// -----------------------------------------------------------------------------
// Tuning
// -----------------------------------------------------------------------------
static const uint32_t DOUBLE_TAP_MS   = 280;    // window for a second tap
static const uint32_t HOLD_RESET_MS   = 1200;   // hold time to reset
static const uint32_t UNDO_SHOW_MS    = 6000;   // how long UNDO stays up
static const uint32_t SAVE_DELAY_MS   = 1500;   // batch flash writes
static const uint32_t FLOOD_MS        = 300;    // colour wipe duration
static const uint32_t MAX_COUNT       = 99999;  // fits the screen at 124 px
static const uint8_t  LED_BRIGHTNESS  = 40;     // 0-255

// -----------------------------------------------------------------------------
// Palette: block colour + whether text on it is dark ink or light paper
// -----------------------------------------------------------------------------
static const uint32_t INK   = 0x15120F;
static const uint32_t PAPER = 0xFFFDF8;

struct Block { uint32_t bg; bool darkText; };
static const Block BLOCKS[] = {
    {0xFF5436, true },  // tomato
    {0xFFC22E, true },  // sunflower
    {0x19C98A, true },  // mint
    {0x2F5BFF, false},  // cobalt
    {0xFF6FB1, true },  // pink
    {0xFF9A1F, true },  // tangerine
    {0x00A6A6, false},  // teal
    {0xB6E62E, true },  // lime
};
static const size_t BLOCK_COUNT = sizeof(BLOCKS) / sizeof(BLOCKS[0]);

static const Block &blockFor(uint32_t n) { return BLOCKS[n % BLOCK_COUNT]; }

// -----------------------------------------------------------------------------
// Hardware / storage
// -----------------------------------------------------------------------------
DisplayManager display;
static Preferences prefs;
static Adafruit_NeoPixel pixel(NEO_PIXEL_COUNT, NEO_PIXEL_PIN, LED_STRIP_COLOR_ORDER + LED_STRIP_TIMING);
static esp_pm_lock_handle_t noSleepLock = nullptr;

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------
static uint32_t count = 0;
static uint32_t countBeforeReset = 0;

static bool     tapPending = false;
static uint32_t tapTime = 0;
static lv_point_t tapPoint = {0, 0};

static bool     holding = false;
static uint32_t holdStart = 0;

static bool     savePending = false;
static uint32_t saveDue = 0;
static uint32_t undoHideAt = 0;

// -----------------------------------------------------------------------------
// UI objects
// -----------------------------------------------------------------------------
static lv_obj_t *scr;
static lv_obj_t *flood = nullptr;          // expanding colour block
static uint32_t  floodTarget = 0;          // count the flood is painting
static lv_point_t floodCenter = {0, 0};
static int32_t   floodMaxW = 0, floodMaxH = 0;

static lv_obj_t *lblBrand;
static lv_obj_t *pill, *pillFill, *lblPill;
static lv_obj_t *lblNum;
static lv_obj_t *chipTap, *chipDouble, *lblChipTap, *lblChipDouble;
static lv_obj_t *toast, *lblToast, *btnUndo;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
static lv_obj_t *plainObj(lv_obj_t *parent) {
    lv_obj_t *o = lv_obj_create(parent);
    lv_obj_remove_style_all(o);
    lv_obj_remove_flag(o, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(o, LV_OBJ_FLAG_CLICKABLE);
    return o;
}

static void setLed(uint32_t rgb) {
    pixel.setPixelColor(0, pixel.Color((rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF));
    pixel.show();
}

static const lv_font_t *fontForCount(uint32_t n) {
    if (n < 100)   return &Tally_260;
    if (n < 1000)  return &Tally_180;
    return &Tally_124;
}

// Paint every colour-dependent element for block n
static void paint(uint32_t n) {
    const Block &b = blockFor(n);
    lv_color_t bg = lv_color_hex(b.bg);
    lv_color_t fg = lv_color_hex(b.darkText ? INK : PAPER);

    lv_obj_set_style_bg_color(scr, bg, 0);
    lv_obj_set_style_text_color(lblBrand, fg, 0);
    lv_obj_set_style_text_color(lblNum, fg, 0);
    lv_obj_set_style_border_color(pill, fg, 0);
    lv_obj_set_style_bg_color(pillFill, fg, 0);
    lv_obj_set_style_text_color(lblPill, fg, 0);
    lv_obj_set_style_bg_color(chipTap, fg, 0);
    lv_obj_set_style_bg_color(chipDouble, fg, 0);
    lv_obj_set_style_text_color(lblChipTap, fg, 0);
    lv_obj_set_style_text_color(lblChipDouble, fg, 0);

    setLed(b.bg);
}

static void showNumber(uint32_t n) {
    lv_obj_set_style_text_font(lblNum, fontForCount(n), 0);
    lv_label_set_text_fmt(lblNum, "%lu", (unsigned long)n);
}

static void scheduleSave() {
    savePending = true;
    saveDue = millis() + SAVE_DELAY_MS;
}

// -----------------------------------------------------------------------------
// Animations
// -----------------------------------------------------------------------------
static void anim_translate_y(void *obj, int32_t v) {
    lv_obj_set_style_translate_y((lv_obj_t *)obj, v, 0);
}

static void anim_shake(void *obj, int32_t v) {
    // v runs 0..1000; damped sine for a short "no" wiggle
    float t = v / 1000.0f;
    int32_t x = (int32_t)(sinf(t * 6.0f * (float)M_PI) * 16.0f * (1.0f - t));
    lv_obj_set_style_translate_x((lv_obj_t *)obj, x, 0);
}

static void bounce(int32_t from) {
    lv_anim_delete(lblNum, anim_translate_y);
    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, lblNum);
    lv_anim_set_exec_cb(&a, anim_translate_y);
    lv_anim_set_values(&a, from, 0);
    lv_anim_set_duration(&a, 260);
    lv_anim_set_path_cb(&a, lv_anim_path_overshoot);
    lv_anim_start(&a);
}

static void nope() {
    lv_anim_delete(lblNum, anim_shake);
    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, lblNum);
    lv_anim_set_exec_cb(&a, anim_shake);
    lv_anim_set_values(&a, 0, 1000);
    lv_anim_set_duration(&a, 350);
    lv_anim_start(&a);
}

// Flood: a block of the new colour grows out from the touch point
static void finishFlood() {
    if (!flood) return;
    lv_anim_delete(flood, nullptr);
    lv_obj_delete(flood);
    flood = nullptr;
    paint(floodTarget);
}

static void anim_flood(void *obj, int32_t v) {
    // v: 0..1000 progress
    int32_t w = (floodMaxW * v) / 1000;
    int32_t h = (floodMaxH * v) / 1000;
    lv_obj_t *o = (lv_obj_t *)obj;
    lv_obj_set_size(o, w, h);
    lv_obj_set_pos(o, floodCenter.x - w / 2, floodCenter.y - h / 2);
}

static void flood_done(lv_anim_t *a) {
    (void)a;
    finishFlood();
}

static void floodTo(uint32_t n, lv_point_t at) {
    finishFlood();  // complete any wipe still running

    floodTarget = n;
    floodCenter = at;
    // Big enough to cover the screen from this point
    int32_t dx = max((int32_t)at.x, (int32_t)LCD_WIDTH - at.x);
    int32_t dy = max((int32_t)at.y, (int32_t)LCD_HEIGHT - at.y);
    floodMaxW = dx * 2 + 4;
    floodMaxH = dy * 2 + 4;

    flood = plainObj(scr);
    lv_obj_set_style_bg_opa(flood, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(flood, lv_color_hex(blockFor(n).bg), 0);
    lv_obj_set_size(flood, 0, 0);
    lv_obj_move_to_index(flood, 0);  // behind all the UI

    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, flood);
    lv_anim_set_exec_cb(&a, anim_flood);
    lv_anim_set_values(&a, 0, 1000);
    lv_anim_set_duration(&a, FLOOD_MS);
    lv_anim_set_path_cb(&a, lv_anim_path_ease_out);
    lv_anim_set_completed_cb(&a, flood_done);
    lv_anim_start(&a);
}

// -----------------------------------------------------------------------------
// Count changes
// -----------------------------------------------------------------------------
static void setCount(uint32_t n, lv_point_t at, int32_t bounceFrom) {
    count = n;
    showNumber(count);
    bounce(bounceFrom);
    floodTo(count, at);
    scheduleSave();
}

static void increment(lv_point_t at) {
    if (count >= MAX_COUNT) { nope(); return; }
    setCount(count + 1, at, 18);
}

static void decrement(lv_point_t at) {
    if (count == 0) { nope(); return; }
    setCount(count - 1, at, -18);
}

static lv_point_t centerOf(lv_obj_t *o) {
    lv_area_t a;
    lv_obj_get_coords(o, &a);
    lv_point_t p = {(int32_t)((a.x1 + a.x2) / 2), (int32_t)((a.y1 + a.y2) / 2)};
    return p;
}

// -----------------------------------------------------------------------------
// Undo toast
// -----------------------------------------------------------------------------
static void showToast() {
    lv_label_set_text_fmt(lblToast, "RESET FROM %lu", (unsigned long)countBeforeReset);
    lv_obj_remove_flag(toast, LV_OBJ_FLAG_HIDDEN);
    undoHideAt = millis() + UNDO_SHOW_MS;
}

static void hideToast() {
    lv_obj_add_flag(toast, LV_OBJ_FLAG_HIDDEN);
    undoHideAt = 0;
}

static void undo_cb(lv_event_t *e) {
    (void)e;
    hideToast();
    setCount(countBeforeReset, centerOf(btnUndo), 18);
}

// -----------------------------------------------------------------------------
// Hold-to-reset pill
// -----------------------------------------------------------------------------
static void anim_fill_width(void *obj, int32_t v) {
    lv_obj_set_width((lv_obj_t *)obj, v);
}

static void cancelHold() {
    holding = false;
    lv_anim_delete(pillFill, anim_fill_width);
    lv_obj_set_width(pillFill, 0);
}

static void pill_cb(lv_event_t *e) {
    lv_event_code_t code = lv_event_get_code(e);
    if (code == LV_EVENT_PRESSED) {
        if (count == 0) { nope(); return; }
        holding = true;
        holdStart = millis();
        lv_anim_t a;
        lv_anim_init(&a);
        lv_anim_set_var(&a, pillFill);
        lv_anim_set_exec_cb(&a, anim_fill_width);
        lv_anim_set_values(&a, 0, lv_obj_get_width(pill));
        lv_anim_set_duration(&a, HOLD_RESET_MS);
        lv_anim_set_path_cb(&a, lv_anim_path_linear);
        lv_anim_start(&a);
    } else if (code == LV_EVENT_RELEASED || code == LV_EVENT_PRESS_LOST) {
        if (holding) cancelHold();
    }
}

static void checkHold() {
    if (!holding || millis() - holdStart < HOLD_RESET_MS) return;
    cancelHold();
    countBeforeReset = count;
    setCount(0, centerOf(pill), -18);
    showToast();
}

// -----------------------------------------------------------------------------
// Tap / double-tap on the screen
// -----------------------------------------------------------------------------
static void screen_click_cb(lv_event_t *e) {
    (void)e;
    lv_point_t p = {LCD_WIDTH / 2, LCD_HEIGHT / 2};
    lv_indev_t *indev = lv_indev_active();
    if (indev) lv_indev_get_point(indev, &p);

    uint32_t now = millis();
    if (tapPending && now - tapTime < DOUBLE_TAP_MS) {
        tapPending = false;
        decrement(p);
    } else {
        tapPending = true;
        tapTime = now;
        tapPoint = p;
    }
}

static void checkSingleTap() {
    if (tapPending && millis() - tapTime >= DOUBLE_TAP_MS) {
        tapPending = false;
        increment(tapPoint);
    }
}

// Runs every 20 ms inside LVGL
static void tick_cb(lv_timer_t *t) {
    (void)t;
    checkSingleTap();
    checkHold();
    if (undoHideAt && (int32_t)(millis() - undoHideAt) >= 0) hideToast();
    if (savePending && (int32_t)(millis() - saveDue) >= 0) {
        savePending = false;
        prefs.putUInt("count", count);
    }
}

// -----------------------------------------------------------------------------
// UI construction
// -----------------------------------------------------------------------------
static lv_obj_t *makeChip(lv_obj_t *parent, const char *text, lv_obj_t **labelOut) {
    lv_obj_t *chip = plainObj(parent);
    lv_obj_set_size(chip, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_style_radius(chip, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_opa(chip, LV_OPA_20, 0);
    lv_obj_set_style_pad_hor(chip, 16, 0);
    lv_obj_set_style_pad_ver(chip, 10, 0);
    lv_obj_t *l = lv_label_create(chip);
    lv_obj_set_style_text_font(l, &Tally_22, 0);
    lv_obj_set_style_text_letter_space(l, 2, 0);
    lv_label_set_text(l, text);
    *labelOut = l;
    return chip;
}

static void buildUi() {
    scr = lv_screen_active();
    lv_obj_remove_style_all(scr);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
    lv_obj_remove_flag(scr, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(scr, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(scr, screen_click_cb, LV_EVENT_CLICKED, nullptr);

    // Header: brand (left)
    lblBrand = lv_label_create(scr);
    lv_obj_set_style_text_font(lblBrand, &Tally_22, 0);
    lv_obj_set_style_text_letter_space(lblBrand, 4, 0);
    lv_label_set_text(lblBrand, "TALLY");
    lv_obj_align(lblBrand, LV_ALIGN_TOP_LEFT, 26, 34);

    // Header: hold-to-reset pill (right)
    pill = plainObj(scr);
    lv_obj_add_flag(pill, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(pill, 206, 48);
    lv_obj_set_style_radius(pill, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_border_width(pill, 3, 0);
    lv_obj_set_style_clip_corner(pill, true, 0);
    lv_obj_set_ext_click_area(pill, 10);
    lv_obj_align(pill, LV_ALIGN_TOP_RIGHT, -20, 22);
    lv_obj_add_event_cb(pill, pill_cb, LV_EVENT_ALL, nullptr);

    pillFill = plainObj(pill);
    lv_obj_set_style_bg_opa(pillFill, LV_OPA_40, 0);
    lv_obj_set_size(pillFill, 0, LV_PCT(100));
    lv_obj_align(pillFill, LV_ALIGN_LEFT_MID, 0, 0);

    lblPill = lv_label_create(pill);
    lv_obj_set_style_text_font(lblPill, &Tally_22, 0);
    lv_obj_set_style_text_letter_space(lblPill, 1, 0);
    lv_label_set_text(lblPill, "HOLD TO RESET");
    lv_obj_center(lblPill);

    // The number
    lblNum = lv_label_create(scr);
    lv_obj_set_style_text_align(lblNum, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(lblNum, LV_ALIGN_CENTER, 0, 0);

    // Footer chips
    lv_obj_t *footer = plainObj(scr);
    lv_obj_set_size(footer, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(footer, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(footer, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(footer, 12, 0);
    lv_obj_align(footer, LV_ALIGN_BOTTOM_MID, 0, -30);
    chipTap = makeChip(footer, "TAP +1", &lblChipTap);
    chipDouble = makeChip(footer, "DOUBLE-TAP -1", &lblChipDouble);

    // Undo toast (hidden until a reset)
    toast = plainObj(scr);
    lv_obj_add_flag(toast, LV_OBJ_FLAG_CLICKABLE);  // swallow taps on the toast
    lv_obj_set_size(toast, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(toast, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(toast, lv_color_hex(INK), 0);
    lv_obj_set_style_radius(toast, 16, 0);
    lv_obj_set_style_pad_left(toast, 18, 0);
    lv_obj_set_style_pad_right(toast, 8, 0);
    lv_obj_set_style_pad_ver(toast, 8, 0);
    lv_obj_set_style_pad_column(toast, 16, 0);
    lv_obj_set_flex_flow(toast, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(toast, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_align(toast, LV_ALIGN_BOTTOM_MID, 0, -96);

    lblToast = lv_label_create(toast);
    lv_obj_set_style_text_font(lblToast, &Tally_22, 0);
    lv_obj_set_style_text_color(lblToast, lv_color_hex(PAPER), 0);

    btnUndo = plainObj(toast);
    lv_obj_add_flag(btnUndo, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(btnUndo, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(btnUndo, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(btnUndo, lv_color_hex(PAPER), 0);
    lv_obj_set_style_radius(btnUndo, 10, 0);
    lv_obj_set_style_pad_hor(btnUndo, 16, 0);
    lv_obj_set_style_pad_ver(btnUndo, 10, 0);
    lv_obj_set_ext_click_area(btnUndo, 8);
    lv_obj_add_event_cb(btnUndo, undo_cb, LV_EVENT_CLICKED, nullptr);
    lv_obj_t *lblUndo = lv_label_create(btnUndo);
    lv_obj_set_style_text_font(lblUndo, &Tally_22, 0);
    lv_obj_set_style_text_color(lblUndo, lv_color_hex(INK), 0);
    lv_label_set_text(lblUndo, "UNDO");
    lv_obj_add_flag(toast, LV_OBJ_FLAG_HIDDEN);
}

// -----------------------------------------------------------------------------
// Arduino entry points
// -----------------------------------------------------------------------------
void setup() {
    Serial.begin(115200);

    if (!display.init()) {
        Serial.println("Display init failed");
        while (true) delay(1000);
    }

    prefs.begin("tally", false);
    count = prefs.getUInt("count", 0);
    if (count > MAX_COUNT) count = 0;

    // NeoPixel (keep out of light sleep while RMT runs, as in the Kode examples)
    if (!noSleepLock &&
        esp_pm_lock_create(ESP_PM_NO_LIGHT_SLEEP, 0, "neopixel", &noSleepLock) == ESP_OK) {
        esp_pm_lock_acquire(noSleepLock);
    }
    pinMode(NEO_PIXEL_PIN, OUTPUT);
    pixel.begin();
    pixel.setBrightness(LED_BRIGHTNESS);
    pixel.clear();
    pixel.show();

    buildUi();
    showNumber(count);
    paint(count);

    lv_timer_create(tick_cb, 20, nullptr);
    Serial.println("Tally Block ready");
}

void loop() {
    display.update();
    delay(5);
}
