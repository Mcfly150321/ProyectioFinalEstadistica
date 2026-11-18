# ==============================================================================
# FASE 3: MODELADO PROBABILÍSTICO (BERNOULLI Y BINOMIAL)
# ==============================================================================
# Proyecto: Análisis de Ruido y Tendencias en el Laboratorio de Prototipos
# Universidad Mesoamericana - Facultad de Ingeniería en Sistemas
# Cátedra: Estadística - Ing. Josué Cifuentes
# ==============================================================================

options(warn = -1, digits = 4)

# 1. Carga del Dataset Limpio
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
  stop("No se encontró 'datos_limpios.csv'. Ejecuta primero extraer_datos.py.")
}

datos <- read.csv(ruta_datos, stringsAsFactors = FALSE)

carpeta_graficas <- "graficas"
if (!dir.exists(carpeta_graficas)) dir.create(carpeta_graficas, recursive = TRUE)

# ==============================================================================
# 1. ENSAYO Y DISTRIBUCIÓN DE BERNOULLI
# ==============================================================================
# Definición formal:
# Sea Y la variable indicadora del estado acústico en un intervalo/cubículo:
# Y = 1 si decibeles >= 65.0 dBA (Éxito = Ruido excede umbral de riesgo normativo)
# Y = 0 si decibeles <  65.0 dBA (Fracaso = Nivel acústico conforme a la norma)

total_ensayos <- nrow(datos)
total_excesos <- sum(datos$supera_umbral)

# Estimación puntual de la probabilidad p (frecuencia relativa muestral)
p_estimada <- total_excesos / total_ensayos
q_estimada <- 1 - p_estimada

# Error estándar e intervalo de confianza al 95% para p (Wilson / Wald)
z_critico <- qnorm(0.975)
se_p <- sqrt((p_estimada * q_estimada) / total_ensayos)
ci_p_inf <- max(0, p_estimada - z_critico * se_p)
ci_p_sup <- min(1, p_estimada + z_critico * se_p)

# Parámetros del modelo de Bernoulli
esperanza_bernoulli <- p_estimada
varianza_bernoulli  <- p_estimada * q_estimada
desv_bernoulli      <- sqrt(varianza_bernoulli)

cat("====================================================================\n")
cat(" FASE 3: MODELADO PROBABILÍSTICO DE RIESGO ACÚSTICO\n")
cat("====================================================================\n\n")

cat("--- PARTE A: MODELO DE BERNOULLI ---\n")
cat(sprintf("• Total de mediciones registradas (N)   : %d\n", total_ensayos))
cat(sprintf("• Eventos con exceso de ruido (Y = 1)   : %d\n", total_excesos))
cat(sprintf("• Probabilidad estimada de exceso (p)   : %.4f (%.2f%%)\n", p_estimada, p_estimada * 100))
cat(sprintf("• Probabilidad de ruido conforme (q=1-p): %.4f (%.2f%%)\n", q_estimada, q_estimada * 100))
cat(sprintf("• Intervalo de Confianza al 95%% para p  : [%.4f, %.4f]\n", ci_p_inf, ci_p_sup))
cat(sprintf("• Valor Esperado E[Y]                   : %.4f\n", esperanza_bernoulli))
cat(sprintf("• Varianza Var(Y)                       : %.4f\n", varianza_bernoulli))
cat(sprintf("• Desviación Estándar σ                 : %.4f\n\n", desv_bernoulli))


# ==============================================================================
# 2. MODELO BINOMIAL EN ESCENARIO DE OCUPACIÓN TOTAL
# ==============================================================================
# Configuración física del Laboratorio de Prototipos de la UMES:
# - El micrófono monitoreó el área de 3 cubículos cerrados/semicerrados.
# - El salón completo incluye además 4 mesas grandes de trabajo (~40 personas).

# CASO 1: Ocupación total de los 3 cubículos principales (n = 3)
n_cubiculos <- 3
k_valores_cub <- 0:n_cubiculos

# Probabilidades puntuales P(X = k) y acumuladas P(X <= k)
prob_puntual_cub <- dbinom(k_valores_cub, size = n_cubiculos, prob = p_estimada)
prob_acum_cub    <- pbinom(k_valores_cub, size = n_cubiculos, prob = p_estimada)
prob_mayor_cub   <- 1 - pbinom(k_valores_cub - 1, size = n_cubiculos, prob = p_estimada)

tabla_binomial_cub <- data.frame(
  k_Excesos = k_valores_cub,
  P_X_eq_k  = round(prob_puntual_cub, 4),
  P_X_le_k  = round(prob_acum_cub, 4),
  P_X_ge_k  = round(prob_mayor_cub, 4),
  Porcentaje = paste0(round(prob_puntual_cub * 100, 2), "%")
)

esperanza_binom_cub <- n_cubiculos * p_estimada
varianza_binom_cub  <- n_cubiculos * p_estimada * q_estimada
desv_binom_cub      <- sqrt(varianza_binom_cub)

cat("--- PARTE B: DISTRIBUCIÓN BINOMIAL (3 CUBÍCULOS LLENOS, n = 3) ---\n")
cat(sprintf("E[X] = n * p = %d * %.4f = %.2f cubículos ruidosos en promedio\n",
            n_cubiculos, p_estimada, esperanza_binom_cub))
cat(sprintf("Var(X) = n * p * q = %.4f | Desviación Estándar σ = %.4f\n\n",
            varianza_binom_cub, desv_binom_cub))
print(tabla_binomial_cub, row.names = FALSE)

# Probabilidades críticas para el reporte:
p_al_menos_uno_cub <- 1 - dbinom(0, size = n_cubiculos, prob = p_estimada)
p_mayoria_cub      <- sum(dbinom(2:3, size = n_cubiculos, prob = p_estimada))
p_todos_llenos_cub <- dbinom(3, size = n_cubiculos, prob = p_estimada)

cat("\n--- Análisis de Escenarios Críticos (3 Cubículos) ---\n")
cat(sprintf("• P(Al menos 1 cubículo exceda el umbral, X >= 1) : %.4f (%.2f%%)\n",
            p_al_menos_uno_cub, p_al_menos_uno_cub * 100))
cat(sprintf("• P(La mayoría exceda el umbral, X >= 2)          : %.4f (%.2f%%)\n",
            p_mayoria_cub, p_mayoria_cub * 100))
cat(sprintf("• P(Saturación total acústica, X = 3)              : %.4f (%.2f%%)\n\n",
            p_todos_llenos_cub, p_todos_llenos_cub * 100))


# ==============================================================================
# CASO 2: EXTENSIÓN A ESCENARIO GLOBAL DEL LABORATORIO (n = 7 zonas de trabajo)
# (3 Cubículos + 4 Mesas Grandes con 40 estudiantes)
# ==============================================================================
n_global <- 7
k_global <- 0:n_global
prob_puntual_glob <- dbinom(k_global, size = n_global, prob = p_estimada)

esperanza_glob <- n_global * p_estimada
prob_critica_lab <- 1 - pbinom(3, size = n_global, prob = p_estimada) # P(X >= 4)

cat("--- PARTE C: MODELO EXTENDIDO (3 Cubículos + 4 Mesas = 7 Estaciones, ~40 personas) ---\n")
cat(sprintf("• Estaciones ruidosas esperadas E[X] = 7 * %.4f = %.2f estaciones\n",
            p_estimada, esperanza_glob))
cat(sprintf("• P(Más de la mitad de estaciones excedan la norma, X >= 4): %.4f (%.2f%%)\n\n",
            prob_critica_lab, prob_critica_lab * 100))


# ==============================================================================
# 3. GENERACIÓN DE GRÁFICAS DE PROBABILIDAD (PNG)
# ==============================================================================
archivo_png_binom <- file.path(carpeta_graficas, "03_distribucion_binomial.png")
png(archivo_png_binom, width = 1100, height = 550, res = 120)
par(mfrow = c(1, 2), mar = c(4.5, 4.5, 3.5, 1.5))

# Gráfico 1: Masa de Probabilidad para n = 3 Cubículos
colores_cub <- c("#2ECC71", "#F39C12", "#E67E22", "#E74C3C")
bp1 <- barplot(prob_puntual_cub, names.arg = paste("k =", k_valores_cub),
               col = colores_cub, border = "#1B4F72",
               ylim = c(0, max(prob_puntual_cub) * 1.25),
               xlab = "Número de Cubículos que Superan el Umbral (k)",
               ylab = "Probabilidad P(X = k)",
               main = "Distribución Binomial: 3 Cubículos (n=3)",
               cex.main = 1.1, font.main = 2)
text(bp1, prob_puntual_cub + 0.02,
     labels = paste0(round(prob_puntual_cub * 100, 1), "%"),
     cex = 0.9, font = 2)

# Gráfico 2: Masa de Probabilidad para n = 7 Estaciones (Laboratorio Completo)
colores_glob <- colorRampPalette(c("#27AE60", "#F1C40F", "#E74C3C"))(length(k_global))
bp2 <- barplot(prob_puntual_glob, names.arg = paste0(k_global),
               col = colores_glob, border = "#5D6D7E",
               ylim = c(0, max(prob_puntual_glob) * 1.25),
               xlab = "Estaciones con Exceso de Ruido (k de 7)",
               ylab = "Probabilidad P(X = k)",
               main = "Distribución Binomial: Lab Completo (n=7)",
               cex.main = 1.1, font.main = 2)
text(bp2, prob_puntual_glob + 0.015,
     labels = paste0(round(prob_puntual_glob * 100, 1), "%"),
     cex = 0.8, font = 2)

par(mfrow = c(1, 1))
dev.off()

cat(sprintf("[OK] Gráfica de distribución binomial guardada en: %s\n", archivo_png_binom))
cat("====================================================================\n")
