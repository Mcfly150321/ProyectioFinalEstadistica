#!/usr/bin/env Rscript

# ==============================================================================
# SIMULACIÓN Y COMPUTACIÓN ESTADÍSTICA EN VIVO (R CORE ENGINE)
# Cátedra de Estadística -- Universidad Mesoamericana Sede Quetzaltenango
# ==============================================================================

options(warn = -1)

args <- commandArgs(trailingOnly = TRUE)
csv_file <- ifelse(length(args) >= 1, args[1], "datos_live.csv")

if (!file.exists(csv_file)) {
  posibles <- c(
    csv_file,
    file.path("backend", "datos_live.csv"),
    file.path("..", "datos_live.csv"),
    file.path("analisisestadistico", "fase1_extraccion_normativa", "datos_limpios.csv")
  )
  for (p in posibles) {
    if (file.exists(p)) {
      csv_file <- p
      break
    }
  }
}

if (!file.exists(csv_file)) {
  cat('{"status": "error", "message": "Archivo CSV de datos no encontrado"}')
  quit(status = 0)
}

df <- read.csv(csv_file, stringsAsFactors = FALSE)

valores_dba <- as.numeric(df[["decibeles_dba"]])
valores_dba <- valores_dba[!is.na(valores_dba)]
n <- length(valores_dba)

if (n == 0) {
  cat('{"status": "error", "message": "Dataset vacio o sin mediciones dBA validas"}')
  quit(status = 0)
}

# 1. Medidas de Tendencia Central y Dispersión (Fase 2)
media <- mean(valores_dba)
mediana <- median(valores_dba)

frec <- table(round(valores_dba, 1))
moda <- as.numeric(names(frec)[which.max(frec)])

varianza <- var(valores_dba)
desv <- sd(valores_dba)
cv <- (desv / media) * 100
min_v <- min(valores_dba)
max_v <- max(valores_dba)
q1 <- as.numeric(quantile(valores_dba, 0.25))
q3 <- as.numeric(quantile(valores_dba, 0.75))
iqr_v <- IQR(valores_dba)

# 2. Auditoría Normativa y Ensayo de Bernoulli (Fases 1 y 3)
umbral <- 65.0
excesos <- sum(valores_dba >= umbral)
pct_excesos <- (excesos / n) * 100
p_b <- excesos / n
q_b <- 1 - p_b

# 3. Modelo Binomial para n = 3 Cubículos de Prototipado
p_bin3_0 <- dbinom(0, size = 3, prob = p_b)
p_bin3_1 <- dbinom(1, size = 3, prob = p_b)
p_bin3_2 <- dbinom(2, size = 3, prob = p_b)
p_bin3_3 <- dbinom(3, size = 3, prob = p_b)
riesgo3 <- 1 - p_bin3_0 # P(X >= 1)

# 4. Modelo Binomial para n = 7 Estaciones Totales
p_bin7_0 <- dbinom(0, size = 7, prob = p_b)
p_bin7_1 <- dbinom(1, size = 7, prob = p_b)
p_bin7_2 <- dbinom(2, size = 7, prob = p_b)
riesgo7 <- 1 - (p_bin7_0 + p_bin7_1) # P(X >= 2)

# 5. Regresión Lineal de Tendencia
if ("dia_numero" %in% names(df) && "hora_decimal" %in% names(df)) {
  matutinos <- df[df[["hora_decimal"]] >= 9.0 & df[["hora_decimal"]] <= 12.0, ]
  if (nrow(matutinos) >= 3) {
    mod <- lm(decibeles_dba ~ dia_numero, data = matutinos)
    b0 <- as.numeric(coef(mod)[1])
    b1 <- as.numeric(coef(mod)[2])
    r2 <- as.numeric(summary(mod)$r.squared)
    pred_dia6 <- b0 + b1 * 6
  } else {
    mod_global <- lm(decibeles_dba ~ seq_along(valores_dba), data = df)
    b0 <- as.numeric(coef(mod_global)[1])
    b1 <- as.numeric(coef(mod_global)[2])
    r2 <- as.numeric(summary(mod_global)$r.squared)
    pred_dia6 <- b0 + b1 * (n + 1)
  }
} else {
  b0 <- media
  b1 <- 0.0
  r2 <- 0.0
  pred_dia6 <- media
}

# 6. Datos del Último Registro Acumulado
ultimo_reg <- tail(df, 1)
ultimo_id <- ifelse("id" %in% names(ultimo_reg), as.numeric(ultimo_reg[["id"]]), n)
ultimo_fecha <- ifelse("dia_fecha" %in% names(ultimo_reg), as.character(ultimo_reg[["dia_fecha"]]), "")
ultimo_hora <- ifelse("hora_texto" %in% names(ultimo_reg), as.character(ultimo_reg[["hora_texto"]]), "")
ultimo_dba <- ifelse("decibeles_dba" %in% names(ultimo_reg), as.numeric(ultimo_reg[["decibeles_dba"]]), media)
ultimo_supera <- (ultimo_dba >= umbral)

# Construir JSON estructurado y seguro
json_str <- sprintf(
'{
  "status": "success",
  "timestamp_computo": "%s",
  "n_total": %d,
  "ultimo_registro": {
    "id": %d,
    "fecha": "%s",
    "hora": "%s",
    "decibeles_dba": %.2f,
    "supera_umbral": %s
  },
  "descriptiva": {
    "media": %.2f,
    "mediana": %.2f,
    "moda": %.2f,
    "varianza": %.2f,
    "desv_estandar": %.2f,
    "cv_pct": %.2f,
    "min": %.2f,
    "max": %.2f,
    "q1": %.2f,
    "q3": %.2f,
    "iqr": %.2f
  },
  "normativa": {
    "umbral_dba": %.1f,
    "total_excesos": %d,
    "pct_excesos": %.2f,
    "p_bernoulli": %.4f,
    "q_bernoulli": %.4f
  },
  "binomial_3_cubiculos": {
    "n": 3,
    "p_x0": %.4f,
    "p_x1": %.4f,
    "p_x2": %.4f,
    "p_x3": %.4f,
    "riesgo_critico_ge1": %.4f
  },
  "binomial_7_estaciones": {
    "n": 7,
    "p_x0": %.4f,
    "p_x1": %.4f,
    "p_x2": %.4f,
    "riesgo_ge2": %.4f
  },
  "regresion_tendencia": {
    "intercepto_b0": %.2f,
    "pendiente_b1": %.2f,
    "r2": %.4f,
    "proyeccion_dia6": %.2f
  }
}',
  format(Sys.time(), "%Y-%m-%d %H:%M:%S"),
  n,
  ultimo_id,
  ultimo_fecha,
  ultimo_hora,
  ultimo_dba,
  ifelse(ultimo_supera, "true", "false"),
  media,
  mediana,
  moda,
  varianza,
  desv,
  cv,
  min_v,
  max_v,
  q1,
  q3,
  iqr_v,
  umbral,
  excesos,
  pct_excesos,
  p_b,
  q_b,
  p_bin3_0,
  p_bin3_1,
  p_bin3_2,
  p_bin3_3,
  riesgo3,
  p_bin7_0,
  p_bin7_1,
  p_bin7_2,
  riesgo7,
  b0,
  b1,
  r2,
  pred_dia6
)

cat(json_str)
