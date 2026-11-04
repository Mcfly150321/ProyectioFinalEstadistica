#include <WiFi.h>
#include <WebSocketsClient.h>
#include <driver/i2s.h>

// --- CREDENCIALES DE RED ---
const char* ssid = "Meso";
const char* password = "Un1f1M3so";

// --- SERVIDOR NGROK ---
// IMPORTANTE: En el servidor lanzar ngrok con:
// ngrok http 5000 --domain luxury-roster-uncouth.ngrok-free.dev --scheme=http,https
const char* websockets_server_host = "luxury-roster-uncouth.ngrok-free.dev";
const uint16_t websockets_server_port = 80; // Puerto 80 (WS sin SSL) habilitado con --scheme=http,https

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

// Variables para limpieza de offset DC y suavizado de ruido de alta frecuencia
int64_t dcOffset = 0;
bool dcInicializado = false;
int32_t prevCleanSample = 0;

// Limpieza periodica automatica de buffers I2S y filtro (cada 2 minutos)
#define INTERVALO_LIMPIEZA_MS 120000UL
unsigned long ultimaLimpiezaMs = 0;

void limpiarBuffersAudio() {
    dcOffset = 0;
    dcInicializado = false;
    prevCleanSample = 0;
    i2s_zero_dma_buffer(I2S_PORT);
    ultimaLimpiezaMs = millis();
    Serial.println("[MANTENIMIENTO] Buffers DMA I2S y filtro reiniciados limpiamente.");
}

WebSocketsClient webSocket;

bool despertarRedARP() {
    IPAddress gateway = WiFi.gatewayIP();
    Serial.print("Despertando ruta ARP con el Gateway (");
    Serial.print(gateway);
    Serial.println(") | DNS DHCP: " + WiFi.dnsIP(0).toString());

    WiFiClient arpClient;
    arpClient.connect(gateway, 80, 1000);
    arpClient.stop();

    IPAddress serverIP;
    Serial.print("Resolviendo DNS para ");
    Serial.print(websockets_server_host);
    if (WiFi.hostByName(websockets_server_host, serverIP)) {
        Serial.print(" -> IP resuelta: ");
        Serial.println(serverIP);
        return true;
    }

    // Si falla con el DNS del router/universidad, probar con 8.8.8.8 y 1.1.1.1 sin perder la IP DHCP
    Serial.println(" -> Fallo DNS local, probando DNS 8.8.8.8...");
    WiFi.config(WiFi.localIP(), WiFi.gatewayIP(), WiFi.subnetMask(), IPAddress(8, 8, 8, 8), IPAddress(1, 1, 1, 1));
    if (WiFi.hostByName(websockets_server_host, serverIP)) {
        Serial.print(" -> IP resuelta con 8.8.8.8: ");
        Serial.println(serverIP);
        return true;
    }

    Serial.println(" -> [ERROR] No se pudo resolver el DNS en esta subred!");
    return false;
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.println("[WSc] Desconectado del servidor.");
            digitalWrite(LED_PIN, LOW);
            break;
        case WStype_CONNECTED:
            Serial.printf("[WSc] Conectado exitosamente a: %s\n", payload ? (char*)payload : "/ws/esp");
            {
                String jsonString = "{\"recording\":" + String(escuchando ? "true" : "false") + "}";
                webSocket.sendTXT(jsonString);
                digitalWrite(LED_PIN, escuchando ? HIGH : LOW);
            }
            break;
        case WStype_ERROR:
            Serial.printf("[WSc] Error en WebSocket: %s\n", payload ? (char*)payload : "desconocido");
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
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 8,
        .dma_buf_len = 512,
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

    pinMode(I2S_SD, INPUT_PULLDOWN);
    i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
    i2s_set_pin(I2S_PORT, &pin_config);
    i2s_zero_dma_buffer(I2S_PORT);
}

void setup() {
    Serial.begin(115200);

    pinMode(BUTTON_PIN, INPUT_PULLUP);
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);

    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);

    bool redValida = false;
    int intentosDHCP = 0;

    while (!redValida && intentosDHCP < 5) {
        intentosDHCP++;
        WiFi.disconnect(true);
        delay(300);
        WiFi.begin(ssid, password);

        Serial.printf("Conectando a Wi-Fi (Intento DHCP %d)", intentosDHCP);
        int espera = 0;
        while (WiFi.status() != WL_CONNECTED && espera < 20) {
            delay(500);
            Serial.print(".");
            espera++;
        }

        if (WiFi.status() == WL_CONNECTED) {
            Serial.println("\nWi-Fi conectado. IP local: " + WiFi.localIP().toString());
            if (despertarRedARP()) {
                redValida = true;
            } else {
                Serial.println("[AVISO] El router entrego una IP sin salida a Internet (" + WiFi.localIP().toString() + "). Reintentando DHCP...");
                delay(1000);
            }
        }
    }

    configurarI2S();

    String wsPath = "/ws/esp?token=" + String(esp_token);
    String extraHeader = "X-ESP-Token: " + String(esp_token) + "\r\nngrok-skip-browser-warning: true";

    webSocket.begin(websockets_server_host, websockets_server_port, wsPath.c_str());
    webSocket.setExtraHeaders(extraHeader.c_str());
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(3000);
    webSocket.enableHeartbeat(15000, 3000, 2);
}

void loop() {
    webSocket.loop();

    bool estadoBotonActual = digitalRead(BUTTON_PIN);

    // Deteccion de flanco del boton fisico
    if (estadoBotonAnterior == HIGH && estadoBotonActual == LOW) {
        escuchando = !escuchando;

        limpiarBuffersAudio();

        String jsonString = "{\"recording\":" + String(escuchando ? "true" : "false") + "}";
        webSocket.sendTXT(jsonString);

        digitalWrite(LED_PIN, escuchando ? HIGH : LOW);
        delay(200);
    }
    estadoBotonAnterior = estadoBotonActual;

    // Si esta activo el modo escucha, leer bloque completo de I2S y enviar por WebSocket
    if (escuchando && webSocket.isConnected()) {
        // Limpieza automatica periodica cada 2 minutos para evitar granulacion o acumulacion en DMA
        if (millis() - ultimaLimpiezaMs >= INTERVALO_LIMPIEZA_MS) {
            limpiarBuffersAudio();
        }

        size_t bytesLeidos = 0;
        esp_err_t res = i2s_read(I2S_PORT, rawBuffer, sizeof(rawBuffer), &bytesLeidos, pdMS_TO_TICKS(100));

        if (res == ESP_OK && bytesLeidos > 0) {
            int muestras = bytesLeidos / sizeof(int32_t);

            // 1. Calcular el centro DC exacto del bloque en 64 bits (sin desbordamiento ni retardo de 3s)
            int64_t sumaBloque = 0;
            for (int i = 0; i < muestras; i++) {
                sumaBloque += (rawBuffer[i] >> 8);
            }
            int32_t mediaBloque = (int32_t)(sumaBloque / muestras);

            if (!dcInicializado) {
                dcOffset = mediaBloque;
                dcInicializado = true;
            } else {
                // Seguimiento suave del centro DC
                dcOffset = (dcOffset * 7 + mediaBloque) / 8;
            }

            for (int i = 0; i < muestras; i++) {
                int32_t x = rawBuffer[i] >> 8;

                // 2. Quitar offset DC sin derivar (evita amplificar estatica de 3 kHz)
                int32_t centrado = x - (int32_t)dcOffset;

                // 3. Suavizado pasa-bajos de 2 muestras para limpiar ruido electrico de reloj I2S
                int32_t limpio = (centrado + prevCleanSample) / 2;
                prevCleanSample = centrado;

                // 4. Ganancia balanceada (>> 4) con reduccion suave de piso de ruido electrico
                int32_t sample16 = limpio >> 4;
                if (sample16 > -120 && sample16 < 120) {
                    sample16 /= 4;
                }

                if (sample16 > 32767) sample16 = 32767;
                if (sample16 < -32768) sample16 = -32768;

                pcmBuffer[i] = (int16_t)sample16;
            }

            webSocket.sendBIN((uint8_t*)pcmBuffer, muestras * sizeof(int16_t));
        }
    }
}
