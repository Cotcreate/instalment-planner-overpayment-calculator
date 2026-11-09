#pragma once
// Kode Dot hardware map (ESP32-S3). Values from the official kodediy BSP.

// ---- AMOLED panel (CO5300, QSPI) ----
#define LCD_WIDTH       410
#define LCD_HEIGHT      502
#define LCD_SCLK        17
#define LCD_SDIO0       15
#define LCD_SDIO1       14
#define LCD_SDIO2       16
#define LCD_SDIO3       10
#define LCD_RST         8
#define LCD_CS          9
#define LCD_COL_OFFSET  22

// ---- Shared I2C bus: touch (CST820) + TCA9555 IO expander ----
#define I2C_SDA         48
#define I2C_SCL         47
#define IOEXP_ADDR      0x20

// ---- Buttons ----
#define BUTTON_TOP_GPIO        0   // raw GPIO, active low
#define EXP_BUTTON_BOTTOM      9   // TCA9555 P11, active low

// ---- Status LED (WS2812) ----
#define LED_PIN         4
