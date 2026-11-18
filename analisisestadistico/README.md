# Proyecto Final de Estadística: Análisis Acústico y Tendencias en el Laboratorio de Prototipos
**Universidad Mesoamericana - Sede Quetzaltenango**  
**Facultad de Ingeniería, Ingeniería en Sistemas**  
**Catedrático:** Ing. Josué Cifuentes  

---

## 📁 Estructura del Proyecto en `analisisestadistico/`

```text
analisisestadistico/
├── README.md                                  <- Este documento de navegación
│
├── fase1_extraccion_normativa/
│   ├── extraer_datos.py                      <- Conecta a Supabase / genera dataset limpio y convierte UTC a UTC-6
│   ├── datos_limpios.csv                     <- Registros limpios (164 lecturas diurnas cada 15 min, 4 días)
│   ├── normativa_referencia.md               <- Justificación normativa (OMS, ISO 1996, AG 229-2014) y umbral
│   └── 01_analisis_normativa.R               <- Script R para auditoría de umbrales y verificación inicial
│
├── fase2_descriptiva_tendencia/
│   ├── 02_estadistica_descriptiva_tendencia.R<- Script R: Media, mediana, moda, varianza, desv. est.
│   │                                            y Regresión lineal para proyectar Día 6 a las 12:45 hrs
│   └── graficas/                             <- Carpeta donde R guarda los PNGs generados automáticamente
│
├── fase3_probabilidad_binomial/
│   ├── 03_modelo_probabilistico_binomial.R   <- Script R: Ensayos de Bernoulli y Modelo Binomial
│   │                                            para 3 cubículos llenos y 7 estaciones del laboratorio
│   └── graficas/                             <- Gráficas de barras de distribución de probabilidad binomial
│
└── fase4_reporte_mitigacion/
    ├── propuestas_mitigacion.md              <- Plan de mitigación: paneles, cabinas, zonificación horaria y semáforo IoT
    └── 04_reporte_ejecutivo.R                <- Síntesis general de resultados y checklist de evaluación
```

---

## 🎯 Cobertura de la Rúbrica de Evaluación (10 Puntos)

| Criterio | Puntos | Archivo que lo Resuelve | Descripción |
| :--- | :---: | :--- | :--- |
| **Recolección de Datos y RStudio** | 3.0 | `fase1_extraccion_normativa/extraer_datos.py`<br>`datos_limpios.csv`<br>`01_analisis_normativa.R` | Lecturas cada 15 minutos en UTC-6 (Guatemala), tabla estructurada y estándar normativo definido (65 dBA / -40 dBFS). |
| **Estadística Descriptiva y Tendencia (Día 6)** | 2.5 | `fase2_descriptiva_tendencia/02_estadistica_descriptiva_tendencia.R` | Cálculo de media, mediana, moda, varianza, desviación estándar. Extracción a las **12:45 hrs** y proyección al **Día 6 (Lunes)** con intervalo de predicción al 95%. |
| **Modelo Binomial y Riesgo** | 2.5 | `fase3_probabilidad_binomial/03_modelo_probabilistico_binomial.R` | Ensayo de Bernoulli ($p$), modelo Binomial $B(n=3, p)$ con cubículos llenos y cálculo de probabilidad de superación del umbral. |
| **Mitigación y Reporte** | 2.0 | `fase4_reporte_mitigacion/propuestas_mitigacion.md`<br>`04_reporte_ejecutivo.R` | 4 propuestas técnicas concretas (física, maquinaria, horarios y semáforo LED con el ESP32) y reporte consolidado. |

---

## 🚀 Cómo Usarlo en RStudio

1. Abre **RStudio**.
2. En RStudio, ve a `File -> Open Project` o abre directamente la carpeta `analisisestadistico/`.
3. Abre y ejecuta los scripts en orden:
   - `fase1_extraccion_normativa/01_analisis_normativa.R`
   - `fase2_descriptiva_tendencia/02_estadistica_descriptiva_tendencia.R`
   - `fase3_probabilidad_binomial/03_modelo_probabilistico_binomial.R`
   - `fase4_reporte_mitigacion/04_reporte_ejecutivo.R`
4. Las gráficas de alta resolución se guardarán automáticamente en las subcarpetas `graficas/` de cada fase listas para adjuntar en tu documento final.
