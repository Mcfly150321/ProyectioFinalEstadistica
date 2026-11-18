# Fase 1: Marco Normativo de Ruido y Criterio de Riesgo Acústico
**Laboratorio de Prototipos - Universidad Mesoamericana (Sede Quetzaltenango)**
**Cátedra:** Estadística - Ing. Josué Cifuentes

---

## 1. Contexto Acústico del Laboratorio
El Laboratorio de Prototipos de la UMES cuenta con:
- **3 cubículos de trabajo** (equipados con microcomputadoras, osciloscopios, estaciones de soldadura y prototipado rápido donde se situó el sistema de monitoreo ESP32 con micrófono INMP441).
- **1 salón anexo con 4 mesas de trabajo colaborativo** para proyectos grupales.
- **Capacidad total:** ~40 estudiantes.

La actividad combina trabajo intelectual concentrado (programación, diseño de circuitos y cálculos) con tareas mecánicas y electrónicas (ensamble, pruebas de motores, corte de materiales y discusión en equipo), lo que genera variabilidad en los niveles de presión sonora.

---

## 2. Marco Normativo y Estándares Internacionales

Para evaluar si los niveles de ruido constituyen un riesgo, se contrastan los datos con los siguientes estándares:

1. **Organización Mundial de la Salud (OMS - Guidelines for Community Noise)**:
   - Para ambientes de aprendizaje y laboratorios escolares/universitarios, el nivel equivalente continuo recomendado ($L_{Aeq}$) es de **35 dBA a 55 dBA** durante clases teóricas y un máximo de **65 dBA** durante talleres prácticos para garantizar inteligibilidad de la palabra y evitar fatiga auditiva.
   
2. **ISO 1996 (Acústica - Descripción, medición y evaluación del ruido ambiental)**:
   - Fija el umbral de molestia en oficinas y laboratorios técnicos en **65 dBA**. Valores sostenidos superiores a 65 dBA interfieren con la concentración e incrementan la tasa de error humano.

3. **Norma OSHA / Ministerio de Trabajo de Guatemala (Acuerdo Gubernativo 229-2014)**:
   - Fija el umbral de daño auditivo ocupacional crónico a 8 horas en **85 dBA**.
   - En un laboratorio universitario el riesgo principal no es la pérdida auditiva súbita, sino el **estrés acústico, distracción y pérdida de concentración en el diseño**.

---

## 3. Definición del Umbral de Riesgo Aceptado

| Parámetro | Escala Digital Sensor (dBFS) | Escala Acústica Humana (dBA) | Clasificación |
| :--- | :--- | :--- | :--- |
| **Zona Aceptable** | $< -40.0 \text{ dBFS}$ | $< 65.0 \text{ dBA}$ | Ruido de fondo óptimo para trabajo colaborativo y prototipado. |
| **Umbral de Riesgo (Límite)** | **$-40.0 \text{ dBFS}$** | **$65.0 \text{ dBA}$** | **Nivel crítico fijado en el sistema de monitoreo.** |
| **Zona de Exceso / Saturación** | $\ge -40.0 \text{ dBFS}$ | $\ge 65.0 \text{ dBA}$ | Exceso acústico. Dificulta la comunicación y exige mitigación. |

---

## 4. Transformación de Zona Horaria
- **Origen en Servidor / Base de Datos:** UTC-0 (Tiempo Universal Coordinado).
- **Destino Oficial (Guatemala):** UTC-6 (`America/Guatemala`).
- **Fórmula de conversión:** 
  $$\text{Hora}_{\text{Guatemala}} = \text{Hora}_{\text{UTC}} - 6 \text{ horas}$$
  
Todos los análisis de las Fases 2 y 3 toman como referencia estricta la hora local UTC-6.
