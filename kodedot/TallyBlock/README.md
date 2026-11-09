# Tally Block for Kode Dot

A full-screen tap counter for the Kode Dot (ESP32-S3, 410×502 AMOLED).

**Touchscreen**
- **Tap anywhere** to add 1
- **Double-tap** to take 1 off (stops at 0)
- **Hold "HOLD TO RESET"** for 3 s to reset

**Buttons**
- **Top button** adds 1 per press, instantly. Mash it as fast as you like: an interrupt counts every press, even mid-animation.
- **Bottom button, pressed twice quickly**, undoes your last change, whether that was a +1, a −1 or a reset. Keep double-pressing to go further back (up to 100 steps). A single press does nothing.
- **D-pad up, held for 3 s**, resets. A spinning dial and a 3-2-1 countdown show while you hold. Let go before it finishes and nothing is reset.

**Also**
- **UNDO** appears on screen for 6 s after a reset
- Every number gets its own block colour (tomato, sunflower, mint, cobalt, pink, tangerine, teal, lime). The new colour wipes out from where the change came from, and the RGB LED matches it.
- The count is saved to flash, so it survives turning the device off.

## Install

You need [VS Code](https://code.visualstudio.com/) with the **PlatformIO** extension.

1. Open this `TallyBlock` folder in VS Code (File → Open Folder).
2. Wait for PlatformIO to finish setting up. The first time, it downloads the ESP32 toolchain and libraries.
3. Plug the Kode Dot in over USB-C.
4. Click **Upload** (→ arrow in the bottom bar), or run:

```bash
pio run -t upload
```

The app is written at `0x400000`, the same slot the official Kode examples use, so kodeOS and its bootloader stay as they are.

## Project layout

Same structure as the official [kodediy/kodedot_examples](https://github.com/kodediy/kodedot_examples):

- `src/main.cpp` holds the app
- `src/fonts/` holds the Bricolage Grotesque fonts, converted for LVGL
- `lib/kodedot_bsp/` is Kode's board support package (screen, touch, LVGL), copied unchanged
- `boards/`, `partitions_app.csv` and `extra_scripts/` are Kode's board config, copied unchanged

## Tweaks

Settings live at the top of `src/main.cpp`:

| Setting | Default | What it does |
|---|---|---|
| `DOUBLE_TAP_MS` | 280 | How quickly the second tap must follow to count as a double-tap |
| `HOLD_RESET_MS` | 3000 | How long you hold to reset (D-pad up or the on-screen pill) |
| `DOUBLE_PRESS_MS` | 450 | How quickly the second bottom-button press must follow to undo |
| `DEBOUNCE_MS` | 15 | Button debounce. Raise it if one press ever counts twice |
| `UNDO_SHOW_MS` | 6000 | How long UNDO stays on screen |
| `LED_BRIGHTNESS` | 40 | RGB LED brightness (0–255) |
| `BLOCKS[]` | 8 colours | The colour palette |
