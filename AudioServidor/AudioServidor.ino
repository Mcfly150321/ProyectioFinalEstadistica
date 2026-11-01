#include <WiFi.h>
#include <WebSocketsClient.h>
#include <driver/i2s.h>

// --- CREDENCIALES DE RED ---
const char* ssid = "FAM OROZCO";
const char* password = "Alfaluan#34";

// --- SERVIDOR ORACLE CLOUD ---
const char* websockets_server_host = "157.137.185.15";
const uint16_t websockets_server_port = 5000;

// --- TOKEN DE AUTENTICACION DEL ESP32 (debe coincidir con ESP_TOKEN en .env) ---
const char* esp_token = "EstadisticaProyecto123*esp32_123";

// --- MAPEO DE PINES ---
#define I2S_WS      27
#define I2S_SCK     14
#define I2S_SD      33

#define BUTTON_PIN   5
#define LED_PIN      2

#define I2S_PORT    I2S_NUM_0

// Bloques de 1024 muestras (64 ms por paquete a 16 kHz)
#define SAMPLE_RATE 16000
#define CHUNK_SAMPLES 1024

int32_t rawBuffer[CHUNK_SAMPLES];
int16_t pcmBuffer[CHUNK_SAMPLES];

bool escuchando = false;
bool estadoBotonAnterior = HIGH;

// Variables para el filtro DC-Blocker (elimina el offset continuo del INMP441)
int32_t prevInput = 0;
int32_t prevOutput = 0;

WebSocketsClient webSocket;

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.println("[WSc] Desconectado del servidor.");
            digitalWrite(LED_PIN, LOW);
            break;
        case WStype_CONNECTED:
            Serial.println("[WSc] Conectado y autenticado en el servidor!");
            // Sincronizar estado actual de grabacion al reconectar
            {
                String jsonString = "{\"recording\":" + String(escuchando ? "true" : "false") + "}";
                webSocket.sendTXT(jsonString);
                digitalWrite(LED_PIN, escuchando ? HIGH : LOW);
            }
            break;
        default:
            break;
    }
}

void configurarI2S() {
    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
        // Pin L/R del INMP441 conectado a GND -> Canal Izquierdo
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        // Estandar I2S Philips para el INMP441 (1 bit de delay tras WS)
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        // 8 buffers DMA de 512 muestras = 256 ms de colchon en hardware
        .dma_buf_count = 8,
        .dma_buf_len = 512,
        // Reloj de audio de alta precision (APLL)
        .use_apll = true,
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
    i2s_zero_dma_buffer(I2S_PORT);
}

void setup() {
    Serial.begin(115200);

    pinMode(BUTTON_PIN, INPUT_PULLUP);
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);

    // Desactivar ahorro de energia del Wi-Fi para evitar latencia y cortes en el stream
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.begin(ssid, password);
    Serial.print("Conectando a Wi-Fi");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWi-Fi conectado. IP local: " + WiFi.localIP().toString());

    configurarI2S();

    // Construir ruta con token y cabecera de autenticacion
    String wsPath = "/ws/esp?token=" + String(esp_token);
    String extraHeader = "X-ESP-Token: " + String(esp_token);

    webSocket.begin(websockets_server_host, websockets_server_port, wsPath.c_str());
    webSocket.setExtraHeaders(extraHeader.c_str());
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(3000);
}

void loop() {
    webSocket.loop();

    bool estadoBotonActual = digitalRead(BUTTON_PIN);

    // Deteccion de flanco del boton fisico
    if (estadoBotonAnterior == HIGH && estadoBotonActual == LOW) {
        escuchando = !escuchando;

        // Reiniciar el filtro DC al iniciar nueva grabacion
        prevInput = 0;
        prevOutput = 0;
        i2s_zero_dma_buffer(I2S_PORT);

        String jsonString = "{\"recording\":" + String(escuchando ? "true" : "false") + "}";
        webSocket.sendTXT(jsonString);

        digitalWrite(LED_PIN, escuchando ? HIGH : LOW);
        delay(200); // Antirrebote
    }
    estadoBotonAnterior = estadoBotonActual;

    // Si esta activo el modo escucha, leer bloque completo de I2S y enviar por WebSocket
    if (escuchando && webSocket.isConnected()) {
        size_t bytesLeidos = 0;
        esp_err_t res = i2s_read(I2S_PORT, rawBuffer, sizeof(rawBuffer), &bytesLeidos, pdMS_TO_TICKS(100));

        if (res == ESP_OK && bytesLeidos > 0) {
            int muestras = bytesLeidos / sizeof(int32_t);

            for (int i = 0; i < muestras; i++) {
                // El INMP441 entrega 24 bits con signo alineados en los bits [31:8].
                int32_t x = rawBuffer[i] >> 8;

                // Filtro pasa-altos DC-Blocker: y[n] = x[n] - x[n-1] + 0.996 * y[n-1]
                int32_t y = x - prevInput + ((prevOutput * 255) >> 8);
                prevInput = x;
                prevOutput = y;

                // Ajustar de 24 bits a 16 bits con ganancia limpia
                int32_t sample16 = y >> 6;

                // Limitar (clipping)
                if (sample16 > 32767) sample16 = 32767;
                if (sample16 < -32768) sample16 = -32768;

                pcmBuffer[i] = (int16_t)sample16;
            }

            // Enviar paquete de audio binario (2048 bytes = 64 ms)
            webSocket.sendBIN((uint8_t*)pcmBuffer, muestras * sizeof(int16_t));
        }
    }
}
