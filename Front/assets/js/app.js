/**
 * app.js
 * Controlador principal de la aplicacion de monitoreo de audio.
 * Integra AudioCore, AudioVisualizer y AudioTransmitter con la interfaz Spark Admin.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Inicializacion de Componentes Base
  const audioCore = new AudioCore();
  const canvasEl = document.getElementById('audioVisualizerCanvas');
  const visualizer = new AudioVisualizer(canvasEl, audioCore);

  // Detectar URL inicial del servidor (soporte automatico para ngrok https o local)
  const currentHost = window.location.host || 'localhost:8000';
  const isHttps = window.location.protocol === 'https:';
  const defaultHttpUrl = `${window.location.protocol}//${currentHost}/api/audio-stream`;
  const defaultWsUrl = `${isHttps ? 'wss:' : 'ws:'}//${currentHost}/ws/audio`;

  const transmitter = new AudioTransmitter(audioCore, {
    protocol: 'fetch',
    serverUrl: defaultHttpUrl,
    rateMs: 100,
    sendRaw: false,
    onStatusChange: updateTransmitterStatus,
    onPacketSent: recordSentPacket
  });

  // 2. Elementos del DOM
  const btnToggleStream = document.getElementById('btnToggleStream');
  const btnToggleStreamText = document.getElementById('btnToggleStreamText');
  const btnToggleStreamIcon = document.getElementById('btnToggleStreamIcon');
  const statusPill = document.getElementById('audioStatusPill');
  const statusPillText = document.getElementById('audioStatusPillText');
  const insecureAlert = document.getElementById('audioInsecureAlert');

  // Metricas KPI
  const kpiRms = document.getElementById('kpiRms');
  const kpiDb = document.getElementById('kpiDb');
  const kpiPeakFreq = document.getElementById('kpiPeakFreq');
  const kpiStateText = document.getElementById('kpiStateText');
  const vuMeterBar = document.getElementById('vuMeterBar');

  // Configuracion
  const inputServerUrl = document.getElementById('inputServerUrl');
  const selectProtocol = document.getElementById('selectProtocol');
  const selectSendRate = document.getElementById('selectSendRate');
  const chkSendRaw = document.getElementById('chkSendRaw');

  // Pestanas del Visualizador
  const btnTabBars = document.getElementById('btnTabBars');
  const btnTabWave = document.getElementById('btnTabWave');
  const freqAxisLabels = document.getElementById('freqAxisLabels');

  // Tabla de Registros
  const tableLogsBody = document.getElementById('tableLogsBody');
  const packetsCountEl = document.getElementById('packetsCount');
  let packetsCount = 0;

  // Establecer URL por defecto en el input
  if (inputServerUrl) {
    inputServerUrl.value = defaultHttpUrl;
  }

  // Comprobar soporte de getUserMedia
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (insecureAlert) insecureAlert.style.display = 'block';
  }

  // 3. Loop de Actualizacion de Metricas en UI (60 FPS)
  let uiUpdateTimer = null;

  function startUiLoop() {
    function loop() {
      if (!audioCore.isRunning) return;

      const snapshot = audioCore.getSnapshot();
      if (snapshot) {
        kpiRms.textContent = `${snapshot.volumePercent}%`;
        kpiDb.textContent = `${snapshot.db} dB`;
        kpiPeakFreq.textContent = snapshot.peakFrequencyHz > 0 ? `${snapshot.peakFrequencyHz} Hz` : '---';

        if (vuMeterBar) {
          vuMeterBar.style.width = `${snapshot.volumePercent}%`;
        }

        if (kpiStateText) {
          kpiStateText.textContent = snapshot.volumePercent > 6 ? 'Audio detectado' : 'Silencio';
        }
      }

      uiUpdateTimer = requestAnimationFrame(loop);
    }
    loop();
  }

  function stopUiLoop() {
    if (uiUpdateTimer) {
      cancelAnimationFrame(uiUpdateTimer);
      uiUpdateTimer = null;
    }
    kpiRms.textContent = '0%';
    kpiDb.textContent = '-∞ dB';
    kpiPeakFreq.textContent = '0 Hz';
    if (vuMeterBar) vuMeterBar.style.width = '0%';
    if (kpiStateText) kpiStateText.textContent = 'Inactivo';
  }

  // 4. Iniciar y Detener Transmision
  async function toggleStream() {
    if (!audioCore.isRunning) {
      try {
        btnToggleStream.disabled = true;
        updateStatusPill('connecting', 'Conectando...');

        await audioCore.start();
        visualizer.start();
        transmitter.start();
        startUiLoop();

        btnToggleStream.classList.remove('btn-start');
        btnToggleStream.classList.add('btn-stop');
        btnToggleStreamIcon.className = 'bi bi-stop-circle-fill';
        btnToggleStreamText.textContent = 'Detener Captura y Envio';

        updateStatusPill('active', 'Transmitiendo');
      } catch (err) {
        console.error('Error al iniciar captura de audio:', err);
        alert('No se pudo acceder al microfono: ' + (err.message || err.name));
        updateStatusPill('error', 'Error Microfono');
      } finally {
        btnToggleStream.disabled = false;
      }
    } else {
      audioCore.stop();
      visualizer.stop();
      transmitter.stop();
      stopUiLoop();

      btnToggleStream.classList.remove('btn-stop');
      btnToggleStream.classList.add('btn-start');
      btnToggleStreamIcon.className = 'bi bi-play-circle-fill';
      btnToggleStreamText.textContent = 'Iniciar Captura y Envio';

      updateStatusPill('idle', 'Inactivo');
    }
  }

  if (btnToggleStream) {
    btnToggleStream.addEventListener('click', toggleStream);
  }

  // 5. Control de Estado
  function updateStatusPill(state, text) {
    if (!statusPill || !statusPillText) return;
    statusPill.className = 'audio-status-pill ' + (state === 'active' ? 'active' : state === 'error' ? 'error' : '');
    statusPillText.textContent = text;
  }

  function updateTransmitterStatus(state, message) {
    if (state === 'active') {
      updateStatusPill('active', 'Transmitiendo');
    } else if (state === 'error') {
      updateStatusPill('error', message);
    } else if (state === 'idle') {
      updateStatusPill('idle', 'Detenido');
    }
  }

  // 6. Registro de paquetes en la tabla de logs (Fase 1)
  function recordSentPacket(payload) {
    packetsCount++;
    if (packetsCountEl) {
      packetsCountEl.textContent = packetsCount.toLocaleString();
    }

    if (!tableLogsBody) return;

    const row = document.createElement('tr');
    const timeStr = new Date(payload.timestamp).toLocaleTimeString();

    row.innerHTML = `
      <td><code>${timeStr}</code></td>
      <td><strong>${payload.db.toFixed(1)} dB</strong></td>
      <td>${(payload.rms * 100).toFixed(1)}%</td>
      <td>${payload.peakFrequencyHz > 0 ? payload.peakFrequencyHz + ' Hz' : '---'}</td>
      <td><span class="badge bg-success-subtle text-success">OK</span></td>
    `;

    tableLogsBody.insertBefore(row, tableLogsBody.firstChild);

    // Mantener maximo 10 filas visibles en el feed
    while (tableLogsBody.children.length > 10) {
      tableLogsBody.removeChild(tableLogsBody.lastChild);
    }
  }

  // 7. Pestanas de Visualizacion
  if (btnTabBars && btnTabWave) {
    btnTabBars.addEventListener('click', () => {
      visualizer.setMode('bars');
      btnTabBars.classList.add('active');
      btnTabWave.classList.remove('active');
      if (freqAxisLabels) freqAxisLabels.style.display = 'flex';
    });

    btnTabWave.addEventListener('click', () => {
      visualizer.setMode('wave');
      btnTabWave.classList.add('active');
      btnTabBars.classList.remove('active');
      if (freqAxisLabels) freqAxisLabels.style.display = 'none';
    });
  }

  // 8. Cambios de Configuracion en Caliente
  if (selectProtocol && inputServerUrl) {
    selectProtocol.addEventListener('change', () => {
      const mode = selectProtocol.value;
      if (mode === 'ws') {
        inputServerUrl.value = defaultWsUrl;
      } else {
        inputServerUrl.value = defaultHttpUrl;
      }
      transmitter.setProtocol(mode);
      transmitter.setServerUrl(inputServerUrl.value.trim());
    });
  }

  if (inputServerUrl) {
    inputServerUrl.addEventListener('change', () => {
      transmitter.setServerUrl(inputServerUrl.value.trim());
    });
  }

  if (selectSendRate) {
    selectSendRate.addEventListener('change', () => {
      transmitter.setRate(parseInt(selectSendRate.value, 10) || 100);
    });
  }

  if (chkSendRaw) {
    chkSendRaw.addEventListener('change', () => {
      transmitter.setSendRaw(chkSendRaw.checked);
    });
  }

  // 9. Integracion de Controles de Sidebar y Pantalla Completa (Spark Admin)
  const sidebar = document.querySelector('.sidebar-wrapper');
  const toggleBtn = document.querySelector('.sidebar-toggle-btn');
  const desktopToggleBtn = document.querySelector('#desktop-sidebar-toggle');
  const fullscreenBtn = document.querySelector('#btn-fullscreen');

  let overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('show');
      overlay.classList.toggle('show', sidebar.classList.contains('show'));
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('show');
      overlay.classList.remove('show');
    });
  }

  if (desktopToggleBtn) {
    desktopToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('sidebar-minimized');
    });
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
      }
    });
  }
});
