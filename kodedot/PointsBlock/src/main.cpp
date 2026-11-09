/*
 * Points Block for Kode Dot (ESP32-S3)
 * ------------------------------------------------------------
 * A points counter for 1-6 players, in the Tally Block style.
 *
 * Scoreboard
 *  - Tap a player's block      -> +1 for that player (every tap is a point)
 *  - Hold a player's block     -> -1 for that player (never below 0)
 *  - PLAYERS pill              -> add, rename or remove players
 *
 * Physical buttons (scoreboard)
 *  - Top button                -> +1 for the selected player (mash it)
 *  - D-pad LEFT / RIGHT        -> select the previous / next player
 *  - Bottom button, press x2   -> undo the last change (repeat to go further back)
 *  - D-pad UP, hold 3 s        -> reset all scores (spinning dial; let go to cancel)
 *
 *  - The background is the selected player's colour. The last player you
 *    tapped becomes the selected one, so the top button keeps scoring for them.
 *  - The leader's block shows a LEAD tag. The RGB LED matches the background.
 *  - Players get 3-letter nicknames. First boot starts with PET and JES.
 *  - After a reset or a removal, an UNDO button shows on screen for 6 s.
 *  - Players and scores are saved to flash (NVS), so they survive power-off.
 *
 * Built on the official kodediy/kodedot_examples layout (KodeDotBSP + LVGL 9).
 */
#include <Arduino.h>
#include <Wire.h>
#include <lvgl.h>
#include <Preferences.h>
#include <Adafruit_NeoPixel.h>
#include <TCA9555.h>
#include <esp_pm.h>
#include <esp_timer.h>
#include <soc/gpio_reg.h>
#include <math.h>
#include <string.h>
#include <kodedot/display_manager.h>
#include <kodedot/pin_config.h>

// Fonts (Bricolage Grotesque, generated with lv_font_conv, 4 bpp)
extern const lv_font_t Points_260;  // 800, digits
extern const lv_font_t Points_180;  // 800, digits
extern const lv_font_t Points_124;  // 800, digits
extern const lv_font_t Points_84;   // 800, digits + A-Z (small tiles, name slots)
extern const lv_font_t Points_64;   // 800, digits (3-digit scores on the smallest tiles)
extern const lv_font_t Points_40;   // 800, digits + A-Z (names on big tiles, keys)
extern const lv_font_t Points_22;   // 700, ASCII (UI labels)

// -----------------------------------------------------------------------------
// Tuning
// -----------------------------------------------------------------------------
static const uint32_t LONG_PRESS_MS     = 600;    // hold a player's block this long for -1
static const uint32_t DOUBLE_PRESS_MS   = 450;    // bottom button: window for a second press
static const uint32_t DEBOUNCE_MS       = 15;     // physical buttons
static const uint32_t BUTTON_POLL_MS    = 5;      // how often buttons are read
static const uint32_t HOLD_MS           = 3000;   // hold time to reset / remove
static const uint32_t UNDO_SHOW_MS      = 6000;   // how long the UNDO toast stays up
static const uint32_t SAVE_DELAY_MS     = 1500;   // batch flash writes
static const uint32_t FLOOD_MS          = 300;    // background colour wipe
static const uint32_t RIPPLE_MS         = 300;    // flash inside a block on each point
static const uint16_t MAX_SCORE         = 999;    // per player
static const uint8_t  LED_BRIGHTNESS    = 40;     // 0-255
static const size_t   HISTORY_SIZE      = 100;    // undo steps kept
static const uint8_t  MAX_PLAYERS       = 6;
static const uint8_t  NAME_LEN          = 3;
static const char    *DEFAULT_NAMES[]   = {"PET", "JES"};

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
static const uint8_t BLOCK_COUNT = sizeof(BLOCKS) / sizeof(BLOCKS[0]);
// Order new players pick colours in, so neighbours always contrast
static const uint8_t COLOUR_ORDER[] = {0, 3, 1, 6, 4, 2, 5, 7};

static lv_color_t bgOf(uint8_t c) { return lv_color_hex(BLOCKS[c % BLOCK_COUNT].bg); }
static lv_color_t fgOf(uint8_t c) { return lv_color_hex(BLOCKS[c % BLOCK_COUNT].darkText ? INK : PAPER); }

// -----------------------------------------------------------------------------
// Game state (saved to NVS as one blob, and snapshotted for undo)
// -----------------------------------------------------------------------------
struct Player {
    char     name[NAME_LEN + 1];
    uint16_t score;
    uint8_t  colour;   // index into BLOCKS
};
struct Game {
    uint8_t n;         // number of players (1..MAX_PLAYERS)
    uint8_t sel;       // selected player (background colour, top button target)
    Player  p[MAX_PLAYERS];
};
static const uint8_t SAVE_VERSION = 1;

static Game game;
static Game history[HISTORY_SIZE];  // ring buffer of previous states
static size_t histHead = 0, histLen = 0;

// -----------------------------------------------------------------------------
// Hardware / storage
// -----------------------------------------------------------------------------
DisplayManager display;
static Preferences prefs;
static Adafruit_NeoPixel pixel(NEO_PIXEL_COUNT, NEO_PIXEL_PIN, LED_STRIP_COLOR_ORDER + LED_STRIP_TIMING);
static esp_pm_lock_handle_t noSleepLock = nullptr;
static TCA9555 ioexp(IOEXP_I2C_ADDR);
static bool ioexpOk = false;

// Debounced button. Reports a press on the falling (pressed) edge.
struct Button {
    bool stable = false;      // debounced state (true = pressed)
    bool raw = false;
    uint32_t rawSince = 0;

    // Feed the raw reading; returns +1 on press, -1 on release, 0 otherwise
    int update(bool pressedNow, uint32_t now) {
        if (pressedNow != raw) { raw = pressedNow; rawSince = now; }
        if (raw != stable && now - rawSince >= DEBOUNCE_MS) {
            stable = raw;
            return stable ? 1 : -1;
        }
        return 0;
    }
};
static Button btnBottom, btnPadUp, btnPadLeft, btnPadRight;

// Top button is counted by a GPIO interrupt so fast mashing never drops a
// press, even while the screen is busy drawing. A press counts on a falling
// edge only if the line was quiet for DEBOUNCE_MS before it (ignores bounce).
static volatile uint32_t topPresses = 0;
static volatile int64_t  topLastEdgeUs = 0;
static uint32_t topHandled = 0;

static void IRAM_ATTR topButtonIsr() {
    int64_t now = esp_timer_get_time();
    bool low = ((REG_READ(GPIO_IN_REG) >> BUTTON_TOP) & 1) == 0;
    if (low && now - topLastEdgeUs >= (int64_t)DEBOUNCE_MS * 1000) topPresses++;
    topLastEdgeUs = now;
}
static uint32_t lastButtonPoll = 0;
static uint32_t bottomFirstPress = 0;
static bool     bottomArmed = false;

// -----------------------------------------------------------------------------
// UI state
// -----------------------------------------------------------------------------
enum Mode { MODE_BOARD, MODE_PLAYERS, MODE_EDIT };
static Mode mode = MODE_BOARD;

enum HoldSource { HOLD_NONE, HOLD_TOUCH, HOLD_PAD };
enum HoldAction { ACT_RESET, ACT_REMOVE };
static HoldSource holdSource = HOLD_NONE;
static HoldAction holdAction = ACT_RESET;
static uint32_t   holdStart = 0;

static bool     savePending = false;
static uint32_t saveDue = 0;
static uint32_t undoHideAt = 0;

// Name editor
static int8_t  editIndex = -1;            // -1 = adding a new player
static char    editBuf[NAME_LEN + 1] = "";
static uint8_t editLen = 0;
static uint8_t editColour = 0;

// -----------------------------------------------------------------------------
// UI objects
// -----------------------------------------------------------------------------
static lv_obj_t *scr;
static lv_obj_t *flood = nullptr;          // expanding colour block (background)
static lv_point_t floodCenter = {0, 0};
static int32_t   floodMaxW = 0, floodMaxH = 0;

// Scoreboard
static lv_obj_t *lblBrand, *pillPlayers, *lblPillPlayers;
static lv_obj_t *tileArea;
static lv_obj_t *tile[MAX_PLAYERS], *lblName[MAX_PLAYERS], *lblScore[MAX_PLAYERS];
static lv_obj_t *chipLead[MAX_PLAYERS], *lblLead[MAX_PLAYERS];
static int32_t   tileW = 0, tileH = 0;     // size of a normal (non-spanning) tile
static int32_t   tileWidth[MAX_PLAYERS];   // actual width of each tile (odd one out spans)
static lv_obj_t *chipTap, *chipHold, *lblChipTap, *lblChipHold;

// Players screen + name editor (built when opened, deleted when closed)
static lv_obj_t *playersLayer = nullptr;
static lv_obj_t *editLayer = nullptr;
static lv_obj_t *slot[NAME_LEN], *lblSlot[NAME_LEN];
static lv_obj_t *slotRow = nullptr;

// On lv_layer_top(), above every screen
static lv_obj_t *toast, *lblToast, *btnUndo;
static lv_obj_t *holdLayer, *arcTrack, *arcProgress, *arcSpinner, *lblCountdown, *lblHoldHint;

// Layout (410 x 502)
static const int32_t AREA_X = 20, AREA_Y = 84, AREA_W = 370, AREA_H = 330, TILE_GAP = 10;
static const int32_t TILE_RADIUS = 22;
static const int32_t SMALL_TILE_H = 130;   // below this height, names drop to 22 px
static const int32_t SMALL_TILE_W = 300;   // below this width too, so LEAD fits beside the name

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

static lv_obj_t *makeLabel(lv_obj_t *parent, const lv_font_t *font, int32_t letterSpace, const char *text) {
    lv_obj_t *l = lv_label_create(parent);
    lv_obj_set_style_text_font(l, font, 0);
    lv_obj_set_style_text_letter_space(l, letterSpace, 0);
    lv_label_set_text(l, text);
    return l;
}

static void setLed(uint32_t rgb) {
    pixel.setPixelColor(0, pixel.Color((rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF));
    pixel.show();
}

static lv_point_t pt(int32_t x, int32_t y) { lv_point_t p = {x, y}; return p; }
static lv_point_t screenCenter() { return pt(LCD_WIDTH / 2, LCD_HEIGHT / 2); }
static lv_point_t bottomEdge()   { return pt(LCD_WIDTH / 2, LCD_HEIGHT - 1); }

static lv_point_t centerOf(lv_obj_t *o) {
    lv_area_t a;
    lv_obj_get_coords(o, &a);
    return pt((a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2);
}

static lv_point_t touchPoint() {
    lv_point_t p = screenCenter();
    lv_indev_t *indev = lv_indev_active();
    if (indev) lv_indev_get_point(indev, &p);
    return p;
}

static bool busy() { return holdSource != HOLD_NONE; }

static void scheduleSave() {
    savePending = true;
    saveDue = millis() + SAVE_DELAY_MS;
}

static int8_t leader() {
    int8_t best = -1;
    uint16_t top = 0;
    bool tie = false;
    for (uint8_t i = 0; i < game.n; i++) {
        uint16_t s = game.p[i].score;
        if (s > top) { top = s; best = i; tie = false; }
        else if (s == top && s > 0) tie = true;
    }
    return tie ? -1 : best;
}

static uint8_t nextFreeColour() {
    for (uint8_t k = 0; k < BLOCK_COUNT; k++) {
        uint8_t c = COLOUR_ORDER[k];
        bool used = false;
        for (uint8_t i = 0; i < game.n; i++) if (game.p[i].colour == c) used = true;
        if (!used) return c;
    }
    return 0;
}

static bool nameInUse(const char *name, int8_t except) {
    for (uint8_t i = 0; i < game.n; i++)
        if (i != except && strcmp(game.p[i].name, name) == 0) return true;
    return false;
}

static void defaultGame() {
    memset(&game, 0, sizeof(game));
    game.n = 2;
    for (uint8_t i = 0; i < 2; i++) {
        strncpy(game.p[i].name, DEFAULT_NAMES[i], NAME_LEN);
        game.p[i].colour = COLOUR_ORDER[i];
    }
}

static bool gameValid(const Game &g) {
    if (g.n < 1 || g.n > MAX_PLAYERS || g.sel >= g.n) return false;
    for (uint8_t i = 0; i < g.n; i++) {
        const Player &p = g.p[i];
        if (p.score > MAX_SCORE || p.colour >= BLOCK_COUNT || p.name[NAME_LEN] != 0) return false;
        size_t len = strlen(p.name);
        if (len < 1 || len > NAME_LEN) return false;
        for (size_t k = 0; k < len; k++) if (p.name[k] < 'A' || p.name[k] > 'Z') return false;
    }
    return true;
}

static void loadGame() {
    if (prefs.getUChar("ver", 0) == SAVE_VERSION &&
        prefs.getBytesLength("game") == sizeof(Game)) {
        Game g;
        prefs.getBytes("game", &g, sizeof(Game));
        if (gameValid(g)) { game = g; return; }
    }
    defaultGame();
}

static void saveGame() {
    prefs.putUChar("ver", SAVE_VERSION);
    prefs.putBytes("game", &game, sizeof(Game));
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

static void bounce(lv_obj_t *obj, int32_t from) {
    if (!obj) return;
    lv_anim_delete(obj, anim_translate_y);
    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, obj);
    lv_anim_set_exec_cb(&a, anim_translate_y);
    lv_anim_set_values(&a, from, 0);
    lv_anim_set_duration(&a, 220);
    lv_anim_set_path_cb(&a, lv_anim_path_overshoot);
    lv_anim_start(&a);
}

static void nope(lv_obj_t *obj) {
    if (!obj) return;
    lv_anim_delete(obj, anim_shake);
    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, obj);
    lv_anim_set_exec_cb(&a, anim_shake);
    lv_anim_set_values(&a, 0, 1000);
    lv_anim_set_duration(&a, 350);
    lv_anim_start(&a);
}

// Ripple: a lighter block grows from the tap point inside a player's block and
// fades. It is clamped to the block so its rounded corners match the block's.
static void anim_ripple(void *obj, int32_t v) {
    lv_obj_t *o = (lv_obj_t *)obj;
    lv_obj_t *parent = lv_obj_get_parent(o);
    uint32_t ud = (uint32_t)(uintptr_t)lv_obj_get_user_data(o);
    int32_t cx = (int32_t)(ud >> 16), cy = (int32_t)(ud & 0xFFFF);
    int32_t w = lv_obj_get_width(parent), h = lv_obj_get_height(parent);
    int32_t reach = max(max(cx, w - cx), max(cy, h - cy)) + 4;
    int32_t r = 24 + ((reach - 24) * v) / 1000;
    int32_t x1 = max((int32_t)0, cx - r), y1 = max((int32_t)0, cy - r);
    int32_t x2 = min(w, cx + r), y2 = min(h, cy + r);
    lv_obj_set_pos(o, x1, y1);
    lv_obj_set_size(o, x2 - x1, y2 - y1);
    lv_obj_set_style_bg_opa(o, (lv_opa_t)((LV_OPA_40 * (1000 - v)) / 1000), 0);
}

static void ripple_done(lv_anim_t *a) {
    lv_obj_delete((lv_obj_t *)a->var);
}

static void ripple(uint8_t i, lv_point_t screenPt) {
    lv_area_t c;
    lv_obj_get_coords(tile[i], &c);
    int32_t w = lv_area_get_width(&c), h = lv_area_get_height(&c);
    int32_t cx = constrain(screenPt.x - c.x1, (int32_t)0, w);
    int32_t cy = constrain(screenPt.y - c.y1, (int32_t)0, h);

    lv_obj_t *o = plainObj(tile[i]);
    lv_obj_add_flag(o, LV_OBJ_FLAG_IGNORE_LAYOUT);
    lv_obj_set_style_radius(o, TILE_RADIUS, 0);
    lv_obj_set_style_bg_color(o, fgOf(game.p[i].colour), 0);
    lv_obj_set_user_data(o, (void *)(uintptr_t)(((uint32_t)cx << 16) | (uint32_t)cy));
    lv_obj_move_to_index(o, 0);  // behind the name and score
    anim_ripple(o, 0);

    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, o);
    lv_anim_set_exec_cb(&a, anim_ripple);
    lv_anim_set_values(&a, 0, 1000);
    lv_anim_set_duration(&a, RIPPLE_MS);
    lv_anim_set_path_cb(&a, lv_anim_path_ease_out);
    lv_anim_set_completed_cb(&a, ripple_done);
    lv_anim_start(&a);
}

// -----------------------------------------------------------------------------
// Paint: everything that follows the selected player's colour, plus the LED
// -----------------------------------------------------------------------------
static void paint() {
    uint8_t c = game.p[game.sel].colour;
    lv_color_t bg = bgOf(c), fg = fgOf(c);

    lv_obj_set_style_bg_color(scr, bg, 0);
    lv_obj_set_style_text_color(lblBrand, fg, 0);
    lv_obj_set_style_border_color(pillPlayers, fg, 0);
    lv_obj_set_style_text_color(lblPillPlayers, fg, 0);
    lv_obj_set_style_bg_color(chipTap, fg, 0);
    lv_obj_set_style_bg_color(chipHold, fg, 0);
    lv_obj_set_style_text_color(lblChipTap, fg, 0);
    lv_obj_set_style_text_color(lblChipHold, fg, 0);
    for (uint8_t i = 0; i < game.n; i++)
        if (tile[i]) lv_obj_set_style_border_color(tile[i], fg, 0);

    setLed(BLOCKS[c].bg);
}

// Background wipe: a block of the selected player's colour grows from a point
static void finishFlood() {
    if (!flood) return;
    lv_anim_delete(flood, nullptr);
    lv_obj_delete(flood);
    flood = nullptr;
    paint();
}

static void anim_flood(void *obj, int32_t v) {
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

// Call after game.sel has changed
static void floodFrom(lv_point_t at) {
    finishFlood();
    lv_color_t target = bgOf(game.p[game.sel].colour);
    if (lv_color_eq(lv_obj_get_style_bg_color(scr, LV_PART_MAIN), target)) { paint(); return; }

    floodCenter = at;
    int32_t dx = max((int32_t)at.x, (int32_t)LCD_WIDTH - at.x);
    int32_t dy = max((int32_t)at.y, (int32_t)LCD_HEIGHT - at.y);
    floodMaxW = dx * 2 + 4;
    floodMaxH = dy * 2 + 4;

    flood = plainObj(scr);
    lv_obj_set_style_bg_opa(flood, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(flood, target, 0);
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
// Scoreboard tiles
// -----------------------------------------------------------------------------
static bool smallTiles() { return tileH < SMALL_TILE_H || tileW < SMALL_TILE_W; }

static int32_t textWidth(const char *s, const lv_font_t *f) {
    int32_t w = 0;
    for (const char *c = s; *c; c++) w += lv_font_get_glyph_width(f, (uint32_t)*c, (uint32_t)c[1]);
    return w;
}

// Largest score font whose digits fit in the space under the name
static const lv_font_t *scoreFont(const char *txt, int32_t w, int32_t h, int32_t nameBand) {
    static const lv_font_t *const FONTS[] = {&Points_260, &Points_180, &Points_124, &Points_84, &Points_64};
    int32_t availH = h - nameBand - 10;
    for (const lv_font_t *f : FONTS) {
        int32_t visH = f->line_height - f->base_line;
        if (visH <= availH && textWidth(txt, f) <= w - 28) return f;
    }
    return &Points_64;
}

static void updateTile(uint8_t i) {
    if (!tile[i]) return;
    char txt[8];
    snprintf(txt, sizeof(txt), "%u", (unsigned)game.p[i].score);
    int32_t w = tileWidth[i], h = tileH;
    int32_t nameBand = smallTiles() ? 10 + Points_22.line_height : 12 + Points_40.line_height;
    const lv_font_t *f = scoreFont(txt, w, h, nameBand);
    int32_t visH = f->line_height - f->base_line;
    int32_t availH = h - nameBand - 10;
    lv_obj_set_style_text_font(lblScore[i], f, 0);
    lv_label_set_text(lblScore[i], txt);
    lv_obj_align(lblScore[i], LV_ALIGN_TOP_MID, 0, nameBand + max((int32_t)0, (availH - visH) / 2));
}

static void updateLead() {
    int8_t lead = leader();
    for (uint8_t i = 0; i < game.n; i++) {
        if (!chipLead[i]) continue;
        if (i == lead) lv_obj_remove_flag(chipLead[i], LV_OBJ_FLAG_HIDDEN);
        else lv_obj_add_flag(chipLead[i], LV_OBJ_FLAG_HIDDEN);
    }
}

static void tile_cb(lv_event_t *e);

static void rebuildBoard() {
    finishFlood();
    lv_obj_clean(tileArea);
    for (uint8_t i = 0; i < MAX_PLAYERS; i++) tile[i] = lblName[i] = lblScore[i] = chipLead[i] = lblLead[i] = nullptr;

    uint8_t n = game.n;
    uint8_t cols = n <= 2 ? 1 : 2;
    uint8_t rows = (n + cols - 1) / cols;
    tileW = (AREA_W - TILE_GAP * (cols - 1)) / cols;
    tileH = (AREA_H - TILE_GAP * (rows - 1)) / rows;
    bool small = smallTiles();

    for (uint8_t i = 0; i < n; i++) {
        uint8_t col = i % cols, row = i / cols;
        bool spans = (cols == 2 && i == n - 1 && n % 2 == 1);  // odd one out takes the full row
        int32_t w = spans ? AREA_W : tileW;
        tileWidth[i] = w;
        lv_color_t bg = bgOf(game.p[i].colour), fg = fgOf(game.p[i].colour);

        lv_obj_t *t = plainObj(tileArea);
        lv_obj_add_flag(t, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_set_pos(t, col * (tileW + TILE_GAP), row * (tileH + TILE_GAP));
        lv_obj_set_size(t, w, tileH);
        lv_obj_set_style_radius(t, TILE_RADIUS, 0);
        lv_obj_set_style_bg_opa(t, LV_OPA_COVER, 0);
        lv_obj_set_style_bg_color(t, bg, 0);
        lv_obj_set_style_border_width(t, 3, 0);
        lv_obj_set_style_text_color(t, fg, 0);
        lv_obj_add_event_cb(t, tile_cb, LV_EVENT_ALL, (void *)(uintptr_t)i);
        tile[i] = t;

        lblName[i] = makeLabel(t, small ? &Points_22 : &Points_40, small ? 3 : 4, game.p[i].name);
        lv_obj_align(lblName[i], LV_ALIGN_TOP_LEFT, small ? 14 : 16, small ? 10 : 12);

        lblScore[i] = lv_label_create(t);
        lv_obj_set_style_text_align(lblScore[i], LV_TEXT_ALIGN_CENTER, 0);

        chipLead[i] = plainObj(t);
        lv_obj_set_size(chipLead[i], LV_SIZE_CONTENT, LV_SIZE_CONTENT);
        lv_obj_set_style_radius(chipLead[i], LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_bg_opa(chipLead[i], LV_OPA_20, 0);
        lv_obj_set_style_bg_color(chipLead[i], fg, 0);
        lv_obj_set_style_pad_hor(chipLead[i], 12, 0);
        lv_obj_set_style_pad_ver(chipLead[i], small ? 2 : 6, 0);
        lblLead[i] = makeLabel(chipLead[i], &Points_22, 2, "LEAD");
        lv_obj_align(chipLead[i], LV_ALIGN_TOP_RIGHT, -12, small ? 8 : 12);

        updateTile(i);
    }
    updateLead();
    paint();
}

// -----------------------------------------------------------------------------
// Changes + undo history (every change snapshots the whole game)
// -----------------------------------------------------------------------------
static void pushHistory() {
    history[histHead] = game;
    histHead = (histHead + 1) % HISTORY_SIZE;
    if (histLen < HISTORY_SIZE) histLen++;
}

static bool popHistory(Game &out) {
    if (histLen == 0) return false;
    histHead = (histHead + HISTORY_SIZE - 1) % HISTORY_SIZE;
    histLen--;
    out = history[histHead];
    return true;
}

// Select player i; wipe the background from `at` if the colour changes
static void selectPlayer(uint8_t i, lv_point_t at) {
    if (i == game.sel) return;
    game.sel = i;
    floodFrom(at);
    scheduleSave();
}

static void addPoint(uint8_t i, lv_point_t at) {
    if (i >= game.n) return;
    if (game.p[i].score >= MAX_SCORE) { nope(lblScore[i]); return; }
    pushHistory();
    game.p[i].score++;
    updateTile(i);
    bounce(lblScore[i], 18);
    ripple(i, at);
    updateLead();
    selectPlayer(i, at);
    scheduleSave();
}

static void takePoint(uint8_t i, lv_point_t at) {
    if (i >= game.n) return;
    if (game.p[i].score == 0) { nope(lblScore[i]); return; }
    pushHistory();
    game.p[i].score--;
    updateTile(i);
    bounce(lblScore[i], -18);
    ripple(i, at);
    updateLead();
    selectPlayer(i, at);
    scheduleSave();
}

static void hideToast();
static void openPlayers();

static bool sameRoster(const Game &a, const Game &b) {
    if (a.n != b.n) return false;
    for (uint8_t i = 0; i < a.n; i++)
        if (strcmp(a.p[i].name, b.p[i].name) != 0 || a.p[i].colour != b.p[i].colour) return false;
    return true;
}

static void undo(lv_point_t at) {
    if (mode == MODE_EDIT) return;
    Game prev;
    if (!popHistory(prev)) {
        nope(mode == MODE_BOARD ? tileArea : playersLayer);
        return;
    }
    hideToast();
    Game was = game;
    game = prev;

    if (sameRoster(was, game)) {
        for (uint8_t i = 0; i < game.n; i++) {
            if (game.p[i].score == was.p[i].score) continue;
            updateTile(i);
            bounce(lblScore[i], game.p[i].score > was.p[i].score ? 18 : -18);
        }
        updateLead();
    } else {
        rebuildBoard();
    }
    if (game.sel != was.sel) floodFrom(at);
    if (mode == MODE_PLAYERS) openPlayers();  // refresh the list
    scheduleSave();
}

// -----------------------------------------------------------------------------
// Undo toast (after a reset or a removal)
// -----------------------------------------------------------------------------
static void showToast(const char *text) {
    lv_label_set_text(lblToast, text);
    lv_obj_remove_flag(toast, LV_OBJ_FLAG_HIDDEN);
    undoHideAt = millis() + UNDO_SHOW_MS;
}

static void hideToast() {
    lv_obj_add_flag(toast, LV_OBJ_FLAG_HIDDEN);
    undoHideAt = 0;
}

static void undo_cb(lv_event_t *e) {
    (void)e;
    if (busy()) return;
    undo(centerOf(btnUndo));
}

// -----------------------------------------------------------------------------
// Hold dial (reset scores / remove a player) from a touch pill or D-pad UP
// -----------------------------------------------------------------------------
static bool anyScore() {
    for (uint8_t i = 0; i < game.n; i++) if (game.p[i].score) return true;
    return false;
}

static void startHold(HoldSource src, HoldAction act, lv_obj_t *nopeTarget) {
    if (holdSource != HOLD_NONE) return;
    if (act == ACT_RESET && !anyScore()) { nope(nopeTarget); return; }
    holdSource = src;
    holdAction = act;
    holdStart = millis();
    uint8_t c = act == ACT_REMOVE ? editColour : game.p[game.sel].colour;
    lv_obj_set_style_arc_color(arcProgress, bgOf(c), LV_PART_INDICATOR);
    lv_arc_set_value(arcProgress, 0);
    lv_label_set_text(lblCountdown, "3");
    lv_label_set_text(lblHoldHint, act == ACT_REMOVE ? "KEEP HOLDING TO REMOVE\nLET GO TO CANCEL"
                                                     : "KEEP HOLDING TO RESET\nLET GO TO CANCEL");
    lv_obj_remove_flag(holdLayer, LV_OBJ_FLAG_HIDDEN);
}

static void endHold(HoldSource src) {
    if (holdSource != src) return;
    holdSource = HOLD_NONE;
    lv_obj_add_flag(holdLayer, LV_OBJ_FLAG_HIDDEN);
}

static void resetScores() {
    pushHistory();
    for (uint8_t i = 0; i < game.n; i++) game.p[i].score = 0;
    for (uint8_t i = 0; i < game.n; i++) { updateTile(i); bounce(lblScore[i], -18); }
    updateLead();
    if (mode == MODE_PLAYERS) openPlayers();
    scheduleSave();
    showToast("SCORES RESET");
}

static void closeEditor();

static void removePlayer(int8_t i) {
    if (i < 0 || i >= game.n || game.n <= 1) return;
    char msg[24];
    snprintf(msg, sizeof(msg), "REMOVED %s", game.p[i].name);
    pushHistory();
    for (uint8_t k = i; k + 1 < game.n; k++) game.p[k] = game.p[k + 1];
    game.n--;
    memset(&game.p[game.n], 0, sizeof(Player));
    if (game.sel > i || game.sel >= game.n) game.sel = game.sel > 0 ? game.sel - 1 : 0;
    rebuildBoard();
    scheduleSave();
    closeEditor();
    showToast(msg);
}

static void updateHold() {
    if (holdSource == HOLD_NONE) return;
    uint32_t elapsed = millis() - holdStart;

    if (elapsed >= HOLD_MS) {
        HoldAction act = holdAction;
        endHold(holdSource);
        if (act == ACT_RESET) resetScores();
        else removePlayer(editIndex);
        return;
    }

    // Progress ring fills over the hold; spinner orbits continuously
    lv_arc_set_value(arcProgress, (int32_t)((elapsed * 1000) / HOLD_MS));
    int32_t spin = (int32_t)((elapsed * 360 / 700) % 360);  // one turn every 0.7 s
    lv_arc_set_angles(arcSpinner, spin, spin + 50);

    uint32_t secsLeft = (HOLD_MS - elapsed + 999) / 1000;
    lv_label_set_text_fmt(lblCountdown, "%lu", (unsigned long)secsLeft);
}

static void holdPill_cb(lv_event_t *e) {
    lv_event_code_t code = lv_event_get_code(e);
    HoldAction act = (HoldAction)(uintptr_t)lv_event_get_user_data(e);
    if (code == LV_EVENT_PRESSED) {
        startHold(HOLD_TOUCH, act, (lv_obj_t *)lv_event_get_target(e));
    } else if (code == LV_EVENT_RELEASED || code == LV_EVENT_PRESS_LOST) {
        endHold(HOLD_TOUCH);
    }
}

// -----------------------------------------------------------------------------
// Scoreboard touch: tap a block for +1, hold it for -1
// -----------------------------------------------------------------------------
static void tile_cb(lv_event_t *e) {
    lv_event_code_t code = lv_event_get_code(e);
    uint8_t i = (uint8_t)(uintptr_t)lv_event_get_user_data(e);
    if (busy() || mode != MODE_BOARD) return;
    if (code == LV_EVENT_SHORT_CLICKED) addPoint(i, touchPoint());
    else if (code == LV_EVENT_LONG_PRESSED) takePoint(i, touchPoint());
}

// -----------------------------------------------------------------------------
// Shared building blocks for the Ink screens
// -----------------------------------------------------------------------------
static lv_obj_t *inkLayer() {
    lv_obj_t *l = plainObj(scr);
    lv_obj_add_flag(l, LV_OBJ_FLAG_CLICKABLE);  // swallow taps so the board underneath stays put
    lv_obj_set_size(l, LCD_WIDTH, LCD_HEIGHT);
    lv_obj_set_style_bg_opa(l, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(l, lv_color_hex(INK), 0);
    lv_obj_set_style_text_color(l, lv_color_hex(PAPER), 0);
    return l;
}

// Outlined pill: 3 px border, fully rounded, 48 px tall
static lv_obj_t *makePill(lv_obj_t *parent, const char *text, lv_color_t colour) {
    lv_obj_t *p = plainObj(parent);
    lv_obj_add_flag(p, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(p, LV_SIZE_CONTENT, 48);
    lv_obj_set_style_radius(p, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_border_width(p, 3, 0);
    lv_obj_set_style_border_color(p, colour, 0);
    lv_obj_set_style_pad_hor(p, 22, 0);
    lv_obj_set_ext_click_area(p, 10);
    lv_obj_t *l = makeLabel(p, &Points_22, 1, text);
    lv_obj_set_style_text_color(l, colour, 0);
    lv_obj_center(l);
    return p;
}

static lv_obj_t *makeChip(lv_obj_t *parent, const char *text, lv_obj_t **labelOut) {
    lv_obj_t *chip = plainObj(parent);
    lv_obj_set_size(chip, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_style_radius(chip, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_opa(chip, LV_OPA_20, 0);
    lv_obj_set_style_pad_hor(chip, 16, 0);
    lv_obj_set_style_pad_ver(chip, 10, 0);
    lv_obj_t *l = makeLabel(chip, &Points_22, 2, text);
    if (labelOut) *labelOut = l;
    return chip;
}

static void deleteLayer(lv_obj_t *&layer) {
    if (!layer) return;
    lv_obj_delete_async(layer);  // safe from inside the layer's own event callbacks
    layer = nullptr;
}

// -----------------------------------------------------------------------------
// Players screen: list, add, edit, reset
// -----------------------------------------------------------------------------
static void openEditor(int8_t i);

static void closePlayers() {
    deleteLayer(playersLayer);
    mode = MODE_BOARD;
}

static void players_done_cb(lv_event_t *e) {
    (void)e;
    if (busy()) return;
    closePlayers();
}

static void players_row_cb(lv_event_t *e) {
    if (busy()) return;
    openEditor((int8_t)(intptr_t)lv_event_get_user_data(e));
}

static void openPlayers() {
    deleteLayer(playersLayer);
    mode = MODE_PLAYERS;
    playersLayer = inkLayer();
    lv_color_t paper = lv_color_hex(PAPER);

    lv_obj_t *title = makeLabel(playersLayer, &Points_22, 4, "PLAYERS");
    lv_obj_align(title, LV_ALIGN_TOP_LEFT, 26, 34);
    lv_obj_t *done = makePill(playersLayer, "DONE", paper);
    lv_obj_align(done, LV_ALIGN_TOP_RIGHT, -20, 22);
    lv_obj_add_event_cb(done, players_done_cb, LV_EVENT_CLICKED, nullptr);

    // One row per player, plus an ADD row while there's room
    const int32_t rowH = 42, rowGap = 8, top = 90;
    for (uint8_t i = 0; i <= game.n && i < MAX_PLAYERS + 1; i++) {
        bool add = (i == game.n);
        if (add && game.n >= MAX_PLAYERS) break;

        lv_obj_t *row = plainObj(playersLayer);
        lv_obj_add_flag(row, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_set_size(row, AREA_W, rowH);
        lv_obj_set_pos(row, AREA_X, top + i * (rowH + rowGap));
        lv_obj_set_style_radius(row, 14, 0);
        lv_obj_add_event_cb(row, players_row_cb, LV_EVENT_CLICKED, (void *)(intptr_t)(add ? -1 : i));

        if (add) {
            lv_obj_set_style_border_width(row, 3, 0);
            lv_obj_set_style_border_color(row, paper, 0);
            lv_obj_set_style_border_opa(row, LV_OPA_40, 0);
            lv_obj_t *l = makeLabel(row, &Points_22, 2, "+ ADD PLAYER");
            lv_obj_center(l);
        } else {
            uint8_t c = game.p[i].colour;
            lv_obj_set_style_bg_opa(row, LV_OPA_COVER, 0);
            lv_obj_set_style_bg_color(row, bgOf(c), 0);
            lv_obj_set_style_text_color(row, fgOf(c), 0);
            lv_obj_t *name = makeLabel(row, &Points_22, 3, game.p[i].name);
            lv_obj_align(name, LV_ALIGN_LEFT_MID, 16, 0);
            lv_obj_t *score = makeLabel(row, &Points_22, 1, "");
            lv_label_set_text_fmt(score, "%u", (unsigned)game.p[i].score);
            lv_obj_align(score, LV_ALIGN_RIGHT_MID, -16, 0);
        }
    }

    // Footer: tap a row to rename it, or hold to wipe every score
    lv_obj_t *reset = makePill(playersLayer, "HOLD TO RESET SCORES", paper);
    lv_obj_align(reset, LV_ALIGN_BOTTOM_MID, 0, -30);
    lv_obj_add_event_cb(reset, holdPill_cb, LV_EVENT_ALL, (void *)(uintptr_t)ACT_RESET);

    lv_obj_move_foreground(playersLayer);
}

// -----------------------------------------------------------------------------
// Name editor: three letter slots + an A-Z keyboard
// -----------------------------------------------------------------------------
static void refreshSlots() {
    if (!editLayer) return;
    lv_color_t paper = lv_color_hex(PAPER);
    for (uint8_t k = 0; k < NAME_LEN; k++) {
        bool filled = k < editLen;
        bool active = k == editLen;
        lv_obj_set_style_bg_opa(slot[k], filled ? LV_OPA_COVER : (active ? LV_OPA_10 : LV_OPA_TRANSP), 0);
        lv_obj_set_style_bg_color(slot[k], filled ? bgOf(editColour) : paper, 0);
        lv_obj_set_style_border_color(slot[k], paper, 0);
        lv_obj_set_style_border_opa(slot[k], filled ? LV_OPA_TRANSP : (active ? LV_OPA_COVER : LV_OPA_40), 0);
        lv_obj_set_style_text_color(lblSlot[k], filled ? fgOf(editColour) : paper, 0);
        char s[2] = {filled ? editBuf[k] : 0, 0};
        lv_label_set_text(lblSlot[k], s);
    }
}

static void closeEditor() {
    if (!editLayer) return;
    deleteLayer(editLayer);
    openPlayers();
}

static void edit_done_cb(lv_event_t *e) {
    (void)e;
    if (busy()) return;
    editBuf[editLen] = 0;
    if (editLen > 0) {
        if (editIndex < 0) {
            if (game.n < MAX_PLAYERS) {
                pushHistory();
                Player &p = game.p[game.n];
                memset(&p, 0, sizeof(p));
                strncpy(p.name, editBuf, NAME_LEN);
                p.colour = editColour;
                game.n++;
                rebuildBoard();
                scheduleSave();
            }
        } else if (strcmp(game.p[editIndex].name, editBuf) != 0) {
            pushHistory();
            memset(game.p[editIndex].name, 0, sizeof(game.p[editIndex].name));
            strncpy(game.p[editIndex].name, editBuf, NAME_LEN);
            rebuildBoard();
            scheduleSave();
        }
    }
    closeEditor();
}

static void key_cb(lv_event_t *e) {
    if (busy()) return;
    char ch = (char)(intptr_t)lv_event_get_user_data(e);
    if (ch == 0) {                       // DEL
        if (editLen == 0) { nope(slotRow); return; }
        editBuf[--editLen] = 0;
    } else {
        if (editLen >= NAME_LEN) { nope(slotRow); return; }
        editBuf[editLen++] = ch;
        editBuf[editLen] = 0;
        bounce(slot[editLen - 1], 12);
    }
    refreshSlots();
}

static void suggest_cb(lv_event_t *e) {
    if (busy()) return;
    const char *name = (const char *)lv_event_get_user_data(e);
    memset(editBuf, 0, sizeof(editBuf));
    strncpy(editBuf, name, NAME_LEN);
    editLen = strlen(editBuf);
    refreshSlots();
    for (uint8_t k = 0; k < editLen; k++) bounce(slot[k], 12);
}

static void openEditor(int8_t i) {
    if (i >= 0 && i >= game.n) return;
    if (i < 0 && game.n >= MAX_PLAYERS) return;
    editIndex = i;
    memset(editBuf, 0, sizeof(editBuf));
    if (i >= 0) {
        strncpy(editBuf, game.p[i].name, NAME_LEN);
        editColour = game.p[i].colour;
    } else {
        editColour = nextFreeColour();
    }
    editLen = strlen(editBuf);

    deleteLayer(editLayer);
    mode = MODE_EDIT;
    editLayer = inkLayer();
    lv_color_t paper = lv_color_hex(PAPER);

    lv_obj_t *title = makeLabel(editLayer, &Points_22, 4, i < 0 ? "NEW PLAYER" : "NICKNAME");
    lv_obj_align(title, LV_ALIGN_TOP_LEFT, 26, 34);
    lv_obj_t *done = makePill(editLayer, "DONE", paper);
    lv_obj_align(done, LV_ALIGN_TOP_RIGHT, -20, 22);
    lv_obj_add_event_cb(done, edit_done_cb, LV_EVENT_CLICKED, nullptr);

    // Three letter slots
    slotRow = plainObj(editLayer);
    lv_obj_set_size(slotRow, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(slotRow, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_pad_column(slotRow, 14, 0);
    lv_obj_align(slotRow, LV_ALIGN_TOP_MID, 0, 86);
    for (uint8_t k = 0; k < NAME_LEN; k++) {
        slot[k] = plainObj(slotRow);
        lv_obj_set_size(slot[k], 96, 106);
        lv_obj_set_style_radius(slot[k], 16, 0);
        lv_obj_set_style_border_width(slot[k], 3, 0);
        lblSlot[k] = makeLabel(slot[k], &Points_84, 0, "");
        lv_obj_align(lblSlot[k], LV_ALIGN_CENTER, 0, Points_84.base_line / 2);
    }

    // Middle row: remove (existing player) or quick picks (new player)
    lv_obj_t *mid = plainObj(editLayer);
    lv_obj_set_size(mid, LV_PCT(100), 48);
    lv_obj_set_flex_flow(mid, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(mid, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(mid, 12, 0);
    lv_obj_align(mid, LV_ALIGN_TOP_MID, 0, 202);
    if (i >= 0) {
        if (game.n > 1) {
            lv_obj_t *rm = makePill(mid, "HOLD TO REMOVE", paper);
            lv_obj_add_event_cb(rm, holdPill_cb, LV_EVENT_ALL, (void *)(uintptr_t)ACT_REMOVE);
        }
    } else {
        for (const char *name : DEFAULT_NAMES) {
            if (nameInUse(name, -1)) continue;
            lv_obj_t *chip = makeChip(mid, name, nullptr);
            lv_obj_set_style_bg_color(chip, paper, 0);
            lv_obj_add_flag(chip, LV_OBJ_FLAG_CLICKABLE);
            lv_obj_set_ext_click_area(chip, 6);
            lv_obj_add_event_cb(chip, suggest_cb, LV_EVENT_CLICKED, (void *)name);
        }
    }

    // Keyboard: A-Z + DEL, 7 x 4
    const int32_t keyW = 48, keyH = 50, gap = 6, cols = 7;
    const int32_t kbW = cols * keyW + (cols - 1) * gap;
    const int32_t kbX = (LCD_WIDTH - kbW) / 2, kbY = 262;
    for (int k = 0; k < 27; k++) {
        lv_obj_t *key = plainObj(editLayer);
        lv_obj_add_flag(key, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_set_size(key, k < 26 ? keyW : keyW * 2 + gap, keyH);
        lv_obj_set_pos(key, kbX + (k % cols) * (keyW + gap), kbY + (k / cols) * (keyH + gap));
        lv_obj_set_style_radius(key, 12, 0);
        lv_obj_set_style_bg_opa(key, LV_OPA_20, 0);
        lv_obj_set_style_bg_color(key, paper, 0);
        lv_obj_set_style_bg_opa(key, LV_OPA_50, LV_STATE_PRESSED);
        char txt[2] = {(char)('A' + k), 0};
        lv_obj_t *l = makeLabel(key, k < 26 ? &Points_40 : &Points_22, k < 26 ? 0 : 2, k < 26 ? txt : "DEL");
        lv_obj_center(l);
        lv_obj_add_event_cb(key, key_cb, LV_EVENT_CLICKED, (void *)(intptr_t)(k < 26 ? 'A' + k : 0));
    }

    refreshSlots();
    lv_obj_move_foreground(editLayer);
}

// -----------------------------------------------------------------------------
// Board header
// -----------------------------------------------------------------------------
static void players_pill_cb(lv_event_t *e) {
    (void)e;
    if (busy() || mode != MODE_BOARD) return;
    openPlayers();
}

// -----------------------------------------------------------------------------
// Physical buttons
// -----------------------------------------------------------------------------
static void pollButtons() {
    uint32_t now = millis();
    if (now - lastButtonPoll < BUTTON_POLL_MS) return;
    lastButtonPoll = now;

    // Top button: +1 for the selected player, for every press the interrupt counted
    uint32_t presses = topPresses;
    while (topHandled != presses) {
        topHandled++;
        if (!busy() && mode == MODE_BOARD) {
            uint8_t s = game.sel;
            lv_area_t c;
            lv_obj_get_coords(tile[s], &c);
            addPoint(s, pt((c.x1 + c.x2) / 2, c.y1));
        }
    }

    if (!ioexpOk) return;

    // Expander buttons (active LOW). One 16-bit read covers both ports.
    uint16_t bits = ioexp.read16();
    if (ioexp.lastError() != TCA9555_OK) return;  // skip this poll on a bad read
    bool bottomNow = ((bits >> EXPANDER_BUTTON_BOTTOM) & 1) == 0;
    bool padUpNow  = ((bits >> EXPANDER_PAD_TOP) & 1) == 0;
    bool leftNow   = ((bits >> EXPANDER_PAD_LEFT) & 1) == 0;
    bool rightNow  = ((bits >> EXPANDER_PAD_RIGHT) & 1) == 0;

    // Bottom button: press twice quickly to undo
    if (btnBottom.update(bottomNow, now) == 1) {
        if (bottomArmed && now - bottomFirstPress <= DOUBLE_PRESS_MS) {
            bottomArmed = false;
            if (!busy()) undo(bottomEdge());
        } else {
            bottomArmed = true;
            bottomFirstPress = now;
        }
    }
    if (bottomArmed && now - bottomFirstPress > DOUBLE_PRESS_MS) bottomArmed = false;

    // D-pad LEFT / RIGHT: choose who the top button scores for
    int step = 0;
    if (btnPadLeft.update(leftNow, now) == 1)   step = -1;
    if (btnPadRight.update(rightNow, now) == 1) step = +1;
    if (step && !busy() && mode == MODE_BOARD && game.n > 1) {
        uint8_t s = (game.sel + game.n + step) % game.n;
        selectPlayer(s, centerOf(tile[s]));
        bounce(lblName[s], step > 0 ? 12 : -12);
    }

    // D-pad UP: hold to reset all scores
    int padEdge = btnPadUp.update(padUpNow, now);
    if (padEdge == 1 && mode == MODE_BOARD) startHold(HOLD_PAD, ACT_RESET, tileArea);
    if (padEdge == -1) endHold(HOLD_PAD);
}

// Runs every 10 ms inside LVGL
static void tick_cb(lv_timer_t *t) {
    (void)t;
    pollButtons();
    updateHold();
    if (undoHideAt && (int32_t)(millis() - undoHideAt) >= 0) hideToast();
    if (savePending && (int32_t)(millis() - saveDue) >= 0) {
        savePending = false;
        saveGame();
    }
}

// -----------------------------------------------------------------------------
// UI construction
// -----------------------------------------------------------------------------
static lv_obj_t *makeRing(lv_obj_t *parent, int32_t size, int32_t width) {
    lv_obj_t *arc = lv_arc_create(parent);
    lv_obj_remove_style_all(arc);
    lv_obj_remove_flag(arc, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(arc, size, size);
    lv_arc_set_rotation(arc, 270);           // start at 12 o'clock
    lv_arc_set_bg_angles(arc, 0, 360);
    lv_obj_set_style_arc_width(arc, width, LV_PART_MAIN);
    lv_obj_set_style_arc_width(arc, width, LV_PART_INDICATOR);
    lv_obj_set_style_arc_rounded(arc, true, LV_PART_INDICATOR);
    lv_obj_set_style_arc_opa(arc, LV_OPA_TRANSP, LV_PART_MAIN);
    lv_obj_set_style_arc_opa(arc, LV_OPA_COVER, LV_PART_INDICATOR);
    lv_obj_align(arc, LV_ALIGN_CENTER, 0, -20);
    return arc;
}

static void buildHoldLayer(lv_obj_t *parent) {
    holdLayer = plainObj(parent);
    lv_obj_set_size(holdLayer, LCD_WIDTH, LCD_HEIGHT);
    lv_obj_set_style_bg_opa(holdLayer, LV_OPA_90, 0);
    lv_obj_set_style_bg_color(holdLayer, lv_color_hex(INK), 0);

    // Faint full track
    arcTrack = makeRing(holdLayer, 240, 18);
    lv_arc_set_range(arcTrack, 0, 1);
    lv_arc_set_value(arcTrack, 1);
    lv_obj_set_style_arc_color(arcTrack, lv_color_hex(PAPER), LV_PART_INDICATOR);
    lv_obj_set_style_arc_opa(arcTrack, LV_OPA_20, LV_PART_INDICATOR);

    // Progress fill (in the relevant block colour)
    arcProgress = makeRing(holdLayer, 240, 18);
    lv_arc_set_range(arcProgress, 0, 1000);
    lv_arc_set_value(arcProgress, 0);

    // Spinner orbiting outside the ring
    arcSpinner = makeRing(holdLayer, 284, 6);
    lv_arc_set_rotation(arcSpinner, 0);
    lv_obj_set_style_arc_color(arcSpinner, lv_color_hex(PAPER), LV_PART_INDICATOR);
    lv_arc_set_angles(arcSpinner, 0, 50);

    lblCountdown = makeLabel(holdLayer, &Points_124, 0, "3");
    lv_obj_set_style_text_color(lblCountdown, lv_color_hex(PAPER), 0);
    lv_obj_align(lblCountdown, LV_ALIGN_CENTER, 0, -20);

    lblHoldHint = makeLabel(holdLayer, &Points_22, 2, "");
    lv_obj_set_style_text_color(lblHoldHint, lv_color_hex(PAPER), 0);
    lv_obj_set_style_text_align(lblHoldHint, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_line_space(lblHoldHint, 8, 0);
    lv_obj_align(lblHoldHint, LV_ALIGN_BOTTOM_MID, 0, -40);

    lv_obj_add_flag(holdLayer, LV_OBJ_FLAG_HIDDEN);
}

static void buildToast(lv_obj_t *parent) {
    toast = plainObj(parent);
    lv_obj_add_flag(toast, LV_OBJ_FLAG_CLICKABLE);  // swallow taps on the toast
    lv_obj_set_size(toast, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(toast, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(toast, lv_color_hex(INK), 0);
    lv_obj_set_style_border_width(toast, 2, 0);       // keeps it visible over the Ink screens
    lv_obj_set_style_border_color(toast, lv_color_hex(PAPER), 0);
    lv_obj_set_style_border_opa(toast, LV_OPA_20, 0);
    lv_obj_set_style_radius(toast, 16, 0);
    lv_obj_set_style_pad_left(toast, 18, 0);
    lv_obj_set_style_pad_right(toast, 8, 0);
    lv_obj_set_style_pad_ver(toast, 8, 0);
    lv_obj_set_style_pad_column(toast, 16, 0);
    lv_obj_set_flex_flow(toast, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(toast, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_align(toast, LV_ALIGN_BOTTOM_MID, 0, -96);

    lblToast = makeLabel(toast, &Points_22, 0, "");
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
    lv_obj_t *lblUndo = makeLabel(btnUndo, &Points_22, 0, "UNDO");
    lv_obj_set_style_text_color(lblUndo, lv_color_hex(INK), 0);
    lv_obj_add_flag(toast, LV_OBJ_FLAG_HIDDEN);
}

static void buildUi() {
    scr = lv_screen_active();
    lv_obj_remove_style_all(scr);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
    lv_obj_remove_flag(scr, LV_OBJ_FLAG_SCROLLABLE);

    // Header: brand (left)
    lblBrand = makeLabel(scr, &Points_22, 4, "POINTS");
    lv_obj_align(lblBrand, LV_ALIGN_TOP_LEFT, 26, 34);

    // Header: players pill (right)
    pillPlayers = plainObj(scr);
    lv_obj_add_flag(pillPlayers, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(pillPlayers, LV_SIZE_CONTENT, 48);
    lv_obj_set_style_radius(pillPlayers, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_border_width(pillPlayers, 3, 0);
    lv_obj_set_style_pad_hor(pillPlayers, 22, 0);
    lv_obj_set_ext_click_area(pillPlayers, 10);
    lv_obj_align(pillPlayers, LV_ALIGN_TOP_RIGHT, -20, 22);
    lv_obj_add_event_cb(pillPlayers, players_pill_cb, LV_EVENT_CLICKED, nullptr);
    lblPillPlayers = makeLabel(pillPlayers, &Points_22, 1, "PLAYERS");
    lv_obj_center(lblPillPlayers);

    // Player blocks
    tileArea = plainObj(scr);
    lv_obj_set_pos(tileArea, AREA_X, AREA_Y);
    lv_obj_set_size(tileArea, AREA_W, AREA_H);

    // Footer chips
    lv_obj_t *footer = plainObj(scr);
    lv_obj_set_size(footer, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(footer, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(footer, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(footer, 12, 0);
    lv_obj_align(footer, LV_ALIGN_BOTTOM_MID, 0, -30);
    chipTap  = makeChip(footer, "TAP +1", &lblChipTap);
    chipHold = makeChip(footer, "HOLD -1", &lblChipHold);

    // Toast and reset dial sit on the top layer, above every screen
    lv_obj_t *top = lv_layer_top();
    buildToast(top);
    buildHoldLayer(top);

    rebuildBoard();
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

    // Long-press threshold for -1 on a player's block
    for (lv_indev_t *indev = lv_indev_get_next(nullptr); indev; indev = lv_indev_get_next(indev))
        lv_indev_set_long_press_time(indev, LONG_PRESS_MS);

    prefs.begin("points", false);
    loadGame();

    // Buttons: top on GPIO, bottom + D-pad on the IO expander (as in the Kode examples)
    pinMode(BUTTON_TOP, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(BUTTON_TOP), topButtonIsr, CHANGE);
    Wire.begin(TOUCH_I2C_SDA, TOUCH_I2C_SCL);
    ioexpOk = ioexp.begin(INPUT);
    if (!ioexpOk) Serial.println("Warning: IO expander not found; bottom/D-pad disabled");

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

    lv_timer_create(tick_cb, 10, nullptr);
    Serial.println("Points Block ready");
}

void loop() {
    display.update();
    delay(2);
}
