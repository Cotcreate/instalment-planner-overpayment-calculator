# Mouse Jiggler — Kode Dot control panel

An on-device app for the [Kode Dot](https://kode.diy) (ESP32-S3 / kodeOS) with a
polished AMOLED UI: pick a mode, set the timing, start/stop, and watch a live
countdown ring. Built with Arduino + LVGL 9 on PlatformIO.

> **Scope of this build:** this is the **UI / control-panel front end only.** It
> runs the mode selection, the timing/countdown logic, and the screen — it does
> **not** emit any USB or mouse output. The jiggle/HID output layer is
> intentionally not included here (see *What's not included* below).

## Modes

| Mode | Timing shown | Notes |
|------|--------------|-------|
| **Normal** | every 10 s | steady, visible cadence |
| **Stealth** | random 45–150 s | irregular, long gaps |
| **Timed** | you choose | interval 5 s … 15 min, distance 1 … 80 px |

The chosen mode, Timed interval, and Timed distance are saved to NVS and restored
on next launch.

## Controls

- **Touch** — mode chips, interval `−`/`+`, and the START/STOP button.
- **Top button (GPIO0)** — start / stop.
- **Bottom button (IO-expander P11)** — cycle mode.

## Screen care

The panel is lit the whole time the app runs, so the UI is built to protect it:

- **True-black background** (`#000000`) so most AMOLED pixels stay fully off.
- **Auto-dim**: after ~20 s with no touch the backlight fades toward a readable
  floor (~15 % of your kodeOS brightness); any touch or button press restores
  full brightness. Brightness is set on the panel directly and is **not** written
  to NVS, so this never disturbs your saved kodeOS brightness.
- **Anti burn-in drift**: the whole layout nudges a few pixels every ~90 s so no
  element sits on fixed pixels. While dimmed it wanders slowly around the screen
  instead (screensaver).

## What moves on screen

- A comet rides the countdown ring as the interval elapses.
- A ripple expands from the ring each time a cycle completes.
- The ring glow breathes while running.
- A strip of 12 dots shows recent cycles, coloured by mode (Timed mode shows its
  interval and distance steppers there instead).
- The info line shows active time and cycle count.

## Project layout

```
src/
  pins.h         Kode Dot hardware map (panel / I2C / buttons / LED)
  board.h/.cpp   AMOLED (CO5300) + LVGL + touch + buttons + NeoPixel
  controller.*   modes, timing, countdown, persistence (no output)
  ui.h/.cpp      the LVGL screen
  main.cpp       wiring, auto-dim, anti burn-in, button handling
boards/kode_dot.json     board definition
partitions_app.csv       app flashed at 0x400000 (kodeOS launcher untouched)
```

## Build & flash

> **Status:** written against the official Kode Dot examples but **not yet compile-tested**. The sandbox it was written in could not reach the PlatformIO library registry. Expect to fix small compile errors on the first `pio run`.

Requires [PlatformIO](https://platformio.org/).

```bash
pio run                    # compile
pio run -t upload          # flash to a connected Kode Dot
```

The app is flashed into the kodeOS **app** partition at `0x400000`; the
bootloader and kodeOS launcher are left in place. After uploading, use the
on-device *create application* flow to save it into a category folder on the
microSD (e.g. `General`).

Hardware values (410×502 CO5300 AMOLED over QSPI, CST820 touch, TCA9555 IO
expander) come from the official `kodediy` BSP and examples.

## What's not included

This project deliberately ships **without** the USB-HID / mouse-movement layer.
It is the display, mode selection, and timing UI only. If you add an output
layer yourself, wire it to `controller::onCycle(...)`, which fires once per
elapsed interval — that is the single hook the UI exposes.
