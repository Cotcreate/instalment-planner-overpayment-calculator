#include "board.h"

#include <Arduino_GFX_Library.h>
#include <Adafruit_NeoPixel.h>
#include <Preferences.h>
#include <TCA9555.h>
#include <Wire.h>
#include <bb_captouch.h>

#include "pins.h"

// kodeOS apps wrap this so the launcher keeps control of the boot slot.
extern "C" void __wrap_esp_ota_mark_app_valid_cancel_rollback(void) {}

namespace board {
namespace {

Arduino_DataBus *bus = nullptr;
Arduino_CO5300 *gfx = nullptr;
BBCapTouch touch;
TCA9555 ioexp(IOEXP_ADDR);
Adafruit_NeoPixel pixel(1, LED_PIN, NEO_GRB + NEO_KHZ800);

lv_display_t *disp = nullptr;
uint32_t lastTickMs = 0;
TouchHook touchHook = nullptr;

bool ioexpOk = false;
bool bottomCached = false;
uint32_t lastBottomPoll = 0;
uint8_t savedBacklight = 128;
int lastBacklight = -1;

// CO5300 needs even-aligned start and odd-aligned end coordinates.
void roundArea(lv_area_t *a) {
  a->x1 &= ~1;
  a->y1 &= ~1;
  a->x2 = (a->x2 & ~1) + 1;
  a->y2 = (a->y2 & ~1) + 1;
}

void onInvalidate(lv_event_t *e) {
  lv_area_t *a = lv_event_get_invalidated_area(e);
  if (a) roundArea(a);
}

void flushCb(lv_display_t *d, const lv_area_t *area, uint8_t *px) {
  const uint32_t w = area->x2 - area->x1 + 1;
  const uint32_t h = area->y2 - area->y1 + 1;
  gfx->startWrite();
  gfx->writeAddrWindow(area->x1, area->y1, w, h);
  gfx->writePixels(reinterpret_cast<uint16_t *>(px), w * h);
  gfx->endWrite();
  lv_display_flush_ready(d);
}

void touchCb(lv_indev_t *, lv_indev_data_t *data) {
  TOUCHINFO ti;
  const bool pressed = touch.getSamples(&ti) && ti.count > 0;
  if (touchHook && touchHook(pressed)) {
    data->state = LV_INDEV_STATE_RELEASED;
    return;
  }
  if (pressed) {
    data->point.x = ti.x[0];
    data->point.y = ti.y[0];
    data->state = LV_INDEV_STATE_PRESSED;
  } else {
    data->state = LV_INDEV_STATE_RELEASED;
  }
}

}  // namespace

bool begin() {
  // Brightness the user picked in kodeOS (percent, shared NVS key).
  {
    Preferences p;
    p.begin("kode_storage", true);
    uint8_t pct = p.getUChar("brightness", 60);
    p.end();
    pct = constrain(pct, 20, 100);
    savedBacklight = (uint8_t)((pct * 255 + 50) / 100);
  }

  bus = new Arduino_ESP32QSPI(LCD_CS, LCD_SCLK, LCD_SDIO0, LCD_SDIO1, LCD_SDIO2, LCD_SDIO3);
  gfx = new Arduino_CO5300(bus, LCD_RST, 0, false, LCD_WIDTH, LCD_HEIGHT, LCD_COL_OFFSET, 0, 0, 0);
  if (!gfx->begin()) return false;
  gfx->setRotation(0);
  gfx->fillScreen(0x0000);
  setBacklight(0);  // fade in from black

  lv_init();
  lastTickMs = millis();

  // Full-frame double buffer in PSRAM, fall back to a strip in SRAM.
  size_t rows = LCD_HEIGHT;
  size_t bytes = (size_t)LCD_WIDTH * rows * 2;
  void *b1 = heap_caps_malloc(bytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  void *b2 = nullptr;
  if (b1) {
    b2 = heap_caps_malloc(bytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  } else {
    rows = 60;
    bytes = (size_t)LCD_WIDTH * rows * 2;
    b1 = heap_caps_malloc(bytes, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    if (!b1) return false;
  }

  disp = lv_display_create(LCD_WIDTH, LCD_HEIGHT);
  lv_display_set_color_format(disp, LV_COLOR_FORMAT_RGB565);
  lv_display_set_flush_cb(disp, flushCb);
  lv_display_add_event_cb(disp, onInvalidate, LV_EVENT_INVALIDATE_AREA, nullptr);
  lv_display_set_buffers(disp, b1, b2, bytes, LV_DISPLAY_RENDER_MODE_PARTIAL);

  if (touch.init(I2C_SDA, I2C_SCL, -1, -1) != CT_SUCCESS) return false;
  lv_indev_t *indev = lv_indev_create();
  lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER);
  lv_indev_set_read_cb(indev, touchCb);

  Wire.begin(I2C_SDA, I2C_SCL);
  ioexpOk = ioexp.begin(INPUT);
  if (ioexpOk) ioexp.pinMode1(EXP_BUTTON_BOTTOM, INPUT);

  pinMode(BUTTON_TOP_GPIO, INPUT_PULLUP);

  pixel.begin();
  pixel.clear();
  pixel.show();
  return true;
}

void tick() {
  const uint32_t now = millis();
  lv_tick_inc(now - lastTickMs);
  lastTickMs = now;
  lv_timer_handler();
}

void setTouchHook(TouchHook hook) { touchHook = hook; }

void setBacklight(uint8_t level) {
  if (!gfx || level == lastBacklight) return;
  lastBacklight = level;
  gfx->setBrightness(level);
}

uint8_t userBacklight() { return savedBacklight; }

bool topButton() { return digitalRead(BUTTON_TOP_GPIO) == LOW; }

bool bottomButton() {
  const uint32_t now = millis();
  if (ioexpOk && now - lastBottomPoll >= 15) {
    lastBottomPoll = now;
    const int v = ioexp.read1(EXP_BUTTON_BOTTOM);
    if (v != TCA9555_INVALID_READ) bottomCached = (v == LOW);
  }
  return bottomCached;
}

void led(uint8_t r, uint8_t g, uint8_t b) {
  pixel.setPixelColor(0, pixel.Color(r, g, b));
  pixel.show();
}

}  // namespace board
