#include <driver/i2s.h>

// --- MAPEO DE PINES (NodeMCU ESP32-S 38 Pines) ---
#define I2S_WS      27  // Pata 11 izquierda (GPIO27)
#define I2S_SCK     14  // Pata 12 izquierda (GPIO14)
#define I2S_SD      33  // Pata 8 izquierda  (GPIO33)

#define BUTTON_PIN   5  // Pata 10 derecha   (GPIO5 con pull-up)
#define LED_PIN      2  // Pata 15 derecha   (GPIO2, LED de estado)

#define I2S_PORT    I2S_NUM_0
#define BUFFER_LEN  64

int32_t buffer[BUFFER_LEN];
bool escuchando = false;
bool estadoBotonAnterior = HIGH;

void configurarI2S() {
    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = 16000,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
        .channel_format = I2S_CHANNEL_FMT_ONLY_RIGHT, // Optimizado para L/R a 3.3V
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 4,
        .dma_buf_len = BUFFER_LEN,
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

    i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
    i2s_set_pin(I2S_PORT, &pin_config);
}

void setup() {
    Serial.begin(115200);

    pinMode(BUTTON_PIN, INPUT_PULLUP);
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);

    configurarI2S();
}

void loop() {
    bool estadoBotonActual = digitalRead(BUTTON_PIN);

    // Detección de flanco al presionar el pulsador hacia GND
    if (estadoBotonAnterior == HIGH && estadoBotonActual == LOW) {
        escuchando = !escuchando;
        digitalWrite(LED_PIN, escuchando ? HIGH : LOW);
        delay(200); // Filtro antirrebote
    }
    estadoBotonAnterior = estadoBotonActual;

    if (escuchando) {
        size_t bytesLeidos = 0;
        esp_err_t res = i2s_read(I2S_PORT, buffer, sizeof(buffer), &bytesLeidos, pdMS_TO_TICKS(100));

        if (res == ESP_OK && bytesLeidos > 0) {
            int muestras = bytesLeidos / sizeof(int32_t);
            int64_t suma = 0;

            for (int i = 0; i < muestras; i++) {
                int32_t muestra = buffer[i] >> 14;
                suma += abs(muestra);
            }

            float amplitud = (float)suma / muestras;

            // Salida estricta para el Serial Plotter (sin espacios antes ni después)
            Serial.print("Amplitud:");
            Serial.println(amplitud);
        }
    }
}