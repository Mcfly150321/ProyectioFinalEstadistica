# ==============================================================================
# FASE 1: AUDITORÍA NORMATIVA Y COMPARACIÓN DE UMBRALES EN RSTUDIO
# ==============================================================================
# Proyecto: Análisis de Ruido y Tendencias en el Laboratorio de Prototipos
# Universidad Mesoamericana - Facultad de Ingeniería en Sistemas
# Cátedra: Estadística - Ing. Josué Cifuentes
# ==============================================================================

# 1. Configuración de Entorno y Rutas
options(warn = -1, digits = 4)

ruta_datos <- "datos_limpios.csv"
if (!file.exists(ruta_datos)) {
  # Si se ejecuta desde la raíz de analisisestadistico
  ruta_datos <- file.path("fase1_extraccion_normativa", "datos_limpios.csv")
}

cat("====================================================================\n")
cat(" FASE 1: RECOLECCIÓN, ZONA HORARIA UTC-6 Y UMBRALES NORMATIVOS\n")
cat("====================================================================\n\n")

if (!file.exists(ruta_datos)) {
  stop("El archivo datos_limpios.csv no existe. Ejecuta primero extraer_datos.py.")
}

# 2. Carga de Datos
datos <- read.csv(ruta_datos, stringsAsFactors = FALSE)
cat(sprintf("Registros cargados exitosamente: %d filas\n", nrow(datos)))
cat(sprintf("Rango temporal (UTC-6 Guatemala): %s hasta %s\n\n",
            min(datos$timestamp_utc6), max(datos$timestamp_utc6)))

# 3. Definición del Marco Normativo
# Límite OMS / ISO 1996 para laboratorios y aulas técnicas: 65 dBA (-40 dBFS)
umbral_dba <- unique(datos$umbral_normativo_dba)[1]
if (is.na(umbral_dba)) umbral_dba <- 65.0
umbral_dbfs <- -40.0

cat(sprintf("Umbral Normativo Establecido: %.1f dBA (Equivalente: %.1f dBFS)\n",
            umbral_dba, umbral_dbfs))
cat("Norma de referencia: OMS / ISO 1996 / AG 229-2014 MinTrabajo\n\n")

# 4. Tabla de Resumen por Día
cat("--- RESUMEN POR DÍA DE MONITOREO (HORA LOCAL UTC-6) ---\n")
resumen_dias <- aggregate(
  cbind(decibeles_dba, pico_dba, supera_umbral) ~ dia_numero + dia_nombre,
  data = datos,
  FUN = function(x) c(Media = mean(x), Max = max(x), Suma = sum(x), N = length(x))
)

# Aplanar el data.frame resultante para presentación limpia
resumen_tabla <- data.frame(
  Dia = resumen_dias$dia_nombre,
  Muestras = resumen_dias$decibeles_dba[, "N"],
  Media_dBA = round(resumen_dias$decibeles_dba[, "Media"], 2),
  Pico_Max_dBA = round(resumen_dias$pico_dba[, "Max"], 2),
  Excesos = resumen_dias$supera_umbral[, "Suma"],
  Pct_Exceso = round((resumen_dias$supera_umbral[, "Suma"] / resumen_dias$decibeles_dba[, "N"]) * 100, 2)
)

print(resumen_tabla, row.names = FALSE)

# 5. Diagnóstico Global del Laboratorio
total_excesos <- sum(datos$supera_umbral)
pct_global_exceso <- (total_excesos / nrow(datos)) * 100

cat("\n--- DIAGNÓSTICO ACÚSTICO GLOBAL ---\n")
cat(sprintf("Total de lecturas evaluadas (cada 15 min): %d\n", nrow(datos)))
cat(sprintf("Lecturas que exceden la norma (>= %.1f dBA): %d (%.2f%% del tiempo)\n",
            umbral_dba, total_excesos, pct_global_exceso))

if (pct_global_exceso > 20) {
  cat("Conclusión Normativa: CONDICIÓN DE RIESGO ACÚSTICO DETECTADA.\n")
  cat("El nivel sonoro excede recurrentemente el umbral para ambientes educativos,\n")
  cat("justificando el modelo probabilístico (Fase 3) y medidas de mitigación (Fase 4).\n")
} else {
  cat("Conclusión Normativa: NIVELES GENERALMENTE ACEPTABLES.\n")
}
cat("====================================================================\n")
