# Fase 4: Propuestas de Mitigación Acústica
**Laboratorio de Prototipos - Universidad Mesoamericana (Sede Quetzaltenango)**
**Cátedra:** Estadística - Ing. Josué Cifuentes

---

## 1. Justificación basada en la Evidencia Estadística
A partir del análisis descriptivo y probabilístico:
1. **Frecuencia de exceso:** Durante las horas pico (10:00 - 13:00 y 14:00 - 17:00), el nivel equivalente promedio se aproxima o supera el umbral crítico de **65.0 dBA** (-40.0 dBFS).
2. **Escenario de saturación (Modelo Binomial):** Cuando los 3 cubículos están ocupados en simultáneo, la probabilidad de que al menos un cubículo supere el umbral excede el 60%, y con las 4 mesas grandes activas (~40 estudiantes) la probabilidad de contaminación cruzada por ruido se dispara por el fenómeno de Lombard (los alumnos elevan la voz para hacerse oír sobre el ruido de fondo).

---

## 2. Plan Integral de Mitigación (4 Ejes de Acción)

### Eje 1: Control Físico y Acondicionamiento Acústico (Ingeniería)
- **Instalación de Paneles Fonoabsorbentes en Cubículos:**
  - Instalar paneles de espuma acústica de poliuretano de alta densidad o fibra de vidrio recubierta con tela ignífuga (coeficiente NRC $\ge 0.75$) en las divisiones entre los 3 cubículos.
  - Reducción esperada: Atenuación de **4 a 7 dBA** de transferencia directa entre estaciones.
- **Trampas de graves y bafles suspendidos en el salón:**
  - El salón cuenta con 4 mesas grandes y techo rígido reflectante. La instalación de bafles absorbentes suspendidos disminuirá el tiempo de reverberación ($RT_{60}$) de ~1.4 segundos a menos de 0.6 segundos.

### Eje 2: Aislamiento de Fuentes de Ruido Crítico
- **Gabinete acústico para herramientas ruidosas:**
  - En un laboratorio de prototipos, taladros de banco, fresadoras CNC de escritorio, cortadoras láser o compresores para prototipado rápido deben ubicarse dentro de una cabina o gabinete con sellos de neopreno y acrílico doble.
- **Bases antivibratorias:**
  - Colocar alfombrillas de silicona/caucho vulcanizado debajo de impresoras 3D y fuentes de poder para desacoplar vibraciones mecánicas de las mesas de trabajo.

### Eje 3: Control Administrativo y Gestión de Horarios
- **Zonificación y Horarios Diferenciados de Prototipado:**
  - Establecer franjas horarias estrictas:
    - *Franja de Concentración / Diseño Digital* (08:00 - 10:00 y 13:00 - 14:00): Exclusiva para programación de microcontroladores (ESP32), simulación y modelado CAD, con límite estricto de 55 dBA.
    - *Franja de Ensamble y Fabricación* (10:00 - 13:00 y 14:00 - 17:00): Permitido el uso de herramientas eléctricas con protectores auditivos de inserción si se alcanzan picos superiores a 80 dBA.
- **Límite de Ocupación Dinámica:**
  - Reducir el aforo de las 4 mesas en horas pico para no exceder 25-30 personas concurrentes simultáneas cuando los 3 cubículos estén en pruebas de hardware.

### Eje 4: Retroalimentación Visual en Tiempo Real (Semáforo Acústico IoT)
- **Aprovechamiento del Sistema ESP32 implementado:**
  - El ESP32 y el servidor ya calculan los decibeles en tiempo real.
  - Se propone conectar una tira LED o torre de luz en el laboratorio:
    - **Verde (< 60 dBA):** Nivel óptimo de trabajo.
    - **Amarillo (60 - 64.9 dBA):** Nivel de advertencia (alumnos autorregulan el volumen de voz).
    - **Rojo ($\ge 65.0$ dBA):** Alerta visual de exceso acústico activada automáticamente por el servidor.

---

## 3. Matriz de Viabilidad e Impacto

| Propuesta | Costo Relativo | Dificultad de Implementación | Reducción de Ruido Estimada |
| :--- | :--- | :--- | :--- |
| **Paneles en 3 Cubículos** | Medio | Baja | -5 a -7 dBA |
| **Semáforo LED con ESP32** | Muy Bajo | Muy Baja | -3 a -4 dBA (conductual) |
| **Bases de goma en maquinaria** | Muy Bajo | Inmediata | -2 a -3 dBA |
| **Protocolo de Horarios** | Nulo | Administrativa | Evita picos coincidentes |
