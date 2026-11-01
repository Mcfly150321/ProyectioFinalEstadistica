/**
 * app.js
 * Controlador principal del panel de monitoreo ESP32 + INMP441.
 * Integra autenticacion (.env WEB_PASSWORD), recepcion WebSocket,
 * visualizador de espectro/osciloscopio, ocultamiento de sidebar y reproduccion en vivo.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Inicializacion de Componentes Base
  const audioCore = new AudioCore({ sampleRate: 16000, fftSize: 512 });
  const canvasEl = document.getElementById('audioVisualizerCanvas');
  const visualizer = new AudioVisualizer(canvasEl, audioCore);

  // Elementos de Autenticacion
  const authOverlay = document.getElementById('authOverlay');
  const authForm = document.getElementById('authForm');
  const inputWebPassword = document.getElementById('inputWebPassword');
  const authErrorMsg = document.getElementById('authErrorMsg');
  const btnLogout = document.getElementById('btn-logout');

  // Indicadores de Estado ESP32 (Navbar y Card Lateral)
  const navEspConnPill = document.getElementById('navEspConnPill');
  const navEspConnText = document.getElementById('navEspConnText');
  const navEspRecPill = document.getElementById('navEspRecPill');
  const navEspRecText = document.getElementById('navEspRecText');
  const cardEspConnBadge = document.getElementById('cardEspConnBadge');
  const cardEspRecBadge = document.getElementById('cardEspRecBadge');

  // Metricas KPI
  const kpiEspStatusDate = document.getElementById('kpiEspStatusDate');
  const kpiStateText = document.getElementById('kpiStateText');
  const kpiRms = document.getElementById('kpiRms');
  const kpiDb = document.getElementById('kpiDb');
  const kpiPeakFreq = document.getElementById('kpiPeakFreq');
  const vuMeterBar = document.getElementById('vuMeterBar');

  // Boton de Reproduccion de Audio
  const btnTogglePlayback = document.getElementById('btnTogglePlayback');
  const btnTogglePlaybackIcon = document.getElementById('btnTogglePlaybackIcon');
  const btnTogglePlaybackText = document.getElementById('btnTogglePlaybackText');

  // Pestanas del Visualizador
  const btnTabBars = document.getElementById('btnTabBars');
  const btnTabWave = document.getElementById('btnTabWave');
  const freqAxisLabels = document.getElementById('freqAxisLabels');

  // Tabla de Registros
  const tableLogsBody = document.getElementById('tableLogsBody');
  const packetsCountEl = document.getElementById('packetsCount');
  let packetsCount = 0;
  let lastTableUpdate = 0;
  let espState = { espConnected: false, recording: false };

  // 2. Cliente WebSocket de Monitoreo
  const monitorClient = new EspMonitorClient(audioCore, {
    onEspStatusChange: handleEspStatusChange,
    onPacketReceived: handlePacketReceived,
    onAuthError: handleAuthError
  });

  // Iniciar visualizador y loop de UI
  visualizer.start();
  startUiLoop();

  // 3. Flujo de Autenticacion con WEB_PASSWORD
  const savedPassword = sessionStorage.getItem('web_monitor_password');
  if (savedPassword) {
    attemptLogin(savedPassword, true);
  }

  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pass = inputWebPassword.value.trim();
      if (!pass) return;
      // Inicializar y activar reproduccion aprovechando el gesto del usuario al desbloquear
      const playing = audioCore.setPlaybackEnabled(true);
      updatePlaybackButtonUI(playing);
      await attemptLogin(pass, false);
    });
  }

  async function attemptLogin(password, isAuto) {
    if (authErrorMsg) authErrorMsg.style.display = 'none';
    const isValid = await monitorClient.verifyPassword(password);

    if (isValid) {
      sessionStorage.setItem('web_monitor_password', password);
      if (authOverlay) authOverlay.classList.add('hidden');
      visualizer.handleResize();
      monitorClient.connect(password);
    } else {
      sessionStorage.removeItem('web_monitor_password');
      if (authOverlay) authOverlay.classList.remove('hidden');
      if (!isAuto && authErrorMsg) {
        authErrorMsg.style.display = 'block';
      }
    }
  }

  function handleAuthError() {
    sessionStorage.removeItem('web_monitor_password');
    if (authOverlay) authOverlay.classList.remove('hidden');
    if (authErrorMsg) authErrorMsg.style.display = 'block';
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      sessionStorage.removeItem('web_monitor_password');
      monitorClient.disconnect();
      audioCore.setPlaybackEnabled(false);
      updatePlaybackButtonUI(false);
      if (inputWebPassword) inputWebPassword.value = '';
      if (authErrorMsg) authErrorMsg.style.display = 'none';
      if (authOverlay) authOverlay.classList.remove('hidden');
    });
  }

  // 4. Actualizacion de Indicadores de Conexion y Grabacion del ESP32
  function handleEspStatusChange(state) {
    espState = state;

    if (state.espConnected) {
      if (navEspConnPill) navEspConnPill.className = 'audio-status-pill connected me-1';
      if (navEspConnText) navEspConnText.textContent = 'ESP32: Conectado';
      if (cardEspConnBadge) {
        cardEspConnBadge.className = 'badge bg-success-subtle text-success';
        cardEspConnBadge.textContent = 'Conectado';
      }
      if (kpiEspStatusDate) kpiEspStatusDate.textContent = 'ESP32 En Linea';
    } else {
      if (navEspConnPill) navEspConnPill.className = 'audio-status-pill error me-1';
      if (navEspConnText) navEspConnText.textContent = 'ESP32: Desconectado';
      if (cardEspConnBadge) {
        cardEspConnBadge.className = 'badge bg-danger-subtle text-danger';
        cardEspConnBadge.textContent = 'Desconectado';
      }
      if (kpiEspStatusDate) kpiEspStatusDate.textContent = 'ESP32 Desconectado';
    }

    if (state.espConnected && state.recording) {
      if (navEspRecPill) navEspRecPill.className = 'audio-status-pill active me-1';
      if (navEspRecText) navEspRecText.textContent = 'Audio: Transmitiendo';
      if (cardEspRecBadge) {
        cardEspRecBadge.className = 'badge bg-success-subtle text-success';
        cardEspRecBadge.textContent = 'Transmitiendo';
      }
      if (kpiStateText) kpiStateText.textContent = 'Recibiendo audio';
    } else {
      if (navEspRecPill) navEspRecPill.className = 'audio-status-pill me-1';
      if (navEspRecText) navEspRecText.textContent = 'Audio: Inactivo';
      if (cardEspRecBadge) {
        cardEspRecBadge.className = 'badge bg-secondary-subtle text-secondary';
        cardEspRecBadge.textContent = 'Inactivo';
      }
      if (kpiStateText) {
        kpiStateText.textContent = state.espConnected ? 'En espera (Pausa)' : 'En espera de senal';
      }
    }
  }

  // 5. Recepcion de Bloques de Audio desde el ESP32
  function handlePacketReceived(snapshot) {
    packetsCount++;
    if (packetsCountEl) {
      packetsCountEl.textContent = packetsCount.toLocaleString();
    }

    const now = Date.now();
    if (now - lastTableUpdate >= 200 && tableLogsBody) {
      lastTableUpdate = now;

      if (packetsCount === 1 || tableLogsBody.querySelector('td[colspan]')) {
        tableLogsBody.innerHTML = '';
      }

      const row = document.createElement('tr');
      const timeStr = new Date(snapshot.timestamp).toLocaleTimeString();

      row.innerHTML = `
        <td><code>${timeStr}</code></td>
        <td><strong>${snapshot.db.toFixed(1)} dB</strong></td>
        <td>${(snapshot.rms * 100).toFixed(2)}%</td>
        <td>${snapshot.peakFrequencyHz > 0 ? snapshot.peakFrequencyHz + ' Hz' : '---'}</td>
        <td><span class="badge bg-success-subtle text-success">Recibido</span></td>
      `;

      tableLogsBody.insertBefore(row, tableLogsBody.firstChild);

      while (tableLogsBody.children.length > 10) {
        tableLogsBody.removeChild(tableLogsBody.lastChild);
      }
    }
  }

  // 6. Loop de Actualizacion de Tarjetas KPI (60 FPS)
  function startUiLoop() {
    function loop() {
      const snapshot = audioCore.getSnapshot();
      if (snapshot && espState.espConnected && espState.recording) {
        if (kpiRms) kpiRms.textContent = `${snapshot.volumePercent}%`;
        if (kpiDb) kpiDb.textContent = `${snapshot.db.toFixed(1)} dB`;
        if (kpiPeakFreq) {
          kpiPeakFreq.textContent = snapshot.peakFrequencyHz > 0 ? `${snapshot.peakFrequencyHz} Hz` : '0 Hz';
        }
        if (vuMeterBar) {
          vuMeterBar.style.width = `${snapshot.volumePercent}%`;
        }
      } else {
        if (kpiRms) kpiRms.textContent = '0%';
        if (kpiDb) kpiDb.textContent = '-60.0 dB';
        if (kpiPeakFreq) kpiPeakFreq.textContent = '0 Hz';
        if (vuMeterBar) vuMeterBar.style.width = '0%';
      }

      requestAnimationFrame(loop);
    }
    loop();
  }

  // 7. Boton de Reproduccion de Audio del ESP32
  function updatePlaybackButtonUI(playing) {
    if (!btnTogglePlayback) return;
    if (playing) {
      btnTogglePlayback.classList.remove('btn-start');
      btnTogglePlayback.classList.add('btn-stop');
      if (btnTogglePlaybackIcon) btnTogglePlaybackIcon.className = 'bi bi-volume-mute-fill';
      if (btnTogglePlaybackText) btnTogglePlaybackText.textContent = 'Silenciar Reproduccion de Audio';
    } else {
      btnTogglePlayback.classList.remove('btn-stop');
      btnTogglePlayback.classList.add('btn-start');
      if (btnTogglePlaybackIcon) btnTogglePlaybackIcon.className = 'bi bi-volume-up-fill';
      if (btnTogglePlaybackText) btnTogglePlaybackText.textContent = 'Activar Reproduccion de Audio';
    }
  }

  if (btnTogglePlayback) {
    btnTogglePlayback.addEventListener('click', () => {
      const playing = audioCore.togglePlayback();
      updatePlaybackButtonUI(playing);
    });
  }

  // 8. Pestanas de Visualizacion (Espectro FFT / Osciloscopio)
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

  // 9. Controles para Ocultar / Mostrar la Barra Lateral y Pantalla Completa
  const sidebar = document.querySelector('.sidebar-wrapper');
  const toggleBtn = document.querySelector('#sidebar-toggle');
  const desktopToggleBtn = document.querySelector('#desktop-sidebar-toggle');
  const sidebarCloseBtn = document.querySelector('#sidebar-close-btn');
  const fullscreenBtn = document.querySelector('#btn-fullscreen');

  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);

  function resizeCanvasAfterTransition() {
    setTimeout(() => visualizer.handleResize(), 50);
    setTimeout(() => visualizer.handleResize(), 320);
  }

  function toggleSidebarVisibility(e) {
    if (e) e.stopPropagation();
    if (window.innerWidth <= 1200) {
      if (sidebar) {
        sidebar.classList.toggle('show');
        overlay.classList.toggle('show', sidebar.classList.contains('show'));
      }
    } else {
      document.body.classList.toggle('sidebar-hidden');
    }
    resizeCanvasAfterTransition();
  }

  if (desktopToggleBtn) {
    desktopToggleBtn.addEventListener('click', toggleSidebarVisibility);
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleSidebarVisibility);
  }

  if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sidebar) sidebar.classList.remove('show');
      overlay.classList.remove('show');
      document.body.classList.add('sidebar-hidden');
      resizeCanvasAfterTransition();
    });
  }

  overlay.addEventListener('click', () => {
    if (sidebar) sidebar.classList.remove('show');
    overlay.classList.remove('show');
    resizeCanvasAfterTransition();
  });

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    });
  }
});
