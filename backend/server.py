#!/usr/bin/env python3
"""
Servidor HTTP ligero para servir el Frontend y recibir el stream de audio.
Preparado para integracion con ngrok, PostgreSQL (Fase 1) y RStudio/Rscript (Fases 2 y 3).
Utiliza unicamente la biblioteca estandar de Python.
"""

import json
import os
import subprocess
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8000

# Rutas del proyecto:
# BACKEND_DIR: Carpeta donde reside este script (ProyectoFinal/backend)
# PROJECT_ROOT: Raiz del proyecto (ProyectoFinal) para servir Front/ e idea/
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BACKEND_DIR, ".."))
DIRECTORY = PROJECT_ROOT


def insertar_en_postgresql(data):
    """
    Fase 1: Espacio reservado para persistencia en base de datos PostgreSQL.
    
    Estructura esperada del payload (data):
      - timestamp: int (milisegundos)
      - sampleRate: int (ej. 44100)
      - rms: float
      - db: float
      - peakFrequencyHz: int
      - rawSamples: list[float] (opcional)
    """
    # =========================================================================
    # BLOQUE POSTGRESQL (FASE 1)
    # =========================================================================
    # Para activar cuando se configure PostgreSQL:
    #
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
    
    Parametros:
      datos_audio (list | dict): Muestras o metricas a procesar.
      script_name (str): Nombre o ruta del script .R (por defecto en backend/).
    
    Retorna:
      dict | str: Salida procesada generada por Rscript.
    """
    try:
        # Resolver ruta dentro de backend/ si no es absoluta
        script_path = script_name if os.path.isabs(script_name) else os.path.join(BACKEND_DIR, script_name)

        # Prepara los datos en formato JSON como argumento para Rscript
        argumento_json = json.dumps(datos_audio)
        comando = ["Rscript", script_path, argumento_json]

        # Ejecucion limpia sin shells intermedias
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


def imprimir_vu_metro(db, rms, peak_hz, total_bars=30):
    """
    Renderiza una barra VU estilo hardware de sonido en la consola en tiempo real
    utilizando bloques solidados unicode y degradado de color ANSI (Verde -> Amarillo -> Rojo).
    """
    # Mapeo de escala (-60 dB a 0 dB) al numero total de barras
    active = int(max(0, min(total_bars, ((db + 60) / 60) * total_bars)))

    bar_str = ""
    for i in range(total_bars):
        if i < active:
            if i < 18:
                bar_str += "\033[32m█\033[0m"  # Nivel normal / Verde
            elif i < 25:
                bar_str += "\033[33m█\033[0m"  # Nivel medio / Amarillo
            else:
                bar_str += "\033[31m█\033[0m"  # Nivel alto / Rojo
        else:
            bar_str += "\033[90m░\033[0m"      # Fondo inactivo / Gris

    line = (
        f"\r\033[1;36m[AUDIO RECIBIDO]\033[0m "
        f"\033[1m{db:5.1f} dB\033[0m | "
        f"RMS: \033[33m{rms:.4f}\033[0m | "
        f"Pico: \033[35m{peak_hz:5} Hz\033[0m | "
        f"[{bar_str}]"
    )
    print(line, end='', flush=True)


class AudioStreamHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Servir archivos estaticos desde la raiz del proyecto (donde esta Front/)
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        # Redireccion automatica de la raiz '/' hacia el Dashboard en '/Front/'
        if self.path in ('/', ''):
            self.send_response(302)
            self.send_header('Location', '/Front/')
            self.end_headers()
            return
        super().do_GET()

    def do_POST(self):
        # Endpoint para recibir las metricas y muestras continuas del microfono
        if self.path == '/api/audio-stream':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            try:
                data = json.loads(post_data.decode('utf-8'))
                db = data.get('db', 0)
                rms = data.get('rms', 0)
                peak_hz = data.get('peakFrequencyHz', 0)

                # 1. Espacio reservado para almacenar en PostgreSQL (Fase 1)
                insertar_en_postgresql(data)

                # 2. Espacio reservado para analisis estadistico con R (Fases 2 y 3)
                # resultado_r = procesar_estadisticas_r(data)

                # Visualizacion en consola del nivel de entrada (Barra VU dinamica)
                imprimir_vu_metro(db, rms, peak_hz)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            except Exception:
                self.send_response(400)
                self.end_headers()
        else:
            self.send_error(404, "Endpoint no encontrado")

    def do_OPTIONS(self):
        # Soporte para CORS en caso de pruebas externas o tuneles ngrok
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        # Suprime logs de peticiones POST repetitivas para mantener limpia la consola
        if len(args) > 0 and '/api/audio-stream' in str(args[0]):
            return
        super().log_message(format, *args)


if __name__ == '__main__':
    server_address = ('0.0.0.0', PORT)
    httpd = HTTPServer(server_address, AudioStreamHandler)
    print("\033[1;34m" + "=" * 68 + "\033[0m")
    print(f"\033[1;32mServidor HTTP listo en el puerto {PORT}\033[0m")
    print(f"Directorio servido: \033[36m{DIRECTORY}\033[0m")
    print(f"Directorio backend: \033[36m{BACKEND_DIR}\033[0m")
    print("\033[1;34m" + "=" * 68 + "\033[0m")
    print("\033[1mInstrucciones de conexion:\033[0m")
    print(f"1. Acceso local (misma maquina):")
    print(f"   \033[32mhttp://localhost:{PORT}/Front/\033[0m")
    print()
    print("2. Acceso externo seguro mediante ngrok (Recomendado para movil):")
    print(f"   Ejecuta en otra terminal: \033[33mngrok http {PORT}\033[0m")
    print("   Abre en el celular la URL HTTPS generada (ej. \033[32mhttps://xxxx.ngrok-free.app/Front/\033[0m)")
    print("\033[1;34m" + "=" * 68 + "\033[0m\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
