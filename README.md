# Monitoreo Acústico y Análisis Estadístico en el Laboratorio de Prototipos
**Universidad Mesoamericana -- Sede Quetzaltenango**  
**Facultad de Ingeniería, Ingeniería en Sistemas, Informática y Ciencias de la Computación**  
**Cátedra:** Estadística -- **Catedrático:** Ing. Josué Cifuentes  
**Ciclo Académico:** 6to Semestre -- Noviembre 2026  

---

## 👥 Equipo de Trabajo

| Nombre Completo | Carné |
| :--- | :---: |
| **Arturo Alejandro Maldonado Orozco** | 202308110 |
| **Amilcar Joaquin Morales Huitz** | 202307016 |
| **Kevin Daniel Sosa Cutz** | 202508017 |
| **Katherine del Rosario Gramajo Alonzo** | 202508024 |
| **Brayan Alexander Maldonado Jocol** | 202507011 |
| **Yoselin Stefany Ordoñez Estrada** | 202508028 |

---

## 📌 Descripción del Proyecto

El proyecto tiene como propósito evaluar y caracterizar el comportamiento sonoro del **Laboratorio de Prototipos de la Universidad Mesoamericana**, mediante la implementación de un nodo sensor IoT embebido que registra muestras de audio cada 15 minutos en continuo. 

El espacio físico evaluado consta de:
* **3 Cubículos de Prototipado Especializado:** Estaciones cerradas/semicerradas equipadas con osciloscopios, computadoras y herramientas de soldadura donde se situó el micrófono sensor.
* **1 Salón Principal con 4 Mesas de Trabajo Colaborativo:** Espacio amplio de trabajo grupal para proyectos de hardware y ensamble, con aforo simultáneo de hasta **40 estudiantes**.

A partir de las mediciones recopiladas, se contrasta el nivel sonoro contra los estándares internacionales de la **Organización Mundial de la Salud (OMS)** y la norma **ISO 1996** (umbral crítico de $65.0\text{ dBA}$), se determinan parámetros de estadística descriptiva, se ajusta un modelo de regresión lineal para proyectar el nivel de ruido al sexto día (lunes) y se modelan escenarios de ocupación simultánea mediante distribuciones discretas de **Bernoulli** y **Binomial**, concluyendo con un plan técnico de mitigación acústica.

---

## 🛠️ Materiales y Componentes Utilizados

### Hardware y Sensores
* **Microcontrolador ESP32 DevKit v1:** Procesador Xtensa dual-core de 32 bits a 240 MHz con conectividad Wi-Fi 802.11 b/g/n integrada.
* **Sensor Acústico INMP441:** Micrófono MEMS omnidireccional digital con decodificador I2S directo y convertidor analógico-digital (ADC) de 24 bits integrado (relación señal/ruido SNR de 61 dBA).
* **Pulsador Táctil (Push Button):** Conmutador conectado con pull-up interno en `GPIO 5` para conmutar modos de grabación/transmisión.
* **Diodo LED Indicador:** Indicador visual en `GPIO 2` para supervisar el estado de enlace WebSocket y streaming activo.
* **Cables Jumper y Protoboard:** Conexiones punto a punto de baja impedancia.

### Stack de Software y Tecnologías
* **Firmware Embebido:** C++ / Arduino Framework con la biblioteca de bajo nivel `driver/i2s.h` de ESP-IDF y `WebSocketsClient`.
* **Backend y Middleware:** Python 3 (FastAPI, Uvicorn, WebSockets y psycopg2).
* **Base de Datos en la Nube:** Supabase PostgreSQL (almacenamiento relacional en AWS).
* **Entorno de Computación Estadística:** RStudio / R 4.4+ (librerías base para regresión, pruebas de hipótesis y distribuciones probabilísticas).
* **Compilación de Reportes Técnicos:** LaTeX (pdfTeX) con paquetes `booktabs`, `tikz`, `amsmath` y `geometry`.

---

## 🔌 Diagrama Esquemático del Circuito

<p align="center">
  <img src="reportes/graficas/diagrama_circuito.png" alt="Diagrama Esquemático del Circuito ESP32 e INMP441" width="95%">
</p>

El micrófono digital INMP441 se comunica directamente con el ESP32 mediante el bus digital de audio I2S (Inter-IC Sound), evitando el ruido electromagnético que sufren los micrófonos analógicos convencionales:

```text
       +--------------------------------------------------------+
       |                     ESP32 DevKit                       |
       |                                                        |
       |   [3.3V]  ------->  Alimentación VDD                   |
       |   [GND]   ------->  Tierra Común GND                   |
       |   [GPIO 27] ----->  I2S Word Select (WS / LRCK)        |
       |   [GPIO 14] ----->  I2S Serial Clock (SCK / BCLK)      |
       |   [GPIO 33] <-----  I2S Serial Data In (SD / DOUT)     |
       |                                                        |
       |   [GPIO 5]  <-----  Pulsador Modo Escucha (a GND)      |
       |   [GPIO 2]  ----->  LED Indicador de Transmisión       |
       +--------------------------------------------------------+
                                  |
                                  v
       +--------------------------------------------------------+
       |                  Micrófono INMP441                     |
       |                                                        |
       |   VDD    : Entrada de alimentación (3.3V DC)           |
       |   GND    : Referencia de masa                          |
       |   SD     : Línea de datos serie digital PCM            |
       |   SCK    : Reloj de bits maestro                       |
       |   WS     : Reloj de sincronización de palabra          |
       |   L/R    : Selección de canal izquierdo (unido a GND)  |
       +--------------------------------------------------------+
```

### Tabla de Conexionado
| Pin INMP441 | Pin ESP32 | Función | Protocolo / Estado |
| :--- | :--- | :--- | :--- |
| **VDD** | `3.3V` | Alimentación de voltaje | $3.3\text{V DC}$ |
| **GND** | `GND` | Tierra | Común |
| **SD** | `GPIO 33` | Data In (DIN) | I2S Data Stream |
| **SCK** | `GPIO 14` | Bit Clock (BCLK) | I2S Clock |
| **WS** | `GPIO 27` | Word Select (LRCK) | I2S Frame Sync |
| **L/R** | `GND` | Selección de Canal | Canal Izquierdo (Mono) |
| **--** | `GPIO 5` | Botón Control | Pull-Up interno a GND |
| **--** | `GPIO 2` | LED de Estado | Salida Digital |

---

## 🏗️ Arquitectura de Software y Pipeline de Datos

<p align="center">
  <img src="reportes/graficas/diagrama_arquitectura.png" alt="Arquitectura Integral del Pipeline de Datos y Despliegue IoT" width="95%">
</p>

El sistema implementa un flujo automatizado de extremo a extremo compuesto por seis módulos interconectados:

1. **Nodo Sensor (IoT):** Muestreo continuo a $16\,\text{kHz}$ PCM (24 bits) en el ESP32 con micrófono INMP441, transmitiendo tramas de 1024 muestras vía WebSocket.
2. **Túnel Seguro Ingress (Ngrok):** Enrutamiento público WAN seguro (`luxury-roster-uncouth...`) que traspasa el firewall y NAT institucional de la universidad sin requerir IP pública fija.
3. **Servidor Backend (FastAPI + Uvicorn en Ubuntu):** Ingesta en tiempo real (`/ws/esp`), cálculo logarítmico de potencia RMS ($20\log_{10}(\text{RMS})$), filtrado de ruido base ($<-59.5\,\text{dB}$), vúmetro ANSI en terminal y ventanas acumulativas de 15 minutos.
4. **Dashboard Web Live (Frontend):** Visualización en tiempo real con ApexCharts, vúmetro de alerta semafórica (verde, amarillo y rojo), osciloscopio y streaming acústico continuo.
5. **Base de Datos en la Nube (Supabase PostgreSQL):** Persistencia transaccional de métricas agregadas cada 15 minutos en AWS Cloud vía pooler SSL (puerto 6543) sobre la tabla `Registros`.
6. **Entorno Estadístico (RStudio):** Extracción automatizada ETL (`extraer_datos.py`), normalización temporal UTC-0 a UTC-6 (Guatemala), calibración física a dBA ($\text{dBA} = \text{dBFS} + 105$), pruebas normativas, inferencia descriptiva, regresión y modelado binomial.

---

## 📂 Estructura del Repositorio

```text
ProyectoFinal/
├── README.md                                    <- Este documento general
├── .gitignore                                   <- Reglas de exclusión (entorno, .env, ejemplo/)
├── Descripcion proyecto final...pdf             <- Guía de instrucciones y rúbrica oficial (10 pts)
│
├── AudioServidor/
│   └── AudioServidor.ino                       <- Firmware C++ para ESP32 e INMP441
│
├── backend/
│   └── server.py                               <- Servidor FastAPI/WebSocket y persistencia SQL
│
├── Front/                                      <- Interfaz web de monitoreo y vúmetro en tiempo real
│   ├── index.html
│   └── assets/ (js, css, libs)
│
├── analisisestadistico/                        <- Módulos estadísticos en RStudio y Python
│   ├── README.md                               <- Guía de ejecución en RStudio
│   │
│   ├── fase1_extraccion_normativa/
│   │   ├── extraer_datos.py                    <- Extractor directo de Supabase y conversor UTC-6
│   │   ├── datos_limpios.csv                   <- Dataset procesado (236 registros reales)
│   │   ├── Registros_rows-1.csv                <- Respaldo crudo de la tabla de la base de datos
│   │   ├── normativa_referencia.md             <- Marco legal (OMS, ISO 1996, AG 229-2014)
│   │   └── 01_analisis_normativa.R             <- Auditoría de excesos sonoros diarios
│   │
│   ├── fase2_descriptiva_tendencia/
│   │   ├── 02_estadistica_descriptiva_tendencia.R <- Medidas descriptivas y regresión lineal Día 6
│   │   └── graficas/                           <- Gráficas de distribución y tendencia (PNG)
│   │
│   ├── fase3_probabilidad_binomial/
│   │   ├── 03_modelo_probabilistico_binomial.R <- Ensayos de Bernoulli y modelo Binomial n=3
│   │   └── graficas/                           <- Gráficas de masa de probabilidad binomial
│   │
│   └── fase4_reporte_mitigacion/
│       ├── 04_reporte_ejecutivo.R              <- Resumen consolidado para consola
│       └── propuestas_mitigacion.md            <- Propuestas técnicas de mitigación acústica
│
└── reportes/                                   <- Memorias técnicas formales en LaTeX y PDF
    ├── meso.png                                <- Logo institucional de la Universidad Mesoamericana
    ├── reporte_proyecto_final.tex              <- Fuente LaTeX del Reporte Integral y Manual Técnico (9 capítulos)
    ├── reporte_proyecto_final.pdf              <- Documento técnico maestro compilado (17 páginas)
    ├── reporteresultados.tex                   <- Fuente LaTeX del Reporte Ejecutivo de Resultados
    ├── reporteresultados.pdf                   <- Reporte técnico previo compilado (11 páginas)
    └── graficas/                               <- Diagramas y gráficas analíticas de alta resolución
        ├── diagrama_circuito.png               <- Esquemático electrónico del nodo sensor (ESP32 + INMP441)
        ├── diagrama_arquitectura.png           <- Arquitectura del pipeline de datos y despliegue IoT
        ├── 01_distribucion_y_boxplot.png       <- Histograma y diagrama de caja de los 4 días
        ├── 02_tendencia_dia6.png               <- Regresión lineal y proyección a las 09:30 hrs
        └── 03_distribucion_binomial.png        <- Funciones de masa de probabilidad binomial
```

---

## 📊 Metodología y Resultados Estadísticos Clave

### 1. Marco Normativo y Umbral de Riesgo (Fase 1)
* **Umbral Crítico Establecido:** $65.0\text{ dBA}$ ($-40.0\text{ dBFS}$) basado en recomendaciones de la OMS e ISO 1996 para laboratorios y talleres universitarios.
* **Calibración Acústica:** $\text{dBA} = \text{dBFS} + 105.0$.
* **Auditoría de Lecturas (236 registros en UTC-6):**
  - Día 1 (Jueves 03/Nov): $63.88\text{ dBA}$ promedio ($61.11\%$ de lecturas sobre el umbral).
  - Día 2 (Viernes 04/Nov): $58.79\text{ dBA}$ promedio ($8.06\%$ de exceso).
  - Día 3 (Sábado 05/Nov): $54.46\text{ dBA}$ promedio ($4.17\%$ de exceso).
  - Día 4 (Domingo 06/Nov): $48.82\text{ dBA}$ promedio ($0.00\%$ de exceso, madrugada y noche).
  - **Global:** $13.14\%$ del tiempo en condición de exceso sonoro.

### 2. Estadística Descriptiva y Proyección de Tendencia (Fase 2)
* **Media Aritmética ($\bar{x}$):** $56.03\text{ dBA}$ ($-48.97\text{ dBFS}$).
* **Mediana ($Me$):** $55.28\text{ dBA}$ | **Moda ($Mo$):** $50.10\text{ dBA}$.
* **Varianza ($s^2$):** $55.10\text{ dBA}^2$ | **Desviación Estándar ($s$):** $7.42\text{ dBA}$.
* **Coeficiente de Variación ($CV$):** $13.25\%$ (variabilidad moderada).
* **Proyección de Tendencia Lineal (09:30 hrs):**
  $$\hat{y} = 74.13 - 5.91 \cdot \text{Día} \quad (R^2 = 0.6410)$$
  - **Proyección puntual para el Día 6 (Lunes):** $38.64\text{ dBA}$ (estabilizado asintóticamente en el piso físico del laboratorio de $\approx 55\text{ dBA}$, cumpliendo holgadamente el criterio de estar por debajo del umbral de riesgo de $65.0\text{ dBA}$).

### 3. Modelado Probabilístico (Fase 3)
* **Ensayo de Bernoulli:** Parámetro de exceso $p = 0.1314$ ($13.14\%$), $q = 0.8686$.
* **Modelo Binomial con 3 Cubículos Llenos ($n = 3$):**
  - $P(X = 0) = 65.54\%$ (calma acústica total en los tres cubículos).
  - $P(X = 1) = 29.73\%$ (un solo cubículo ruidoso).
  - $P(X = 2) = 4.50\%$ (dos cubículos en exceso).
  - $P(X = 3) = 0.23\%$ (saturación simultánea total).
  - **Probabilidad de Riesgo Crítico ($P(X \ge 1)$):** **$34.46\%$**. Existe un tercio de probabilidad de que al menos un cubículo perturbe a los demás cuando todos están ocupados.

### 4. Propuestas Prácticas de Mitigación (Fase 4)
1. **Control Físico:** Mamparas divisorias fonoabsorbentes entre los 3 cubículos ($\text{NRC} \ge 0.75$, reducción de 5 a 7 dBA).
2. **Aislamiento Mecánico:** Confinamiento de herramientas y bases antivibratorias de caucho para impresoras 3D.
3. **Zonificación Horaria:** Franja matutina de concentración intelectual ($< 55\text{ dBA}$) y franja vespertina de prototipado ruidoso.
4. **Semáforo Acústico IoT:** Torre de luz LED controlada por el ESP32 para retroalimentación visual en tiempo real (Verde: $<60\text{ dBA}$, Amarillo: $60-64.9\text{ dBA}$, Rojo: $\ge 65\text{ dBA}$).

---

## 🚀 Guía de Reproducción Rápida

### 1. Ejecución de los Scripts en RStudio
Abre RStudio y ejecuta secuencialmente los scripts dentro de `analisisestadistico/`:
```r
# Fase 1: Auditoría normativa
source("analisisestadistico/fase1_extraccion_normativa/01_analisis_normativa.R")

# Fase 2: Descriptiva y Proyección
source("analisisestadistico/fase2_descriptiva_tendencia/02_estadistica_descriptiva_tendencia.R")

# Fase 3: Modelo Binomial
source("analisisestadistico/fase3_probabilidad_binomial/03_modelo_probabilistico_binomial.R")

# Fase 4: Reporte Ejecutivo
source("analisisestadistico/fase4_reporte_mitigacion/04_reporte_ejecutivo.R")
```

### 2. Compilación de los Reportes Técnicos en LaTeX
Para recompilar los documentos PDF oficiales desde la terminal:

```bash
cd reportes

# 1. Reporte Integral de Proyecto y Manual Técnico (17 páginas, 9 capítulos):
pdflatex -interaction=nonstopmode reporte_proyecto_final.tex
pdflatex -interaction=nonstopmode reporte_proyecto_final.tex

# 2. Reporte Ejecutivo de Resultados (11 páginas):
pdflatex -interaction=nonstopmode reporteresultados.tex
pdflatex -interaction=nonstopmode reporteresultados.tex
```

Los documentos generados ([reporte_proyecto_final.pdf](reportes/reporte_proyecto_final.pdf) y [reporteresultados.pdf](reportes/reporteresultados.pdf)) contienen la portada institucional formal, listas de figuras, tablas consolidadas y las conclusiones del equipo.

---

## 📑 Galería de Gráficas Analíticas del Reporte

| Distribución Acústica y Boxplot (Fase 2) | Proyección de Tendencia Día 6 (Fase 2) |
| :---: | :---: |
| ![Distribución y Boxplot](reportes/graficas/01_distribucion_y_boxplot.png) | ![Tendencia Día 6](reportes/graficas/02_tendencia_dia6.png) |

| Modelo de Probabilidad Binomial (Fase 3) |
| :---: |
| ![Distribución Binomial](reportes/graficas/03_distribucion_binomial.png) |
