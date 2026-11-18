#!/usr/bin/env python3
"""
Servidor unificado FastAPI + WebSockets para recepcion de audio desde ESP32 (INMP441)
y panel de monitoreo web en Front/.
Configurado para instancia de Oracle Cloud (0.0.0.0:5000) con autenticacion mediante .env,
persistencia periodica en Supabase PostgreSQL (Fase 1), invocacion del motor de simulacion
estadistica en vivo en R (Fases 2 y 3) y difusion de metricas en tiempo real via WebSockets.
"""

import asyncio
from datetime import date, datetime, timezone, timedelta
import json
import math
import os
import shutil
import struct
import subprocess
import threading
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

try:
    import psycopg2
except ImportError:
    psycopg2 = None

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
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres.qnuwzacoysjcdirodjve:Alphamike21#1503@aws-0-us-east-2.pooler.supabase.com:6543/postgres"
).strip()
DB_INTERVAL_MINUTES = float(os.environ.get("DB_INTERVAL_MINUTES", "15"))
DB_THRESHOLD_DB = float(os.environ.get("DB_THRESHOLD_DB", "-40.0"))
PORT = int(os.environ.get("PORT", 5000))
SAMPLE_RATE = 16000

# Rutas del Pipeline R Live
DATOS_LIVE_CSV = os.path.join(BACKEND_DIR, "datos_live.csv")
SCRIPT_R_LIVE = os.path.join(BACKEND_DIR, "r_live", "simulacion_live.R")
ESTADISTICAS_LIVE_JSON = os.path.join(BACKEND_DIR, "estadisticas_live.json")

# Control de temporizador para inserciones cada 15 minutos (o DB_INTERVAL_MINUTES)
last_db_insert_time = 0.0
db_lock = threading.Lock()

# Acumuladores dentro de la ventana de 15 minutos:
# Filtra ruidos irreales de desconexion (<= -59.5 dB) para promediar solo audio real recibido
window_peak_db = -60.0
window_db_samples = []

# Cache global de ultimas estadisticas generadas por R
latest_live_stats = {}
server_loop = None


# =========================================================================
# 2. MOTOR DE SIMULACION Y ANALITICA R EN VIVO (RSCRIPT SUBPROCESS)
# =========================================================================
def inicializar_dataset_live():
    """
    Garantiza que datos_live.csv exista, inicializandolo a partir de los 236
    registros limpios base si aun no ha sido creado en el entorno.
    """
    if not os.path.isfile(DATOS_LIVE_CSV):
        origen = os.path.join(PROJECT_ROOT, "analisisestadistico", "fase1_extraccion_normativa", "datos_limpios.csv")
        if os.path.isfile(origen):
            try:
                shutil.copyfile(origen, DATOS_LIVE_CSV)
                print(f"\033[1;32m[R LIVE] Inicializado {DATOS_LIVE_CSV} con datos base (236 registros).\033[0m")
            except Exception as e:
                print(f"\033[1;31m[R LIVE] Error al copiar dataset base: {e}\033[0m")


def ejecutar_simulacion_r() -> dict:
    """
    Ejecuta el script R (`simulacion_live.R`) con Rscript pasando el dataset live CSV.
    Retorna el diccionario con medidas descriptivas, auditoria normativa,
    distribucion binomial (n=3 y n=7) y regresion lineal de tendencia.
    """
    global latest_live_stats
    inicializar_dataset_live()

    if not os.path.isfile(SCRIPT_R_LIVE):
        msg = f"Script R no encontrado en {SCRIPT_R_LIVE}"
        print(f"\033[1;31m[R LIVE ERROR] {msg}\033[0m")
        return {"status": "error", "message": msg}

    try:
        comando = ["Rscript", SCRIPT_R_LIVE, DATOS_LIVE_CSV]
        proceso = subprocess.run(
            comando,
            capture_output=True,
            text=True,
            check=True
        )
        salida = proceso.stdout.strip()
        data = json.loads(salida)
        latest_live_stats = data

        # Guardar copia persistente del ultimo calculo en disco
        try:
            with open(ESTADISTICAS_LIVE_JSON, "w", encoding="utf-8") as f:
                f.write(salida)
        except Exception:
            pass

        n_tot = data.get("n_total", 0)
        media_dba = data.get("descriptiva", {}).get("media", 0.0)
        p_bern = data.get("normativa", {}).get("p_bernoulli", 0.0)
        riesgo3 = data.get("binomial_3_cubiculos", {}).get("riesgo_critico_ge1", 0.0)
        print(f"\n\033[1;35m[R LIVE ENGINE] Computo exitoso -> N={n_tot} | Media={media_dba:.2f} dBA | p={p_bern:.4f} | P(X>=1, n=3)={riesgo3*100:.2f}%\033[0m")
        return data
    except subprocess.CalledProcessError as err:
        err_msg = err.stderr.strip() if err.stderr else str(err)
        print(f"\n\033[1;31m[R LIVE ERROR] Error en Rscript: {err_msg}\033[0m")
        return latest_live_stats if latest_live_stats else {"status": "error", "message": err_msg}
    except Exception as ex:
        print(f"\n\033[1;31m[R LIVE ERROR] Excepcion al ejecutar R: {ex}\033[0m")
        return latest_live_stats if latest_live_stats else {"status": "error", "message": str(ex)}


def on_nuevo_registro_confirmado(res):
    """
    Callback ejecutado inmediatamente despues de confirmar un INSERT en Supabase.
    Recibe la tupla retornada por RETURNING:
      res = (id, created_at, Dia, decibeles, superaumbral, picoactual)
    1. Convierte created_at (UTC) a la hora local de Guatemala (UTC-6).
    2. Convierte dBFS a dBA normativo (dBA = dBFS + 105.0).
    3. Anexa el nuevo registro en backend/datos_live.csv.
    4. Ejecuta el Rscript en vivo para actualizar todos los modelos estadisticos.
    5. Difunde el payload actualizado a traves de WebSockets a los navegadores.
    """
    try:
        id_val = res[0]
        dt_orig = res[1]
        dia_orig = res[2]
        db_val = res[3]
        supera_orig = res[4]
        pico_val = res[5]

        # 1. Normalizacion temporal: UTC-0 a UTC-6 (Guatemala)
        if dt_orig is None:
            dt_utc = datetime.now(timezone.utc)
        elif isinstance(dt_orig, str):
            dt_utc = datetime.fromisoformat(dt_orig.replace("Z", "+00:00"))
            if dt_utc.tzinfo is None:
                dt_utc = dt_utc.replace(tzinfo=timezone.utc)
        elif isinstance(dt_orig, datetime):
            if dt_orig.tzinfo is None:
                dt_utc = dt_orig.replace(tzinfo=timezone.utc)
            else:
                dt_utc = dt_orig.astimezone(timezone.utc)
        else:
            dt_utc = datetime.now(timezone.utc)

        tz_guate = timezone(timedelta(hours=-6))
        dt_guate = dt_utc.astimezone(tz_guate)

        fecha_str_guate = dt_guate.strftime("%Y-%m-%d")
        hora_texto = dt_guate.strftime("%H:%M")
        hora_decimal = round(dt_guate.hour + dt_guate.minute / 60.0 + dt_guate.second / 3600.0, 4)

        base_date = date(2026, 11, 3)
        diff_dias = (dt_guate.date() - base_date).days + 1
        dia_num = max(1, diff_dias)
        dia_nom = f"Día {dia_num} ({fecha_str_guate})"

        # 2. Conversion acustica: dBFS a dBA normativo (+105.0 dB)
        db_num = round(float(db_val), 2)
        pico_num = round(float(pico_val), 2) if pico_val is not None else db_num
        dba_val = round(db_num + 105.0, 2)
        pico_dba_val = round(pico_num + 105.0, 2)
        supera_num = 1 if (db_num >= -40.0 or dba_val >= 65.0) else 0

        # 3. Anexar al CSV en vivo
        nueva_fila = (
            f"{id_val},{dt_utc.strftime('%Y-%m-%d %H:%M:%S+00')},"
            f"{dt_guate.strftime('%Y-%m-%d %H:%M:%S')},{fecha_str_guate},"
            f"{dia_num},{dia_nom},{hora_texto},{hora_decimal},"
            f"{db_num},{pico_num},{dba_val},{pico_dba_val},{supera_num},65.0\n"
        )

        with open(DATOS_LIVE_CSV, "a", encoding="utf-8") as f:
            f.write(nueva_fila)

        print(f"\033[1;36m[DATA PIPELINE] Nuevo registro incorporado -> ID={id_val} | {fecha_str_guate} {hora_texto} UTC-6 | {dba_val} dBA | Supera={supera_num}\033[0m")

        # 4. Invocacion del motor R
        stats = ejecutar_simulacion_r()

        # 5. Difusion por WebSocket a los clientes conectados
        if server_loop and server_loop.is_running():
            asyncio.run_coroutine_threadsafe(broadcast_live_stats(stats), server_loop)

    except Exception as err:
        print(f"\033[1;31m[ERROR EN PIPELINE LIVE] {err}\033[0m")


# =========================================================================
# 3. PERSISTENCIA EN SUPABASE POSTGRESQL (FASE 1)
# =========================================================================
def limpiar_database_url(url: str) -> str:
    """
    Limpia parametros como pgbouncer=true que psycopg2 no reconoce en DSN.
    """
    if not url:
        return ""
    if "?pgbouncer=true" in url:
        url = url.replace("?pgbouncer=true", "")
    elif "&pgbouncer=true" in url:
        url = url.replace("&pgbouncer=true", "")
    return url


def registrar_muestra_en_ventana(db_val: float):
    """
    Rastrea el pico maximo y acumula muestras durante el intervalo de 15 minutos.
    Descarta silencios de desconexion (<= -59.5 dB) para no sesgar el promedio real.
    """
    global window_peak_db, window_db_samples
    if db_val <= -59.5:
        return

    with db_lock:
        if db_val > window_peak_db:
            window_peak_db = db_val
        window_db_samples.append(db_val)


def insertar_en_postgresql(data: dict, force: bool = False):
    """
    Fase 1: Guarda mediciones en la tabla "Registros" de Supabase.
    Calcula el promedio y el pico EXCLUSIVAMENTE sobre las muestras de audio
    reales recibidas (descartando cortes o silencios por desconexion).
    Tras la insercion exitosa, dispara on_nuevo_registro_confirmado().
    """
    global last_db_insert_time, window_peak_db, window_db_samples

    if not DATABASE_URL:
        return

    if psycopg2 is None:
        print("\n\033[1;33m[DB] psycopg2 no instalado. Ejecuta: sudo apt install python3-psycopg2\033[0m")
        return

    ahora = time.time()
    intervalo_segundos = DB_INTERVAL_MINUTES * 60.0

    with db_lock:
        if not force and (ahora - last_db_insert_time < intervalo_segundos):
            return
        last_db_insert_time = ahora

        if window_db_samples:
            avg_db = sum(window_db_samples) / len(window_db_samples)
            peak_db = window_peak_db
            total_muestras = len(window_db_samples)
            window_db_samples.clear()
            window_peak_db = -60.0
        else:
            cand_db = float(data.get("db", -60.0))
            if cand_db > -59.5:
                avg_db = cand_db
                peak_db = cand_db
                total_muestras = 1
            else:
                return

    avg_db = round(avg_db, 2)
    peak_db = round(peak_db, 2)
    supera_umbral = bool(avg_db >= DB_THRESHOLD_DB)
    dia_actual = date.today()

    def _ejecutar_insert():
        try:
            dsn = limpiar_database_url(DATABASE_URL)
            conn = psycopg2.connect(dsn, sslmode="require", connect_timeout=10)
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO "Registros" ("Dia", "decibeles", "superaumbral", "picoactual")
                    VALUES (%s, %s, %s, %s)
                    RETURNING id, created_at, "Dia", "decibeles", "superaumbral", "picoactual";
                """, (dia_actual, avg_db, supera_umbral, peak_db))
                res = cur.fetchone()
                conn.commit()
                print(f"\n\033[1;32m[DB SUPABASE] Registro confirmado en Postgres -> id={res[0]} | Dia={res[2]} | dB_prom={res[3]} (muestras={total_muestras}) | Pico={res[5]} | Supera={res[4]}\033[0m")
            conn.close()

            # Disparar pipeline R en vivo inmediatamente
            on_nuevo_registro_confirmado(res)
        except Exception as ex:
            print(f"\n\033[1;31m[DB ERROR] Error al insertar en Supabase: {ex}\033[0m")

    if force:
        _ejecutar_insert()
    else:
        threading.Thread(target=_ejecutar_insert, daemon=True).start()


# =========================================================================
# 4. ANALISIS DE BLOQUES PCM Y VUMETRO EN CONSOLA
# =========================================================================
def analizar_bloque_pcm16(audio_bytes, sample_rate=SAMPLE_RATE):
    """
    Calcula RMS, decibeles (dBFS) y frecuencia estimada a partir de los bytes
    PCM de 16 bits con signo enviados por el ESP32.
    """
    num_samples = len(audio_bytes) // 2
    if num_samples == 0:
        return {
            "timestamp": int(time.time() * 1000),
            "sampleRate": sample_rate,
            "rms": 0.0,
            "db": -60.0,
            "peakFrequencyHz": 0
        }

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

    duration_sec = num_samples / float(sample_rate)
    est_freq = int((zero_crossings / 2.0) / duration_sec) if rms > 0.008 and duration_sec > 0 else 0

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
# 5. APLICACION FASTAPI Y RUTAS WEBSOCKET / HTTP
# =========================================================================
app = FastAPI(title="Audio Analytics Server - ESP32, Supabase, R Engine & Oracle")

esp_connection: WebSocket | None = None
browser_connections: set[WebSocket] = set()
is_recording: bool = False
latest_metrics: dict = {
    "timestamp": 0,
    "sampleRate": SAMPLE_RATE,
    "rms": 0.0,
    "db": -60.0,
    "peakFrequencyHz": 0
}

# Localizar carpeta Front/
FRONT_DIR = os.path.join(PROJECT_ROOT, "Front")
if not os.path.isdir(FRONT_DIR):
    FRONT_DIR = os.path.join(BACKEND_DIR, "Front")


@app.on_event("startup")
async def startup_event():
    """
    Captura el bucle principal asyncio y realiza el primer computo estadistico en R.
    """
    global server_loop, latest_live_stats
    server_loop = asyncio.get_running_loop()
    inicializar_dataset_live()
    print("\033[1;34m[STARTUP] Iniciando calculo base con el motor R...\033[0m")
    latest_live_stats = ejecutar_simulacion_r()


@app.middleware("http")
async def disable_static_cache(request: Request, call_next):
    """
    Evita que el navegador guarde en cache versiones antiguas de los JS/CSS/HTML.
    """
    response = await call_next(request)
    if request.url.path.startswith("/Front") or request.url.path == "/":
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


@app.get("/")
async def root_redirect():
    return RedirectResponse(url="/Front/index.html")


def clave_web_valida(password: str) -> bool:
    """
    Compara la clave recibida contra WEB_PASSWORD, tolerando conversiones de '+' en espacios.
    """
    if not password:
        return False
    return password == WEB_PASSWORD or password.replace(" ", "+") == WEB_PASSWORD


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

    if clave_web_valida(password):
        return JSONResponse({
            "authenticated": True,
            "status": "ok",
            "esp_connected": esp_connection is not None,
            "recording": is_recording,
            "metrics": latest_metrics
        })
    return JSONResponse({"authenticated": False, "error": "Clave incorrecta"}, status_code=401)


@app.get("/api/status")
async def obtener_estado(password: str = ""):
    """
    Devuelve el estado actual del ESP32 y las ultimas metricas para el frontend.
    """
    if not clave_web_valida(password):
        return JSONResponse({"authenticated": False, "error": "No autorizado"}, status_code=401)
    return JSONResponse({
        "type": "status",
        "esp_connected": esp_connection is not None,
        "recording": is_recording,
        "metrics": latest_metrics
    })


@app.get("/api/estadisticas/live")
async def obtener_estadisticas_live():
    """
    Devuelve las ultimas metricas computadas por el motor R.
    """
    global latest_live_stats
    if not latest_live_stats or latest_live_stats.get("status") == "error":
        latest_live_stats = ejecutar_simulacion_r()
    return JSONResponse(latest_live_stats)


@app.post("/api/estadisticas/recalcular")
async def recalcular_estadisticas_live():
    """
    Fuerza la re-ejecucion del script R y difunde inmediatamente los resultados
    a todos los paneles web conectados via WebSocket.
    """
    global latest_live_stats
    latest_live_stats = ejecutar_simulacion_r()
    await broadcast_live_stats(latest_live_stats)
    return JSONResponse({"status": "ok", "stats": latest_live_stats})


@app.post("/api/capturar_registro")
async def forzar_captura_registro(request: Request):
    """
    Fuerza la insercion de una medicion actual en Supabase,
    lo que a su vez activa el pipeline completo:
    PostgreSQL INSERT -> Actualizar CSV UTC-6 -> Ejecutar Rscript -> Difundir por WebSocket.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    db_cand = float(body.get("db", latest_metrics.get("db", -45.0)))
    if db_cand <= -59.5:
        db_cand = -42.50

    with db_lock:
        window_db_samples.append(db_cand)

    print(f"\n\033[1;33m[CAPTURA MANUAL] Solicitada captura forzada con {db_cand} dBFS...\033[0m")
    insertar_en_postgresql({"db": db_cand}, force=True)
    return JSONResponse({"status": "ok", "message": "Captura encolada e insertada en Supabase + R"})


@app.get("/api/db/recent")
async def obtener_registros_db(password: str = "", limit: int = 20):
    """
    Devuelve los ultimos registros guardados en la tabla 'Registros' de Supabase.
    """
    if not clave_web_valida(password):
        return JSONResponse({"authenticated": False, "error": "No autorizado"}, status_code=401)

    if not DATABASE_URL or psycopg2 is None:
        return JSONResponse({"registros": [], "status": "db_no_configurada"})

    try:
        dsn = limpiar_database_url(DATABASE_URL)
        conn = psycopg2.connect(dsn, sslmode="require", connect_timeout=5)
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, created_at, "Dia", "decibeles", "superaumbral", "picoactual"
                FROM "Registros"
                ORDER BY created_at DESC
                LIMIT %s;
            """, (limit,))
            filas = cur.fetchall()
            registros = [
                {
                    "id": f[0],
                    "created_at": f[1].isoformat() if f[1] else None,
                    "dia": str(f[2]),
                    "decibeles": round(float(f[3]), 2) if f[3] is not None else None,
                    "superaumbral": bool(f[4]),
                    "picoactual": round(float(f[5]), 2) if f[5] is not None else None
                }
                for f in filas
            ]
        conn.close()
        return JSONResponse({"registros": registros, "status": "ok"})
    except Exception as ex:
        return JSONResponse({"error": str(ex), "registros": []}, status_code=500)


async def broadcast_status():
    """
    Notifica a todos los clientes web conectados el estado actual del ESP32.
    """
    status_data = json.dumps({
        "type": "status",
        "esp_connected": esp_connection is not None,
        "recording": is_recording,
        "metrics": latest_metrics
    })
    desconectados = []
    for client in list(browser_connections):
        try:
            await client.send_text(status_data)
        except Exception:
            desconectados.append(client)
    for c in desconectados:
        browser_connections.discard(c)


async def broadcast_live_stats(stats_data: dict):
    """
    Difunde las metricas y modelos actualizados por R a todos los navegadores conectados.
    """
    if not browser_connections or not stats_data:
        return

    msg = json.dumps({
        "type": "estadisticas_live",
        "data": stats_data
    })
    desconectados = []
    for client in list(browser_connections):
        try:
            await client.send_text(msg)
        except Exception:
            desconectados.append(client)
    for c in desconectados:
        browser_connections.discard(c)


async def broadcast_audio_and_metrics(audio_data: bytes, metricas: dict):
    """
    Envia a cada navegador conectado tanto el JSON de metricas como el bloque
    binario PCM16 para el espectro FFT, osciloscopio y reproduccion de audio.
    """
    if not browser_connections:
        return

    metrics_msg = json.dumps({
        "type": "metrics",
        "esp_connected": True,
        "recording": True,
        "timestamp": metricas["timestamp"],
        "sampleRate": metricas["sampleRate"],
        "rms": metricas["rms"],
        "db": metricas["db"],
        "peakFrequencyHz": metricas["peakFrequencyHz"]
    })

    desconectados = []
    for client in list(browser_connections):
        try:
            await client.send_text(metrics_msg)
            await client.send_bytes(audio_data)
        except Exception:
            desconectados.append(client)
    for c in desconectados:
        browser_connections.discard(c)


@app.websocket("/ws/esp")
async def websocket_esp(websocket: WebSocket):
    """
    Endpoint exclusivo para el ESP32. Valida ESP_TOKEN antes de aceptar datos.
    """
    global esp_connection, is_recording, latest_metrics

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
                audio_data = message["bytes"]
                if not is_recording:
                    is_recording = True
                    await broadcast_status()

                # 1. Analizar bloque PCM y mostrar vumetro en consola
                metricas = analizar_bloque_pcm16(audio_data)
                latest_metrics = metricas
                imprimir_vu_metro(metricas["db"], metricas["rms"], metricas["peakFrequencyHz"])

                # 2. Registrar muestra en ventana y acumular
                registrar_muestra_en_ventana(metricas["db"])

                # 3. Guardar en Supabase PostgreSQL periodicamente
                insertar_en_postgresql(metricas)

                # 4. Retransmitir metricas + audio binario a los navegadores
                await broadcast_audio_and_metrics(audio_data, metricas)

            elif "text" in message and message["text"] is not None:
                try:
                    data = json.loads(message["text"])
                    if "recording" in data:
                        prev_rec = is_recording
                        is_recording = bool(data["recording"])
                        estado_str = "TRANSMITIENDO" if is_recording else "EN ESPERA"
                        print(f"\n\033[1;33m[ESP32] Estado de grabacion: {estado_str}\033[0m")
                        await broadcast_status()

                        # Si el ESP32 finalizo una grabacion manual, forzar guardado de la ventana
                        if prev_rec and not is_recording:
                            with db_lock:
                                hay_muestras = len(window_db_samples) > 0
                            if hay_muestras:
                                print("\n\033[1;36m[EVENTO ESP32] Grabacion finalizada. Forzando guardado de muestras acumuladas...\033[0m")
                                insertar_en_postgresql(latest_metrics, force=True)
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
        # Forzar guardado de muestras si habia transmision activa
        with db_lock:
            hay_muestras = len(window_db_samples) > 0
        if hay_muestras:
            insertar_en_postgresql(latest_metrics, force=True)
        await broadcast_status()


@app.websocket("/ws/client")
async def websocket_client(websocket: WebSocket):
    """
    Endpoint para los navegadores de monitoreo. Requiere WEB_PASSWORD valida.
    Envia inmediatamente el estado actual y las ultimas estadisticas de R.
    """
    password = websocket.query_params.get("password", "")
    if not clave_web_valida(password):
        print("\n\033[1;31m[WEB] Intento de conexion WebSocket rechazado: WEB_PASSWORD incorrecta.\033[0m")
        await websocket.close(code=1008)
        return

    await websocket.accept()
    browser_connections.add(websocket)
    print(f"\n\033[1;36m[WEB] Panel de monitoreo conectado ({len(browser_connections)} activos).\033[0m")

    # 1. Enviar estado inmediato al conectar
    await websocket.send_text(json.dumps({
        "type": "status",
        "esp_connected": esp_connection is not None,
        "recording": is_recording,
        "metrics": latest_metrics
    }))

    # 2. Enviar estadisticas live de R al conectar
    if latest_live_stats and latest_live_stats.get("status") == "success":
        await websocket.send_text(json.dumps({
            "type": "estadisticas_live",
            "data": latest_live_stats
        }))

    try:
        while True:
            msg = await websocket.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            if "text" in msg and msg["text"]:
                try:
                    payload = json.loads(msg["text"])
                    if payload.get("type") == "ping":
                        await websocket.send_text(json.dumps({
                            "type": "status",
                            "esp_connected": esp_connection is not None,
                            "recording": is_recording,
                            "metrics": latest_metrics
                        }))
                    elif payload.get("type") == "solicitar_estadisticas":
                        if latest_live_stats:
                            await websocket.send_text(json.dumps({
                                "type": "estadisticas_live",
                                "data": latest_live_stats
                            }))
                except Exception:
                    pass
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        browser_connections.discard(websocket)
        print(f"\n\033[1;36m[WEB] Panel de monitoreo desconectado ({len(browser_connections)} activos).\033[0m")


# Montar archivos estaticos del Frontend
if os.path.isdir(FRONT_DIR):
    app.mount("/Front", StaticFiles(directory=FRONT_DIR, html=True), name="front")


if __name__ == "__main__":
    print("\033[1;34m" + "=" * 68 + "\033[0m")
    print(f"\033[1;32mServidor Unificado Audio Analytics escuchando en 0.0.0.0:{PORT}\033[0m")
    print(f"Frontend servido desde: \033[36m{FRONT_DIR}\033[0m")
    print(f"Seguridad .env activa : \033[33mESP_TOKEN y WEB_PASSWORD cargados\033[0m")
    if DATABASE_URL:
        print(f"Supabase DB activa    : \033[32mRegistros periodicos | Umbral: {DB_THRESHOLD_DB} dBFS (65.0 dBA)\033[0m")
    else:
        print("\033[33mSupabase DB           : DATABASE_URL no configurada en .env\033[0m")
    print(f"Motor R Live activo   : \033[35m{SCRIPT_R_LIVE}\033[0m")
    print("\033[1;34m" + "=" * 68 + "\033[0m")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
