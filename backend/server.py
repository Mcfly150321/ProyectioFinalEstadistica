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
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


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


def procesar_estadisticas_r(datos_audio, script_path="analisis.R"):
    """
    Fases 2 y 3: Invoca Rscript mediante subprocess para calculos estadisticos:
      - Medidas de tendencia central: media, mediana
      - Dispersion: desviacion estandar, varianza
      - Modelos probabilisticos / binomiales
    
    Parametros:
      datos_audio (list | dict): Muestras o metricas a procesar.
      script_path (str): Ruta al script .R con la logica estadistica.
    
    Retorna:
      dict | str: Salida procesada generada por Rscript.
    """
    try:
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
        # Rscript no esta instalado en el PATH aun
        return "Rscript no encontrado en el sistema."
    except subprocess.CalledProcessError as err:
        return f"Error en ejecucion de Rscript: {err.stderr.strip()}"
    except Exception as ex:
        return f"Excepcion en llamada a R: {str(ex)}"


class AudioStreamHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

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

                # Visualizacion en consola del nivel de entrada
                bar_len = int(max(0, min(30, (db + 60) / 2)))
                vu_bar = '=' * bar_len + '-' * (30 - bar_len)
                print(f"\r[AUDIO RECIBIDO] {db:6.1f} dB | RMS: {rms:.4f} | Pico: {peak_hz:5} Hz | [{vu_bar}]", end='', flush=True)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            except Exception as e:
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
        # Suprime logs de peticiones GET/POST repetitivas para mantener limpia la consola
        if '/api/audio-stream' in args[0]:
            return
        super().log_message(format, *args)


if __name__ == '__main__':
    server_address = ('0.0.0.0', PORT)
    httpd = HTTPServer(server_address, AudioStreamHandler)
    print("=" * 68)
    print(f"Servidor HTTP listo en el puerto {PORT}")
    print(f"Directorio local: {DIRECTORY}")
    print("=" * 68)
    print("Instrucciones de conexion:")
    print(f"1. Acceso local (misma maquina):")
    print(f"   http://localhost:{PORT}/Front/")
    print()
    print("2. Acceso externo seguro mediante ngrok (Recomendado para movil):")
    print(f"   Ejecuta en otra terminal: ngrok http {PORT}")
    print("   Abre en el celular la URL HTTPS generada (ej. https://xxxx.ngrok-free.app/Front/)")
    print("=" * 68)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
