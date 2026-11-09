# Points Block for Kode Dot

A points counter for 1 to 6 players on the Kode Dot (ESP32-S3, 410×502 AMOLED), in the same style as Tally Block.

Each player gets their own colour block with a 3-letter nickname. Tap a player's block to give them a point. First boot starts with **PET** and **JES**.

**Scoreboard (touchscreen)**
- **Tap a player's block** to add 1. Every tap is a point, with no delay, so you can tap fast.
- **Hold a player's block** (0.6 s) to take 1 off. It stops at 0.
- **PLAYERS** (top right) opens the player list.

**Player list**
- **Tap a player** to change their nickname or remove them.
- **+ ADD PLAYER** adds a new player, up to 6. If PET or JES isn't in the game, they show as one-tap picks.
- **Hold "HOLD TO RESET SCORES"** for 3 s to set every score to 0. Players stay.

**Nickname screen**
- Type up to 3 letters on the A–Z keyboard. **DEL** removes the last letter. **DONE** saves.
- **Hold "HOLD TO REMOVE"** for 3 s to remove that player. This option is hidden when only one player is left.

**Buttons**
- **Top button** adds 1 to the selected player. The selected player is the last one you tapped, and the background shows their colour. Mash it as fast as you like: an interrupt counts every press.
- **D-pad left / right** changes the selected player.
- **Bottom button, pressed twice quickly**, undoes your last change. That covers points, resets, renames, adds and removals. Keep double-pressing to go further back, up to 100 steps.
- **D-pad up, held for 3 s**, resets all scores, with the same spinning dial.

**Also**
- The leader's block shows a **LEAD** tag. A tie shows no tag.
- **UNDO** appears on screen for 6 s after a reset or a removal.
- The background colour wipes out from where you tapped, and the RGB LED matches it.
- Scores shrink to fit their block, so 3-digit scores still fit with 6 players.
- Players and scores are saved to flash, so they survive turning the device off.

## Quick test (no build needed)

A ready-built file is in `firmware/PointsBlock.bin`. You can flash it from Chrome or Edge with nothing installed:

1. Plug the Kode Dot in over USB-C.
2. Open the [Espressif web flasher](https://espressif.github.io/esptool-js/).
3. Set the baud rate to 460800 and click **Connect**, then pick the Kode Dot's port.
4. Under **Flash Address** enter `0x400000`. This step matters: the wrong address can overwrite kodeOS.
5. Choose `PointsBlock.bin` and click **Program**.
6. When it finishes, press reset or unplug and replug.

If Connect can't find the device, hold the top button while plugging it in, then try again.

Or, with Python installed:

```bash
pip install esptool
```

```bash
esptool --chip esp32s3 --baud 460800 write-flash 0x400000 firmware/PointsBlock.bin
```

## Install from source

You need [VS Code](https://code.visualstudio.com/) with the **PlatformIO** extension.

1. Open this `PointsBlock` folder in VS Code (File → Open Folder).
2. Wait for PlatformIO to finish setting up. The first time, it downloads the ESP32 toolchain and libraries.
3. Plug the Kode Dot in over USB-C.
4. Click **Upload** (→ arrow in the bottom bar), or run:

```bash
pio run -t upload
```

The app is written at `0x400000`, the same slot the official Kode examples use, so kodeOS and its bootloader stay as they are.

## Project layout

Same structure as Tally Block and the official [kodediy/kodedot_examples](https://github.com/kodediy/kodedot_examples):

- `src/main.cpp` holds the app
- `src/fonts/` holds the Bricolage Grotesque fonts, converted for LVGL (`Points_22` labels, `Points_40` names and keys, `Points_64`–`Points_260` scores)
- `lib/kodedot_bsp/` is Kode's board support package (screen, touch, LVGL), copied unchanged
- `boards/`, `partitions_app.csv` and `extra_scripts/` are Kode's board config, copied unchanged

## Tweaks

Settings live at the top of `src/main.cpp`:

| Setting | Default | What it does |
|---|---|---|
| `LONG_PRESS_MS` | 600 | How long you hold a block to take a point off |
| `HOLD_MS` | 3000 | How long you hold to reset scores or remove a player |
| `DOUBLE_PRESS_MS` | 450 | How quickly the second bottom-button press must follow to undo |
| `DEBOUNCE_MS` | 15 | Button debounce. Raise it if one press ever counts twice |
| `UNDO_SHOW_MS` | 6000 | How long UNDO stays on screen |
| `MAX_SCORE` | 999 | Highest score per player |
| `MAX_PLAYERS` | 6 | Most players in a game |
| `DEFAULT_NAMES` | PET, JES | Players on first boot, and the quick picks when adding |
| `LED_BRIGHTNESS` | 40 | RGB LED brightness (0–255) |
| `BLOCKS[]` | 8 colours | The colour palette |
| `COLOUR_ORDER[]` | 0,3,1,6,… | The order new players take colours in, so neighbours contrast |

## Status

This compiles against LVGL 9.6 and the current pioarduino ESP32 core. It has not been tested on a device yet.

Build note: `lib_deps` pins GFX Library 1.6.9 and LVGL 9.6.0 from GitHub, the versions this was built and checked with. Kode's `display_manager.cpp` has a two-word change for that GFX version: the `Arduino_CO5300` call drops a `false` argument, and `BLACK` becomes `RGB565_BLACK`. Nothing else in Kode's board package changed.
