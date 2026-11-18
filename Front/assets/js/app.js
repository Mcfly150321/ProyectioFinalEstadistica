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

  // Elementos de Simulacion y Analitica R Live
  const rLiveStatusBadge = document.getElementById('rLiveStatusBadge');
  const proxHoraEnPunto = document.getElementById('proxHoraEnPunto');
  const btnRecalcularR = document.getElementById('btnRecalcularR');
  const btnCapturarRegistro = document.getElementById('btnCapturarRegistro');

  const rStatN = document.getElementById('rStatN');
  const rStatMedia = document.getElementById('rStatMedia');
  const rStatMediana = document.getElementById('rStatMediana');
  const rStatModa = document.getElementById('rStatModa');
  const rStatSd = document.getElementById('rStatSd');
  const rStatIqr = document.getElementById('rStatIqr');
  const rStatCv = document.getElementById('rStatCv');

  const rStatExcesos = document.getElementById('rStatExcesos');
  const rStatExcesosConteo = document.getElementById('rStatExcesosConteo');
  const rStatP = document.getElementById('rStatP');
  const rStatQ = document.getElementById('rStatQ');
  const rStatRiesgo3 = document.getElementById('rStatRiesgo3');
  const rStatRiesgo7 = document.getElementById('rStatRiesgo7');
  const rStatPredDia6 = document.getElementById('rStatPredDia6');
  const rStatPredDia6Footer = document.getElementById('rStatPredDia6Footer');
  const rStatR2Header = document.getElementById('rStatR2Header');

  const rStatRiesgoBadge = document.getElementById('rStatRiesgoBadge');
  const rStatBin0 = document.getElementById('rStatBin0');
  const rStatBin1 = document.getElementById('rStatBin1');
  const rStatBin2 = document.getElementById('rStatBin2');
  const rStatBin3 = document.getElementById('rStatBin3');
  const progBin0 = document.getElementById('progBin0');
  const progBin1 = document.getElementById('progBin1');
  const progBin2 = document.getElementById('progBin2');
  const progBin3 = document.getElementById('progBin3');

  const rStatR2Badge = document.getElementById('rStatR2Badge');
  const rStatB0 = document.getElementById('rStatB0');
  const rStatB1 = document.getElementById('rStatB1');
  const rStatTendencia = document.getElementById('rStatTendencia');

  const tablaTopHorasBody = document.getElementById('tablaTopHorasBody');
  const tablaTopDiasBody = document.getElementById('tablaTopDiasBody');
  const badgeTopHoraPico = document.getElementById('badgeTopHoraPico');
  const badgeTopDiaPico = document.getElementById('badgeTopDiaPico');
  const totalRangosHoras = document.getElementById('totalRangosHoras');
  const totalDiasRegistrados = document.getElementById('totalDiasRegistrados');

  const rUltimoBadge = document.getElementById('rUltimoBadge');
  const rUltimoId = document.getElementById('rUltimoId');
  const rUltimoHora = document.getElementById('rUltimoHora');
  const rUltimoDba = document.getElementById('rUltimoDba');
  const rStatTimestamp = document.getElementById('rStatTimestamp');

  // 2. Cliente WebSocket de Monitoreo
  const monitorClient = new EspMonitorClient(audioCore, {
    onEspStatusChange: handleEspStatusChange,
    onPacketReceived: handlePacketReceived,
    onAuthError: handleAuthError,
    onLiveStats: handleLiveStatsReceived
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

  // 10. Actualizacion y Control de Estadisticas R en Vivo (Live Engine)
  function handleLiveStatsReceived(stats) {
    if (!stats || stats.status !== 'success') return;

    if (rLiveStatusBadge) {
      rLiveStatusBadge.className = 'badge bg-success-subtle text-success';
      rLiveStatusBadge.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i>R 4.1.2 Activo';
    }

    if (rStatN) rStatN.textContent = stats.n_total;
    if (rStatMedia && stats.descriptiva) rStatMedia.textContent = `${stats.descriptiva.media.toFixed(2)} dBA`;
    if (rStatMediana && stats.descriptiva) rStatMediana.textContent = `${stats.descriptiva.mediana.toFixed(2)} dBA`;
    if (rStatModa && stats.descriptiva) rStatModa.textContent = `${stats.descriptiva.moda.toFixed(2)} dBA`;
    if (rStatSd && stats.descriptiva) rStatSd.textContent = `${stats.descriptiva.desv_estandar.toFixed(2)} dB`;
    if (rStatIqr && stats.descriptiva) rStatIqr.textContent = `${stats.descriptiva.iqr.toFixed(2)} dB`;
    if (rStatCv && stats.descriptiva) rStatCv.textContent = `${stats.descriptiva.cv_pct.toFixed(1)}%`;

    if (rStatExcesos && stats.normativa) {
      rStatExcesos.textContent = `${stats.normativa.pct_excesos.toFixed(1)}%`;
    }
    if (rStatExcesosConteo && stats.normativa) {
      rStatExcesosConteo.textContent = `Total: ${stats.normativa.total_excesos} de ${stats.n_total} muestras`;
    }
    if (rStatP && stats.normativa) rStatP.textContent = stats.normativa.p_bernoulli.toFixed(4);
    if (rStatQ && stats.normativa) rStatQ.textContent = stats.normativa.q_bernoulli.toFixed(4);

    if (rStatRiesgo3 && stats.binomial_3_cubiculos) {
      const r3 = stats.binomial_3_cubiculos.riesgo_critico_ge1 * 100;
      rStatRiesgo3.textContent = `${r3.toFixed(2)}%`;
      if (rStatRiesgoBadge) {
        rStatRiesgoBadge.textContent = `P(X >= 1) = ${r3.toFixed(2)}%`;
        rStatRiesgoBadge.className = r3 > 30 ? 'badge bg-danger-subtle text-danger' : 'badge bg-warning-subtle text-warning';
      }
    }
    if (rStatRiesgo7 && stats.binomial_7_estaciones) {
      const r7 = stats.binomial_7_estaciones.riesgo_ge2 * 100;
      rStatRiesgo7.textContent = `${r7.toFixed(2)}%`;
    }

    if (rStatPredDia6 && stats.regresion_tendencia) {
      rStatPredDia6.textContent = `${stats.regresion_tendencia.proyeccion_dia6.toFixed(2)} dBA`;
    }
    if (rStatPredDia6Footer && stats.regresion_tendencia) {
      rStatPredDia6Footer.textContent = `${stats.regresion_tendencia.proyeccion_dia6.toFixed(2)} dBA`;
    }
    if (rStatR2Header && stats.regresion_tendencia) {
      rStatR2Header.textContent = stats.regresion_tendencia.r2.toFixed(4);
    }

    if (stats.binomial_3_cubiculos) {
      const b = stats.binomial_3_cubiculos;
      const p0 = b.p_x0 * 100;
      const p1 = b.p_x1 * 100;
      const p2 = b.p_x2 * 100;
      const p3 = b.p_x3 * 100;
      if (rStatBin0) rStatBin0.textContent = `${p0.toFixed(1)}%`;
      if (rStatBin1) rStatBin1.textContent = `${p1.toFixed(1)}%`;
      if (rStatBin2) rStatBin2.textContent = `${p2.toFixed(1)}%`;
      if (rStatBin3) rStatBin3.textContent = `${p3.toFixed(1)}%`;
      if (progBin0) progBin0.style.width = `${Math.min(100, p0)}%`;
      if (progBin1) progBin1.style.width = `${Math.min(100, p1)}%`;
      if (progBin2) progBin2.style.width = `${Math.min(100, p2)}%`;
      if (progBin3) progBin3.style.width = `${Math.min(100, p3)}%`;
    }

    if (stats.regresion_tendencia) {
      const reg = stats.regresion_tendencia;
      if (rStatR2Badge) rStatR2Badge.textContent = `R\u00B2 = ${reg.r2.toFixed(4)}`;
      if (rStatB0) rStatB0.textContent = reg.intercepto_b0.toFixed(2);
      if (rStatB1) rStatB1.textContent = `${reg.pendiente_b1 > 0 ? '+' : ''}${reg.pendiente_b1.toFixed(2)} dB/d\u00EDa`;
      if (rStatTendencia) {
        if (reg.pendiente_b1 < -0.5) {
          rStatTendencia.className = 'badge bg-success-subtle text-success mt-1';
          rStatTendencia.textContent = 'Descendente';
        } else if (reg.pendiente_b1 > 0.5) {
          rStatTendencia.className = 'badge bg-danger-subtle text-danger mt-1';
          rStatTendencia.textContent = 'Creciente';
        } else {
          rStatTendencia.className = 'badge bg-secondary-subtle text-secondary mt-1';
          rStatTendencia.textContent = 'Estable';
        }
      }
    }

    // Renderizado de Top Horas Mas Ruidosas
    if (tablaTopHorasBody && Array.isArray(stats.top_horas)) {
      tablaTopHorasBody.innerHTML = '';
      if (stats.top_horas.length > 0 && badgeTopHoraPico) {
        badgeTopHoraPico.textContent = `Pico: ${stats.top_horas[0].rango} (${stats.top_horas[0].media_dba} dBA)`;
      }
      if (totalRangosHoras) totalRangosHoras.textContent = stats.top_horas.length;

      stats.top_horas.forEach((item, index) => {
        const row = document.createElement('tr');
        const pos = index + 1;
        let estadoBadge = '';
        let rowClass = '';

        if (item.media_dba >= 65.0) {
          estadoBadge = '<span class="badge bg-danger">Critico (&ge;65)</span>';
          rowClass = 'table-danger bg-opacity-25';
        } else if (item.media_dba >= 58.0) {
          estadoBadge = '<span class="badge bg-warning text-dark">Moderado</span>';
        } else {
          estadoBadge = '<span class="badge bg-success-subtle text-success">Conforme</span>';
        }

        const medal = pos === 1 ? '🥇 ' : (pos === 2 ? '🥈 ' : (pos === 3 ? '🥉 ' : ''));

        row.className = rowClass;
        row.innerHTML = `
          <td><span class="fw-bold">${medal}#${pos}</span></td>
          <td class="text-start"><code>${item.rango}</code></td>
          <td><strong class="${item.media_dba >= 65.0 ? 'text-danger' : 'text-primary'}">${item.media_dba.toFixed(2)} dBA</strong></td>
          <td><span class="badge bg-light text-dark border">${item.max_dba.toFixed(2)} dBA</span></td>
          <td><span class="text-muted">${item.muestras}</span></td>
          <td>
            <div class="d-flex align-items-center justify-content-center gap-1">
              <span class="small fw-semibold ${item.pct_excesos > 30 ? 'text-danger' : 'text-muted'}">${item.pct_excesos.toFixed(1)}%</span>
              <div class="progress" style="width: 45px; height: 5px;">
                <div class="progress-bar ${item.pct_excesos > 30 ? 'bg-danger' : 'bg-warning'}" style="width: ${Math.min(100, item.pct_excesos)}%"></div>
              </div>
            </div>
          </td>
          <td>${estadoBadge}</td>
        `;
        tablaTopHorasBody.appendChild(row);
      });
    }

    // Renderizado de Top Dias Mas Ruidosos
    if (tablaTopDiasBody && Array.isArray(stats.top_dias)) {
      tablaTopDiasBody.innerHTML = '';
      if (stats.top_dias.length > 0 && badgeTopDiaPico) {
        badgeTopDiaPico.textContent = `Mas critico: ${stats.top_dias[0].dia_nombre} (${stats.top_dias[0].media_dba} dBA)`;
      }
      if (totalDiasRegistrados) totalDiasRegistrados.textContent = stats.top_dias.length;

      stats.top_dias.forEach((item, index) => {
        const row = document.createElement('tr');
        const pos = index + 1;
        let estadoBadge = '';

        if (item.media_dba >= 60.0 || item.pct_excesos > 20.0) {
          estadoBadge = '<span class="badge bg-danger">Critico</span>';
        } else if (item.media_dba >= 52.0) {
          estadoBadge = '<span class="badge bg-warning text-dark">Moderado</span>';
        } else {
          estadoBadge = '<span class="badge bg-success">Controlado</span>';
        }

        const medal = pos === 1 ? '🥇 ' : (pos === 2 ? '🥈 ' : (pos === 3 ? '🥉 ' : ''));

        row.innerHTML = `
          <td><span class="fw-bold">${medal}#${pos}</span></td>
          <td class="text-start">
            <strong>${item.dia_nombre}</strong>
            <small class="text-muted d-block font-monospace">${item.dia_fecha}</small>
          </td>
          <td><strong class="text-primary fs-6">${item.media_dba.toFixed(2)} dBA</strong></td>
          <td><span class="badge bg-light text-dark border">${item.max_dba.toFixed(2)} dBA</span></td>
          <td><span class="text-muted">${item.muestras} reg</span></td>
          <td>
            <div class="d-flex align-items-center justify-content-center gap-1">
              <span class="small fw-semibold ${item.pct_excesos > 10 ? 'text-danger' : 'text-muted'}">${item.pct_excesos.toFixed(1)}%</span>
              <div class="progress" style="width: 45px; height: 5px;">
                <div class="progress-bar ${item.pct_excesos > 10 ? 'bg-danger' : 'bg-success'}" style="width: ${Math.min(100, item.pct_excesos)}%"></div>
              </div>
            </div>
          </td>
          <td>${estadoBadge}</td>
        `;
        tablaTopDiasBody.appendChild(row);
      });
    }

    if (stats.ultimo_registro) {
      const ult = stats.ultimo_registro;
      if (rUltimoId) rUltimoId.textContent = `#${ult.id}`;
      if (rUltimoHora) rUltimoHora.textContent = `${ult.fecha} ${ult.hora}`;
      if (rUltimoDba) rUltimoDba.textContent = `${ult.decibeles_dba.toFixed(2)} dBA`;
      if (rUltimoBadge) {
        if (ult.supera_umbral) {
          rUltimoBadge.className = 'badge bg-danger-subtle text-danger';
          rUltimoBadge.textContent = 'Supera Umbral (\u226565)';
        } else {
          rUltimoBadge.className = 'badge bg-success-subtle text-success';
          rUltimoBadge.textContent = 'Bajo Norma (<65)';
        }
      }
    }

    if (rStatTimestamp && stats.timestamp_computo) {
      rStatTimestamp.textContent = `Ultimo calculo R: ${stats.timestamp_computo}`;
    }
  }

  // Escuchadores de eventos para recalcular R y capturar muestra
  if (btnRecalcularR) {
    btnRecalcularR.addEventListener('click', async () => {
      btnRecalcularR.disabled = true;
      const originalText = btnRecalcularR.innerHTML;
      btnRecalcularR.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Calculando...';
      try {
        const res = await fetch('/api/estadisticas/recalcular', {
          method: 'POST',
          headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        if (res.ok) {
          const body = await res.json();
          if (body.stats) handleLiveStatsReceived(body.stats);
        }
      } catch (err) {
        console.error('Error al recalcular R:', err);
      } finally {
        btnRecalcularR.disabled = false;
        btnRecalcularR.innerHTML = originalText;
      }
    });
  }

  if (btnCapturarRegistro) {
    btnCapturarRegistro.addEventListener('click', async () => {
      btnCapturarRegistro.disabled = true;
      const originalText = btnCapturarRegistro.innerHTML;
      btnCapturarRegistro.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Capturando...';
      try {
        const snap = audioCore.getSnapshot();
        const candDb = (snap && snap.db && snap.db > -59.5) ? snap.db : -42.5;
        await fetch('/api/capturar_registro', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({ db: candDb })
        });
      } catch (err) {
        console.error('Error al capturar registro:', err);
      } finally {
        setTimeout(() => {
          btnCapturarRegistro.disabled = false;
          btnCapturarRegistro.innerHTML = originalText;
        }, 1500);
      }
    });
  }

  // Cargar metricas R iniciales via HTTP al arrancar
  async function cargarEstadisticasLiveIniciales() {
    try {
      const res = await fetch('/api/estadisticas/live', {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      if (res.ok) {
        const data = await res.json();
        handleLiveStatsReceived(data);
      }
    } catch (e) {
      console.warn('No se pudo precargar estadisticas live de R:', e);
    }
  }
  cargarEstadisticasLiveIniciales();

  // Reloj de actualizacion cada hora en punto (X:00)
  function actualizarCronReloj() {
    const ahora = new Date();
    const proxHora = (ahora.getHours() + 1) % 24;
    const proxHoraStr = `${proxHora < 10 ? '0' : ''}${proxHora}:00`;
    if (proxHoraEnPunto) proxHoraEnPunto.textContent = proxHoraStr;
  }
  setInterval(actualizarCronReloj, 1000);
  actualizarCronReloj();
});
