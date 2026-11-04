/*
 * TestINMP441.ino
 * Script de diagnostico rapido para el microfono INMP441 en ESP32.
 * NO requiere Wi-Fi ni servidor; imprime los datos directamente en el Monitor Serial.
 * Baudios: 115200
 */

#include <Arduino.h>
#include <driver/i2s.h>

// PINES DEL CIRCUITO
#define I2S_WS      27
#define I2S_SCK     14
#define I2S_SD      33
#define LED_PIN      2
#define I2S_PORT    I2S_NUM_0

#define SAMPLES 128
int32_t rawSamples[SAMPLES];

void setup() {
  Serial.begin(115200);
  delay(1000);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);

  Serial.println("\n==================================================");
  Serial.println("  DIAGNOSTICO DE HARDWARE: ESP32 + INMP441 I2S");
  Serial.println("==================================================");
  Serial.println("Pines configurados:");
  Serial.println("  WS  (LRC) -> GPIO 27");
  Serial.println("  SCK (BCLK)-> GPIO 14");
  Serial.println("  SD  (DIN) -> GPIO 33");
  Serial.println("  L/R       -> GND (Canal Izquierdo)");
  Serial.println("  VDD       -> 3.3V");
  Serial.println("  GND       -> GND");
  Serial.println("--------------------------------------------------");

  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = 16000,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = 256,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };

  esp_err_t err = i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  if (err != ESP_OK) {
    Serial.printf("[ERROR] Fallo al instalar driver I2S: 0x%x\n", err);
    return;
  }

  err = i2s_set_pin(I2S_PORT, &pin_config);
  if (err != ESP_OK) {
    Serial.printf("[ERROR] Fallo al asignar pines I2S: 0x%x\n", err);
    return;
  }

  i2s_zero_dma_buffer(I2S_PORT);
  Serial.println("[OK] Driver I2S iniciado correctamente. Leyendo sensor...\n");
}

unsigned long lastPrint = 0;
long totalLeidos = 0;
long cerosDetectados = 0;
long noCeros = 0;

void loop() {
  size_t bytesRead = 0;
  esp_err_t res = i2s_read(I2S_PORT, rawSamples, sizeof(rawSamples), &bytesRead, portMAX_DELAY);

  if (res == ESP_OK && bytesRead > 0) {
    int count = bytesRead / sizeof(int32_t);
    int32_t valMax = -2147483647;
    int32_t valMin = 2147483647;
    int32_t muestraEjemplo = 0;

    for (int i = 0; i < count; i++) {
      int32_t raw = rawSamples[i] >> 8; // Extraer 24 bits
      totalLeidos++;
      if (raw == 0) {
        cerosDetectados++;
      } else {
        noCeros++;
      }

      if (raw > valMax) valMax = raw;
      if (raw < valMin) valMin = raw;
      if (i == 0) muestraEjemplo = raw;
    }

    // Reporte cada 250 ms en consola
    if (millis() - lastPrint >= 250) {
      lastPrint = millis();

      int32_t amplitudPico = (valMax - valMin);

      Serial.print("[I2S] Muestra: ");
      Serial.print(muestraEjemplo);
      Serial.print(" | Amplitud (Max-Min): ");
      Serial.print(amplitudPico);

      if (noCeros == 0) {
        Serial.println("  -> [ESTADO: SILENCIO TOTAL / CEROS] (Revisar pin SD o L/R)");
      } else {
        Serial.print("  -> [ESTADO: SENAL VIVA!] No-ceros: ");
        Serial.print((noCeros * 100) / totalLeidos);
        Serial.println("%");
      }

      // Reiniciar contadores de ventana
      totalLeidos = 0;
      cerosDetectados = 0;
      noCeros = 0;
    }
  } else {
    Serial.printf("[I2S ERROR] Fallo i2s_read: 0x%x\n", res);
    delay(500);
  }
}

