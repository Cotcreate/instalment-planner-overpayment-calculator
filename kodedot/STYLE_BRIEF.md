# Brief for Claude: build a Kode Dot app in the "Tally Block" style

Copy everything below into a new Claude session, then add your app request at the bottom.

---

You're building a new app for the **Kode Dot** (ESP32-S3 pocket device, 410×502 AMOLED touchscreen, top button, bottom button, D-pad, one RGB LED). It must match the look and feel of an existing app called **Tally Block**, a tap counter. The reference code is in `kodedot/TallyBlock/` in the repo `cotcreate/instalment-planner-overpayment-calculator`. Read `kodedot/TallyBlock/src/main.cpp` before writing anything, and reuse its structure and helpers rather than reinventing them.

## 1. Visual identity

**Big, flat block colours with one huge number.** No gradients, no shadows, no photos, no icons. The screen *is* the colour.

- **The whole background is one solid block colour.** It changes with the state (in Tally, `count % 8` picks the colour).
- **The palette is fixed.** Use exactly these, in this order:

| Name | Hex | Text on it |
|---|---|---|
| Tomato | `#FF5436` | Ink |
| Sunflower | `#FFC22E` | Ink |
| Mint | `#19C98A` | Ink |
| Cobalt | `#2F5BFF` | Paper |
| Pink | `#FF6FB1` | Ink |
| Tangerine | `#FF9A1F` | Ink |
| Teal | `#00A6A6` | Paper |
| Lime | `#B6E62E` | Ink |

- **Ink** is `#15120F` and **Paper** is `#FFFDF8`. All text, borders and chip fills on a block use that block's Ink/Paper colour. Never use pure black or white.
- **Overlays and toasts** use an Ink background (90% opacity for full-screen overlays) with Paper text, whatever block is showing.
- **The RGB LED always matches the current block colour** at low brightness (40/255).

## 2. Typography

- **One typeface: Bricolage Grotesque.** ExtraBold (800) for numbers, Bold (700) for labels.
- **Convert fonts with `lv_font_conv`** at **4 bpp**, `--no-compress`. Digits-only ranges keep big sizes small in flash.
- **The hero number steps down in size** so it always fits: 260 px for 1–2 digits, 180 px for 3, 124 px for 4–5. Cap the value so it never overflows (Tally caps at 99,999).
- **Labels are ALL CAPS at 22 px** with 1–4 px letter spacing. Copy is short and literal: "TAP +1", "HOLD TO RESET", "UNDO", "KEEP HOLDING TO RESET".
- **Patch the `lv_font_conv` 1.5.x output for LVGL 9.** Wrap the `lv_font_fmt_txt_glyph_cache_t cache` declaration and the `.cache = &cache` line in `#if LVGL_VERSION_MAJOR == 8`. Replace `LV_VERSION_CHECK(8, 0, 0)` with `LVGL_VERSION_MAJOR >= 8`. Reuse the existing `Tally_*.c` fonts where the sizes fit, since they're already patched.

## 3. Layout (410×502)

- **Header row:** at the top-left, an app name in caps (22 px, x 26, y 34). At the top-right, an outlined pill button (3 px border, fully rounded, 48 px tall, 20 px from the edge, 22 px from the top).
- **Centre:** the hero number, centred. Nothing else competes with it.
- **Footer:** a row of hint chips, centred, 30 px from the bottom, 12 px gap. Each chip is a fully rounded pill filled with the text colour at 20% opacity, padding 16 px × 10 px, ALL CAPS 22 px.
- **Toast:** an Ink rounded rectangle (radius 16) centred 96 px from the bottom. It holds a Paper label and a Paper "UNDO" button with Ink text (radius 10).
- **Margins:** leave at least 20 px clear of every edge.

## 4. Motion

Keep it quick, physical and cheap enough to draw on an ESP32.

- **Colour wipe:** on every value change, a solid rectangle of the new colour grows out from where the action came from: the tap point, the top edge for the top button, the bottom edge for the bottom button, the centre for a reset. 300 ms, ease-out. When it finishes, repaint the screen and delete the rectangle. **Use a rectangle, not a circle.** A full-screen circle is too slow on this chip.
- **Number bounce:** move the number vertically from ±18 px to 0 over 220 ms with overshoot. Start below for an increase and above for a decrease.
- **"No" shake:** a damped sideways wiggle over 350 ms whenever an action isn't allowed (going below 0, resetting at 0, nothing to undo).
- **Hold dial:** a full-screen Ink overlay with a 240 px ring that fills in the current block colour, a thin Paper marker spinning around it (one turn every 0.7 s), a 3-2-1 countdown in the centre, and "KEEP HOLDING TO RESET / LET GO TO CANCEL" at the bottom.

## 5. Interaction rules (accident-proof by design)

- **Adding is fast and easy.** Single tap, or the top button. The top button counts on a **GPIO interrupt** that reads the register directly (`REG_READ(GPIO_IN_REG)`, with `esp_timer_get_time()` for timing) and a 15 ms quiet-time debounce, so mashing never drops a press.
- **Taking away needs a deliberate gesture.** On the touchscreen that's a double-tap within 280 ms, so a single tap waits 280 ms before it counts.
- **Undo needs a double-press** of the bottom button within 450 ms. A single press does nothing. Keep a 100-step undo history that records every change, resets included.
- **Destructive actions need a 3-second hold** with the dial showing. Letting go cancels. After it completes, show a toast with UNDO for 6 seconds.
- **Ignore taps and button presses while the hold dial is up.**
- **Save to NVS** (`Preferences`), batching writes 1.5 s after the last change. Never write on every press.

## 6. Code and project conventions

- **Start from `kodedot/TallyBlock/`.** Copy `boards/`, `extra_scripts/`, `partitions_app.csv`, `lib/kodedot_bsp/` (Kode's board support package, unchanged), `src/lv_conf.h` and the `platformio.ini` structure. Change only `app_name`.
- **Use PlatformIO with the Arduino framework and LVGL 9.** Flash at `0x400000` so kodeOS stays intact.
- **Hardware access goes through the Kode headers.** Screen and touch come from `DisplayManager` (`display.init()` in setup, `display.update()` in loop). Pins come from `kodedot/pin_config.h`. The bottom button and D-pad go through the TCA9555 IO expander: do one `read16()` per poll, check `lastError()`, and treat pins as pressed when LOW. The top button is `BUTTON_TOP` on GPIO 0.
- **Run all app logic from one `lv_timer`** (10 ms) that polls buttons, resolves taps, updates the hold dial, hides the toast and saves.
- **Build objects with the `plainObj()` helper:** `lv_obj_remove_style_all`, then remove the scrollable and clickable flags. Set every style explicitly and never rely on the default theme.
- **Keep one `paint(n)` function** that recolours every colour-dependent element plus the LED. Call it whenever the block changes.
- **Put all tunable constants at the top** of `main.cpp`, and list them in a README table.
- **Use LVGL 9 names:** `lv_screen_active`, `lv_obj_remove_flag`, `lv_anim_set_duration`, `lv_anim_set_completed_cb`, `lv_obj_delete`, `lv_indev_active`.

## 7. Deliverable

- A PlatformIO project folder next to `TallyBlock` in `kodedot/`.
- A README covering what each touch gesture and button does, install steps (VS Code + PlatformIO, USB-C, Upload), and a table of tunable settings.
- If you can't compile, check every LVGL call against the LVGL 9 headers and say plainly that it hasn't been tested on the device.

---

## My new app

**Points tracker.** [Describe it here: how many players or teams, what a point is worth, whether you need a target score or a winner screen, and which button should do what. Keep the rules above unless you say otherwise.]
