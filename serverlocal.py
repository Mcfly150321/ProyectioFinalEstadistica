#!/usr/bin/env python3
"""
Servidor unificado FastAPI + WebSockets para recepcion de audio desde ESP32 (INMP441)
y panel de monitoreo web en Front/.
Configurado para instancia de Oracle Cloud (0.0.0.0:5000) con autenticacion mediante .env,
preparado para PostgreSQL (Fase 1) y RStudio / Rscript (Fases 2 y 3).
"""

import json
import math
import os
import struct
import subprocess
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import RedirectResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

# =========================================================================
# 1. CARGA DE CONFIGURACION Y VARIABLES DE ENTORNO (.env)
# =========================================================================
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BACKEND_DIR, ".."))


def cargar_variables_env():
    """
    Lee el archivo .env desde la raiz del proyecto o el directorio actual
    sin requerir librerias externas adicionales.
    """
    posibles_rutas = [
        os.path.join(PROJECT_ROOT, ".env"),
        os.path.join(BACKEND_DIR, ".env"),
        os.path.join(os.getcwd(), ".env"),
    ]
    for ruta in posibles_rutas:
        if os.path.isfile(ruta):
            with open(ruta, "r", encoding="utf-8") as f:
                for linea in f:
                    linea = linea.strip()
                    if not linea or linea.startswith("#") or "=" not in linea:
                        continue
                    clave, valor = linea.split("=", 1)
                    clave = clave.strip()
                    valor = valor.strip().strip('"').strip("'")
                    os.environ.setdefault(clave, valor)
            break


cargar_variables_env()

ESP_TOKEN = os.environ.get("ESP_TOKEN", "EstadisticaProyecto123*esp32_123")
WEB_PASSWORD = os.environ.get("WEB_PASSWORD", "Estadistica2026**++")
PORT = int(os.environ.get("PORT", 5000))
SAMPLE_RATE = 16000


# =========================================================================
# 2. INTEGRACIONES FUTURAS: POSTGRESQL (FASE 1) Y RSCRIPT (FASES 2 Y 3)
# =========================================================================
def insertar_en_postgresql(data):
    """
    Fase 1: Espacio reservado para persistencia en base de datos PostgreSQL.

    Estructura de data:
      - timestamp: int (ms)
      - sampleRate: int (16000)
      - rms: float
      - db: float
      - peakFrequencyHz: int
    """
    # =========================================================================
    # BLOQUE POSTGRESQL (FASE 1)
    # =========================================================================
    # import psycopg2
    # conn = psycopg2.connect(
    #     dbname="estadistica_db",
    #     user="postgres",
    #     password="tu_password",
    #     host="localhost",
    #     port=5432
    # )
    # with conn.cursor() as cur:
    #     cur.execute("""
    #         INSERT INTO registro_audio (timestamp_ms, sample_rate, rms, db, peak_freq_hz)
    #         VALUES (%s, %s, %s, %s, %s);
    #     """, (
    #         data.get('timestamp'),
    #         data.get('sampleRate'),
    #         data.get('rms'),
    #         data.get('db'),
    #         data.get('peakFrequencyHz')
    #     ))
    # conn.commit()
    # conn.close()
    # =========================================================================
    pass


def procesar_estadisticas_r(datos_audio, script_name="analisis.R"):
    """
    Fases 2 y 3: Invoca Rscript mediante subprocess para calculos estadisticos:
      - Medidas de tendencia central: media, mediana
      - Dispersion: desviacion estandar, varianza
      - Modelos probabilisticos / binomiales
    """
    try:
        script_path = script_name if os.path.isabs(script_name) else os.path.join(BACKEND_DIR, script_name)
        argumento_json = json.dumps(datos_audio)
        comando = ["Rscript", script_path, argumento_json]

        proceso = subprocess.run(
            comando,
            capture_output=True,
            text=True,
            check=True
        )
        return proceso.stdout.strip()
    except FileNotFoundError:
        return "Rscript no encontrado en el sistema o script .R ausente."
    except subprocess.CalledProcessError as err:
        return f"Error en ejecucion de Rscript: {err.stderr.strip()}"
    except Exception as ex:
        return f"Excepcion en llamada a R: {str(ex)}"


# =========================================================================
# 3. ANALISIS DE BLOQUES PCM Y VUMETRO EN CONSOLA
# =========================================================================
def analizar_bloque_pcm16(audio_bytes, sample_rate=SAMPLE_RATE):
    """
    Calcula RMS, decibeles (dBFS) y frecuencia estimada a partir de los bytes
    PCM de 16 bits con signo enviados por el ESP32.
    """
    num_samples = len(audio_bytes) // 2
    if num_samples == 0:
        return {"timestamp": int(time.time() * 1000), "sampleRate": sample_rate, "rms": 0.0, "db": -60.0, "peakFrequencyHz": 0}

    samples = struct.unpack(f"<{num_samples}h", audio_bytes[:num_samples * 2])

    sum_squares = 0.0
    zero_crossings = 0
    prev_s = samples[0]

    for s in samples:
        norm = s / 32768.0
        sum_squares += norm * norm
        if (prev_s < 0 <= s) or (prev_s >= 0 > s):
            zero_crossings += 1
        prev_s = s

    rms = math.sqrt(sum_squares / num_samples)
    db = max(-60.0, round(20.0 * math.log10(rms), 2)) if rms > 0.0001 else -60.0

    # Estimacion rapida de frecuencia dominante por cruces por cero
    duration_sec = num_samples / float(sample_rate)
    est_freq = int((zero_crossings / 2.0) / duration_sec) if rms > 0.01 and duration_sec > 0 else 0

    return {
        "timestamp": int(time.time() * 1000),
        "sampleRate": sample_rate,
        "rms": round(rms, 4),
        "db": db,
        "peakFrequencyHz": est_freq
    }


def imprimir_vu_metro(db, rms, peak_hz, total_bars=30):
    """
    Renderiza una barra VU en tiempo real en la consola utilizando bloques
    unicode y degradado de color ANSI (Verde -> Amarillo -> Rojo).
    """
    active = int(max(0, min(total_bars, ((db + 60) / 60) * total_bars)))

    bar_str = ""
    for i in range(total_bars):
        if i < active:
            if i < 18:
                bar_str += "\033[32m█\033[0m"
            elif i < 25:
                bar_str += "\033[33m█\033[0m"
            else:
                bar_str += "\033[31m█\033[0m"
        else:
            bar_str += "\033[90m░\033[0m"

    line = (
        f"\r\033[1;36m[ESP32 AUDIO]\033[0m "
        f"\033[1m{db:5.1f} dB\033[0m | "
        f"RMS: \033[33m{rms:.4f}\033[0m | "
        f"Pico: \033[35m{peak_hz:5} Hz\033[0m | "
        f"[{bar_str}]"
    )
    print(line, end="", flush=True)


# =========================================================================
# 4. APLICACION FASTAPI Y RUTAS WEBSOCKET / HTTP
# =========================================================================
app = FastAPI(title="Audio Analytics Server - ESP32 & Oracle")

esp_connection: WebSocket | None = None
browser_connections: set[WebSocket] = set()
is_recording: bool = False

# Localizar carpeta Front/
FRONT_DIR = os.path.join(PROJECT_ROOT, "Front")
if not os.path.isdir(FRONT_DIR):
    FRONT_DIR = os.path.join(BACKEND_DIR, "Front")


@app.get("/")
async def root_redirect():
    return RedirectResponse(url="/Front/index.html")


@app.post("/api/auth")
async def verificar_clave(request: Request):
    """
    Verifica la clave WEB_PASSWORD ingresada por el usuario en el panel de monitoreo.
    """
    try:
        body = await request.json()
        password = body.get("password", "")
    except Exception:
        password = ""

    if password == WEB_PASSWORD:
        return JSONResponse({"authenticated": True, "status": "ok"})
    return JSONResponse({"authenticated": False, "error": "Clave incorrecta"}, status_code=401)


async def broadcast_status():
    """
    Notifica a todos los clientes web conectados el estado actual del ESP32.
    """
    status_data = json.dumps({
        "type": "status",
        "esp_connected": esp_connection is not None,
        "recording": is_recording
    })
    desconectados = []
    for client in list(browser_connections):
        try:
            await client.send_text(status_data)
        except Exception:
            desconectados.append(client)
    for c in desconectados:
        browser_connections.discard(c)


@app.websocket("/ws/esp")
async def websocket_esp(websocket: WebSocket):
    """
    Endpoint exclusivo para el ESP32. Valida ESP_TOKEN antes de aceptar datos.
    """
    global esp_connection, is_recording

    token_query = websocket.query_params.get("token", "")
    token_header = websocket.headers.get("x-esp-token", "")
    token_recibido = token_query or token_header

    if token_recibido != ESP_TOKEN:
        print("\n\033[1;31m[SEGURIDAD] Conexion de ESP32 rechazada: ESP_TOKEN invalido.\033[0m")
        await websocket.close(code=1008)
        return

    await websocket.accept()
    esp_connection = websocket
    print("\n\033[1;32m[ESP32] Dispositivo autenticado y conectado.\033[0m")
    await broadcast_status()

    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                break

            if "bytes" in message and message["bytes"] is not None:
                if is_recording:
                    audio_data = message["bytes"]

                    # 1. Analizar bloque PCM y mostrar vumetro en consola
                    metricas = analizar_bloque_pcm16(audio_data)
                    imprimir_vu_metro(metricas["db"], metricas["rms"], metricas["peakFrequencyHz"])

                    # 2. Guardar en PostgreSQL (Fase 1)
                    insertar_en_postgresql(metricas)

                    # 3. Retransmitir audio binario a los navegadores autenticados
                    desconectados = []
                    for client in list(browser_connections):
                        try:
                            await client.send_bytes(audio_data)
                        except Exception:
                            desconectados.append(client)
                    for c in desconectados:
                        browser_connections.discard(c)

            elif "text" in message and message["text"] is not None:
                try:
                    data = json.loads(message["text"])
                    if "recording" in data:
                        is_recording = bool(data["recording"])
                        estado_str = "TRANSMITIENDO" if is_recording else "EN ESPERA"
                        print(f"\n\033[1;33m[ESP32] Estado de grabacion: {estado_str}\033[0m")
                        await broadcast_status()
                except Exception:
                    pass

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"\n\033[31m[ESP32] Error en conexion: {e}\033[0m")
    finally:
        if esp_connection == websocket:
            esp_connection = None
            is_recording = False
        print("\n\033[1;31m[ESP32] Dispositivo desconectado.\033[0m")
        await broadcast_status()


@app.websocket("/ws/client")
async def websocket_client(websocket: WebSocket):
    """
    Endpoint para los navegadores de monitoreo. Requiere WEB_PASSWORD valida.
    """
    password = websocket.query_params.get("password", "")
    if password != WEB_PASSWORD:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    browser_connections.add(websocket)

    # Enviar estado inmediato al conectar
    await websocket.send_text(json.dumps({
        "type": "status",
        "esp_connected": esp_connection is not None,
        "recording": is_recording
    }))

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        browser_connections.discard(websocket)


# Montar archivos estaticos del Frontend
if os.path.isdir(FRONT_DIR):
    app.mount("/Front", StaticFiles(directory=FRONT_DIR, html=True), name="front")


if __name__ == "__main__":
    print("\033[1;34m" + "=" * 68 + "\033[0m")
    print(f"\033[1;32mServidor Unificado Audio Analytics escuchando en 0.0.0.0:{PORT}\033[0m")
    print(f"Frontend servido desde: \033[36m{FRONT_DIR}\033[0m")
    print(f"Seguridad .env activa : \033[33mESP_TOKEN y WEB_PASSWORD cargados\033[0m")
    print("\033[1;34m" + "=" * 68 + "\033[0m")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
