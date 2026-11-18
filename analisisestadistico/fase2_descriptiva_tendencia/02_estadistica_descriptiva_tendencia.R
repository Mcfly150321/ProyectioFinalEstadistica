# ==============================================================================
# FASE 2: ESTADÍSTICA DESCRIPTIVA Y PROYECCIÓN DE TENDENCIA (DÍA 6)
# ==============================================================================
# Proyecto: Análisis de Ruido y Tendencias en el Laboratorio de Prototipos
# Universidad Mesoamericana - Facultad de Ingeniería en Sistemas
# Cátedra: Estadística - Ing. Josué Cifuentes
# ==============================================================================

options(warn = -1, digits = 4)

# 1. Localización del archivo de datos limpios
ruta_posible_1 <- file.path("..", "fase1_extraccion_normativa", "datos_limpios.csv")
ruta_posible_2 <- file.path("fase1_extraccion_normativa", "datos_limpios.csv")
ruta_posible_3 <- "datos_limpios.csv"

if (file.exists(ruta_posible_1)) {
  ruta_datos <- ruta_posible_1
} else if (file.exists(ruta_posible_2)) {
  ruta_datos <- ruta_posible_2
} else if (file.exists(ruta_posible_3)) {
  ruta_datos <- ruta_posible_3
} else {
  stop("No se encontró 'datos_limpios.csv'. Ejecuta primero extraer_datos.py en Fase 1.")
}

datos <- read.csv(ruta_datos, stringsAsFactors = FALSE)

# Crear directorio de salida para gráficas si no existe
carpeta_graficas <- "graficas"
if (!dir.exists(carpeta_graficas)) dir.create(carpeta_graficas, recursive = TRUE)

# ==============================================================================
# PARTE A: ESTADÍSTICA DESCRIPTIVA COMPLETA
# ==============================================================================
# Función para calcular la moda muestral
calcular_moda <- function(x) {
  # Redondear a 1 decimal para agrupar lecturas continuas de decibeles
  x_redondeado <- round(x, 1)
  tabla_freq <- table(x_redondeado)
  max_freq <- max(tabla_freq)
  modas <- as.numeric(names(tabla_freq)[tabla_freq == max_freq])
  return(list(valor = modas, frecuencia = max_freq))
}

serie_dba <- datos$decibeles_dba
serie_dbfs <- datos$decibeles_dbfs

# Estadísticos en escala dBA (Acústica)
media_dba     <- mean(serie_dba)
mediana_dba   <- median(serie_dba)
moda_info_dba <- calcular_moda(serie_dba)
varianza_dba  <- var(serie_dba)
desv_est_dba  <- sd(serie_dba)
cv_dba        <- (desv_est_dba / media_dba) * 100
min_dba       <- min(serie_dba)
max_dba       <- max(serie_dba)
q1_dba        <- quantile(serie_dba, 0.25)
q3_dba        <- quantile(serie_dba, 0.75)
iqr_dba       <- IQR(serie_dba)

# Estadísticos en escala dBFS (Digital Sensor)
media_dbfs    <- mean(serie_dbfs)
mediana_dbfs  <- median(serie_dbfs)
varianza_dbfs <- var(serie_dbfs)
desv_est_dbfs <- sd(serie_dbfs)

cat("\n====================================================================\n")
cat(" FASE 2: MEMORIA DE CÁLCULO - ESTADÍSTICA DESCRIPTIVA\n")
cat("====================================================================\n")
cat(sprintf("Total de observaciones analizadas (N) : %d\n\n", length(serie_dba)))

cat("--- Medidas de Tendencia Central (dBA) ---\n")
cat(sprintf("• Media Aritmética (x̄)       : %8.2f dBA (dBFS: %.2f dB)\n", media_dba, media_dbfs))
cat(sprintf("• Mediana (Me)               : %8.2f dBA (dBFS: %.2f dB)\n", mediana_dba, mediana_dbfs))
cat(sprintf("• Moda (Mo)                  : %8.2f dBA (Aparece %d veces)\n", moda_info_dba$valor[1], moda_info_dba$frecuencia))

cat("\n--- Medidas de Dispersión y Variabilidad (dBA) ---\n")
cat(sprintf("• Varianza Muestral (s²)     : %8.2f dBA² (dBFS: %.2f dB²)\n", varianza_dba, varianza_dbfs))
cat(sprintf("• Desviación Estándar (s)    : %8.2f dBA  (dBFS: %.2f dB)\n", desv_est_dba, desv_est_dbfs))
cat(sprintf("• Coeficiente de Variación   : %8.2f %%\n", cv_dba))
cat(sprintf("• Rango [Mín, Máx]           : [%.2f, %.2f] dBA\n", min_dba, max_dba))
cat(sprintf("• Rango Intercuartílico (IQR): %8.2f dBA (Q1=%.2f, Q3=%.2f)\n", iqr_dba, q1_dba, q3_dba))

# Generar Gráficas Descriptivas en PNG
archivo_png_desc <- file.path(carpeta_graficas, "01_distribucion_y_boxplot.png")
png(archivo_png_desc, width = 1100, height = 550, res = 120)
par(mfrow = c(1, 2), mar = c(4.5, 4.5, 3.5, 1.5))

# Histograma con curva de densidad
hist(serie_dba, breaks = 15, col = "#85C1E9", border = "#2874A6",
     main = "Histograma de Niveles de Ruido",
     xlab = "Nivel de Ruido (dBA)", ylab = "Frecuencia Absoluta",
     cex.main = 1.1, font.main = 2)
abline(v = media_dba, col = "#C0392B", lwd = 2.5, lty = 1)
abline(v = mediana_dba, col = "#27AE60", lwd = 2.5, lty = 2)
abline(v = 65.0, col = "#D35400", lwd = 2, lty = 3)
legend("topright", legend = c("Media", "Mediana", "Umbral Riesgo (65 dBA)"),
       col = c("#C0392B", "#27AE60", "#D35400"), lty = c(1, 2, 3), lwd = 2, bty = "n", cex = 0.85)

# Boxplot por Día
boxplot(decibeles_dba ~ dia_nombre, data = datos,
        col = c("#D4E6F1", "#A9CCE3", "#7FB3D5", "#5499C7"),
        border = "#1B4F72", main = "Dispersión Acústica por Día",
        xlab = "Día Monitoreado", ylab = "Nivel de Ruido (dBA)",
        cex.main = 1.1, font.main = 2, las = 1)
abline(h = 65.0, col = "#D35400", lwd = 2, lty = 3)

par(mfrow = c(1, 1))
dev.off()
cat(sprintf("\n[OK] Gráfica descriptiva guardada en: %s\n", archivo_png_desc))


# ==============================================================================
# PARTE B: ANÁLISIS DE TENDENCIA HORARIA Y PROYECCIÓN AL DÍA 6 (LUNES)
# ==============================================================================
# El instructivo solicita seleccionar una hora específica (ej. franja matutina 09:30 hrs)
# para extraer ese registro a lo largo de los días y proyectar la tendencia al Día 6.
HORA_OBJETIVO <- "09:30"
hora_dec_obj  <- 9.5  # 09:30 hrs (hora local UTC-6 Guatemala)

dias_disponibles <- sort(unique(datos$dia_numero))
indices_hora <- sapply(dias_disponibles, function(d) {
  sub_idx <- which(datos$dia_numero == d)
  diffs <- abs(datos$hora_decimal[sub_idx] - hora_dec_obj)
  sub_idx[which.min(diffs)]
})
datos_hora <- datos[indices_hora, ]

cat("\n====================================================================\n")
cat(sprintf(" ANÁLISIS DE TENDENCIA A HORA ESPECÍFICA: FRANJA DE LAS %s HRS\n", HORA_OBJETIVO))
cat("====================================================================\n")
cat("--- Registros Extraídos para la Franja (Más cercanos a las 09:30 hrs) ---\n")
print(datos_hora[, c("dia_numero", "dia_nombre", "timestamp_utc6", "hora_texto", "decibeles_dba", "pico_dba", "supera_umbral")],
      row.names = FALSE)

# Ajuste del Modelo de Regresión Lineal Simple: y = b0 + b1 * x
# Donde x = Día (1 a 4), y = decibeles_dba a las 12:45 hrs
modelo_regresion <- lm(decibeles_dba ~ dia_numero, data = datos_hora)
resumen_modelo   <- summary(modelo_regresion)

beta_0 <- coef(modelo_regresion)[1]  # Intercepto
beta_1 <- coef(modelo_regresion)[2]  # Pendiente de tendencia
r_cuadrado <- resumen_modelo$r.squared
p_valor    <- coef(resumen_modelo)[2, "Pr(>|t|)"]

cat("\n--- Ecuación del Modelo de Tendencia Lineal ---\n")
cat(sprintf("ŷ = %.4f + (%.4f) * Día\n", beta_0, beta_1))
cat(sprintf("Coeficiente de Determinación (R²) : %.4f (Explica el %.2f%% de la variación)\n",
            r_cuadrado, r_cuadrado * 100))
cat(sprintf("Pendiente estimada (β₁)           : %+.4f dBA por día\n", beta_1))

# PROYECCIÓN PARA EL SEXTO DÍA (Lunes, x = 6)
dia_proyectado <- data.frame(dia_numero = 6)
prediccion_dia6 <- predict(modelo_regresion, newdata = dia_proyectado,
                           interval = "prediction", level = 0.95)

estimacion_puntual <- prediccion_dia6[1, "fit"]
limite_inferior    <- prediccion_dia6[1, "lwr"]
limite_superior    <- prediccion_dia6[1, "upr"]

cat("\n====================================================================\n")
cat(sprintf(" RESULTADO DE LA PROYECCIÓN PARA EL DÍA 6 (LUNES) A LAS %s HRS\n", HORA_OBJETIVO))
cat("====================================================================\n")
cat(sprintf("• Estimación Puntual para Día 6   : %8.2f dBA\n", estimacion_puntual))
cat(sprintf("• Intervalo de Predicción (95%%)   : [%.2f dBA, %.2f dBA]\n",
            limite_inferior, limite_superior))
cat(sprintf("• Umbral Normativo de Riesgo      : %8.2f dBA\n", 65.0))

if (estimacion_puntual >= 65.0) {
  cat("\n[ALERTA DE RIESGO ACÚSTICO]:\n")
  cat("La proyección para el Día 6 a las 12:45 hrs SUPERA el umbral normativo.\n")
  cat(sprintf("Se proyecta un exceso de +%.2f dBA sobre el estándar de concentración.\n",
              estimacion_puntual - 65.0))
} else {
  cat("\n[ESTADO FAVORABLE]:\n")
  cat("La proyección puntual se mantiene por debajo del límite de riesgo.\n")
}

# Gráfica de Tendencia y Proyección
archivo_png_tend <- file.path(carpeta_graficas, "02_tendencia_dia6.png")
png(archivo_png_tend, width = 850, height = 550, res = 120)
par(mar = c(4.8, 4.8, 3.5, 2))

# Rango de graficación de Día 1 a Día 6
dias_eje <- 1:6
plot(datos_hora$dia_numero, datos_hora$decibeles_dba,
     xlim = c(1, 6.5),
     ylim = c(min(datos_hora$decibeles_dba, limite_inferior) - 4,
              max(datos_hora$decibeles_dba, limite_superior, 68) + 4),
     pch = 19, col = "#2980B9", cex = 1.8,
     xlab = "Día de Monitoreo", ylab = "Nivel de Ruido a las 12:45 hrs (dBA)",
     main = sprintf("Proyección de Tendencia Acústica para el Día 6 (%s hrs)", HORA_OBJETIVO),
     xaxt = "n", cex.main = 1.1, font.main = 2)

axis(1, at = 1:6, labels = c("Día 1\n(Jue)", "Día 2\n(Vie)", "Día 3\n(Sáb)", "Día 4\n(Dom)", "Día 5\n(Extrap)", "Día 6\n(Lunes)"),
     padj = 0.4)

# Recta de regresión ajustada
abline(modelo_regresion, col = "#2980B9", lwd = 2.5)

# Dibujar punto proyectado Día 6
points(6, estimacion_puntual, pch = 17, col = "#C0392B", cex = 2.2)

# Barra de error (Intervalo de predicción 95%)
arrows(6, limite_inferior, 6, limite_superior, length = 0.08, angle = 90, code = 3, col = "#C0392B", lwd = 2)

# Línea del umbral de riesgo normativo (65 dBA)
abline(h = 65.0, col = "#D35400", lwd = 2, lty = 2)

legend("topleft",
       legend = c("Lecturas Observadas (Días 1-4)",
                  "Tendencia Lineal (ŷ)",
                  "Proyección Día 6 (Lunes)",
                  "Intervalo de Predicción 95%",
                  "Umbral de Riesgo (65 dBA)"),
       col = c("#2980B9", "#2980B9", "#C0392B", "#C0392B", "#D35400"),
       pch = c(19, NA, 17, NA, NA),
       lty = c(NA, 1, NA, 1, 2),
       lwd = c(NA, 2.5, NA, 2, 2),
       bty = "n", cex = 0.85)

dev.off()
cat(sprintf("[OK] Gráfica de tendencia proyectada guardada en: %s\n", archivo_png_tend))
cat("====================================================================\n")
