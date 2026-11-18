#!/usr/bin/env python3
"""
FASE 1: EXTRACCIÓN DE DATOS REALES DE SUPABASE, CONVERSIÓN UTC-0 A UTC-6 Y CALIBRACIÓN
======================================================================================
Universidad Mesoamericana - Sede Quetzaltenango
Facultad de Ingeniería en Sistemas - Estadística
Proyecto: Análisis de Ruido y Tendencias en el Laboratorio de Prototipos

Este script:
1. Extrae los registros 100% REALES de la tabla "Registros" en Supabase PostgreSQL.
   (Maneja caracteres especiales como '#' en la contraseña mediante conexión por parámetros).
2. Convierte timestamps de UTC-0 a UTC-6 (Hora oficial de Guatemala).
3. Mapea los 4 días reales del monitoreo:
   - 2026-11-03 -> Día 1
   - 2026-11-04 -> Día 2
   - 2026-11-05 -> Día 3
   - 2026-11-06 -> Día 4
4. Genera 'datos_limpios.csv' con las mediciones reales en dBFS y su escala acústica dBA.
"""

import os
import sys
import re
from datetime import datetime
import zoneinfo

try:
    import psycopg2
except ImportError:
    psycopg2 = None

# Rutas del proyecto
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
ENV_PATH = os.path.join(PROJECT_ROOT, ".env")
OUTPUT_CSV = os.path.join(BASE_DIR, "datos_limpios.csv")

# Zonas Horarias
TZ_UTC = zoneinfo.ZoneInfo("UTC")
TZ_GUATEMALA = zoneinfo.ZoneInfo("America/Guatemala")

# Parámetros normativos
UMBRAL_DBFS = -40.0
UMBRAL_DBA = 65.0  # Límite OMS/ISO para talleres y laboratorios


def cargar_env(filepath):
    config = {}
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    config[key.strip()] = val.strip().strip('"').strip("'")
    return config


def parsear_database_url(url: str):
    """
    Parsea URLs de postgresql://user:password@host:port/dbname
    soportando caracteres especiales en la contraseńa como '#' que rompen urllib.
    """
    m = re.match(r"^postgresql://([^:]+):(.*)@([^:/]+):(\d+)/(.*)$", url)
    if m:
        user = m.group(1)
        password = m.group(2)
        host = m.group(3)
        port = int(m.group(4))
        dbname = m.group(5).split("?")[0]
        return {
            "host": host,
            "port": port,
            "user": user,
            "password": password,
            "dbname": dbname,
            "sslmode": "require",
            "connect_timeout": 10
        }
    return None


def dbfs_a_dba(dbfs):
    """Convierte dBFS a dBA aproximado: dBA = dBFS + 105 (OMS / Sonometría)."""
    return round(float(dbfs) + 105.0, 2)


def extraer_datos_reales_supabase(env_config):
    if not psycopg2:
        raise RuntimeError("psycopg2 no está instalado en el entorno.")

    db_url = env_config.get("DATABASE_URL", "")
    params = parsear_database_url(db_url)
    if not params:
        # Fallback a credenciales conocidas del proyecto
        params = {
            "host": "aws-0-us-east-2.pooler.supabase.com",
            "port": 6543,
            "user": "postgres.qnuwzacoysjcdirodjve",
            "password": "Alphamike21#1503",
            "dbname": "postgres",
            "sslmode": "require",
            "connect_timeout": 10
        }

    print(f"[CONEXIÓN] Conectando a Supabase PostgreSQL ({params['host']}:{params['port']})...")
    conn = psycopg2.connect(**params)
    cur = conn.cursor()
    cur.execute("""
        SELECT id, created_at, "Dia", "decibeles", "picoactual", "superaumbral"
        FROM "Registros"
        ORDER BY created_at ASC;
    """)
    filas = cur.fetchall()
    conn.close()
    print(f"[OK] Se obtuvieron {len(filas)} registros reales directamente de la base de datos.")
    return filas


def procesar_registros(filas):
    """
    Procesa las filas crudas:
    - Convierte created_at (UTC-0) a UTC-6 (Guatemala)
    - Asigna día 1, 2, 3 o 4 según la fecha local
    - Calcula dBA y umbrales normativos
    """
    nombres_dias = {
        "2026-11-03": (1, "Día 1 (2026-11-03)"),
        "2026-11-04": (2, "Día 2 (2026-11-04)"),
        "2026-11-05": (3, "Día 3 (2026-11-05)"),
        "2026-11-06": (4, "Día 4 (2026-11-06)")
    }

    registros_limpios = []
    for fila in filas:
        id_val, dt_utc_orig, dia_orig, db_val, pico_val, supera_orig = fila

        if dt_utc_orig is None:
            continue

        # Asegurar timezone UTC
        if dt_utc_orig.tzinfo is None:
            dt_utc = dt_utc_orig.replace(tzinfo=TZ_UTC)
        else:
            dt_utc = dt_utc_orig.astimezone(TZ_UTC)

        # Conversión oficial: UTC-0 a UTC-6 (Guatemala)
        dt_guate = dt_utc.astimezone(TZ_GUATEMALA)
        fecha_str_guate = dt_guate.strftime("%Y-%m-%d")

        dia_num, dia_nom = nombres_dias.get(fecha_str_guate, (1, f"Día ({fecha_str_guate})"))

        if db_val is None:
            continue

        db_num = round(float(db_val), 2)
        pico_num = round(float(pico_val), 2) if pico_val is not None else db_num
        dba_val = dbfs_a_dba(db_num)
        pico_dba_val = dbfs_a_dba(pico_num)

        supera = bool(db_num >= UMBRAL_DBFS or dba_val >= UMBRAL_DBA)

        registros_limpios.append({
            "id": id_val,
            "timestamp_utc": dt_utc.strftime("%Y-%m-%d %H:%M:%S+00"),
            "timestamp_utc6": dt_guate.strftime("%Y-%m-%d %H:%M:%S"),
            "dia_fecha": fecha_str_guate,
            "dia_numero": dia_num,
            "dia_nombre": dia_nom,
            "hora_texto": dt_guate.strftime("%H:%M"),
            "hora_decimal": round(dt_guate.hour + dt_guate.minute / 60.0 + dt_guate.second / 3600.0, 4),
            "decibeles_dbfs": db_num,
            "pico_dbfs": pico_num,
            "decibeles_dba": dba_val,
            "pico_dba": pico_dba_val,
            "supera_umbral": 1 if supera else 0,
            "umbral_normativo_dba": UMBRAL_DBA
        })

    return registros_limpios


def exportar_csv(registros, destino):
    import csv
    columnas = [
        "id", "timestamp_utc", "timestamp_utc6", "dia_fecha", "dia_numero", "dia_nombre",
        "hora_texto", "hora_decimal", "decibeles_dbfs", "pico_dbfs",
        "decibeles_dba", "pico_dba", "supera_umbral", "umbral_normativo_dba"
    ]
    with open(destino, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columnas)
        writer.writeheader()
        for r in registros:
            writer.writerow(r)
    print(f"[ÉXITO] Archivo generado con {len(registros)} registros reales en:")
    print(f"        -> {destino}")


def main():
    env = cargar_env(ENV_PATH)
    filas = extraer_datos_reales_supabase(env)
    registros = procesar_registros(filas)
    exportar_csv(registros, OUTPUT_CSV)


if __name__ == "__main__":
    main()
