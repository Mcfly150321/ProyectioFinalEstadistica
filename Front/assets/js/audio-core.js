/**
 * audio-core.js
 * Motor de recepcion, decodificacion, analisis espectral y reproduccion del
 * flujo PCM de 16 bits (16 kHz) enviado por el ESP32 (INMP441).
 * Opera exclusivamente como monitor de los datos enviados por el servidor.
 */

class AudioCore {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 16000;
    this.fftSize = options.fftSize || 512;
    this.smoothingTimeConstant = options.smoothingTimeConstant || 0.75;

    this.audioCtx = null;
    this.analyser = null;
    this.gainNode = null;

    this.isPlaybackEnabled = false;
    this.nextStartTime = 0;
    this.lastPacketTime = 0;

    const bins = this.fftSize / 2;
    this.latestSnapshot = {
      timestamp: Date.now(),
      sampleRate: this.sampleRate,
      bufferLength: bins,
      rms: 0,
      db: -60.0,
      volumePercent: 0,
      peakFrequencyHz: 0,
      freqData: new Uint8Array(bins),
      timeByteData: new Uint8Array(bins).fill(128),
      timeFloatData: new Float32Array(bins)
    };
  }

  /**
   * Inicializa el AudioContext tras interaccion del usuario.
   */
  initAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass({ sampleRate: this.sampleRate });

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = this.smoothingTimeConstant;

      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.isPlaybackEnabled ? 1.0 : 0.0;

      this.analyser.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  /**
   * Activa o silencia la reproduccion por altavoces del navegador.
   */
  setPlaybackEnabled(enabled) {
    this.isPlaybackEnabled = Boolean(enabled);
    this.initAudioContext();
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setValueAtTime(
        this.isPlaybackEnabled ? 1.0 : 0.0,
        this.audioCtx.currentTime
      );
    }
    return this.isPlaybackEnabled;
  }

  togglePlayback() {
    return this.setPlaybackEnabled(!this.isPlaybackEnabled);
  }

  /**
   * Recibe un ArrayBuffer con muestras PCM Int16 (16 kHz) provenientes del ESP32,
   * calcula espectro, forma de onda y metricas en tiempo real, y reproduce el audio si esta activo.
   */
  feedPcm16(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 2) return null;

    const int16Data = new Int16Array(arrayBuffer);
    const numSamples = int16Data.length;
    const float32Data = new Float32Array(numSamples);

    let sumSquares = 0;
    let zeroCrossings = 0;
    let prevVal = int16Data[0];

    for (let i = 0; i < numSamples; i++) {
      const s = int16Data[i];
      const norm = s / 32768.0;
      float32Data[i] = norm;
      sumSquares += norm * norm;

      if ((prevVal < 0 && s >= 0) || (prevVal >= 0 && s < 0)) {
        zeroCrossings++;
      }
      prevVal = s;
    }

    const rms = Math.sqrt(sumSquares / numSamples);
    const db = rms > 0.0001 ? Math.max(-60.0, +(20 * Math.log10(rms)).toFixed(2)) : -60.0;
    const volumePercent = Math.min(100, Math.max(0, Math.round(((db + 60) / 60) * 100)));

    const durationSec = numSamples / this.sampleRate;
    let peakHz = (rms > 0.008 && durationSec > 0)
      ? Math.round((zeroCrossings / 2) / durationSec)
      : 0;

    // Encolar audio en Web Audio API para reproduccion fluida con Jitter Buffer
    if (this.isPlaybackEnabled) {
      this.initAudioContext();
    }
    if (this.audioCtx && this.audioCtx.state === 'running') {
      const audioBuffer = this.audioCtx.createBuffer(1, numSamples, this.sampleRate);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.analyser);

      const currentTime = this.audioCtx.currentTime;
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime + 0.12;
      }
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
    }

    // Construir forma de onda (timeByteData) y espectro (freqData) directamente desde el bloque PCM
    const bins = this.fftSize / 2;
    const timeByteData = new Uint8Array(bins);
    const freqData = new Uint8Array(bins);

    for (let i = 0; i < bins; i++) {
      const sampleIdx = Math.min(numSamples - 1, Math.floor((i * numSamples) / bins));
      // Ganancia visual x2.5 para apreciar claramente la onda en el osciloscopio
      const amplified = Math.max(-1.0, Math.min(1.0, float32Data[sampleIdx] * 2.5));
      timeByteData[i] = Math.max(0, Math.min(255, Math.round((amplified + 1.0) * 127.5)));
    }

    // Analisis espectral directo sobre el bloque PCM recibido (64 bandas interpoladas a bins)
    const numBands = 64;
    const N = Math.min(numSamples, 256);
    const bandMagnitudes = new Float32Array(numBands);
    let maxMag = 0;
    let maxBand = 0;

    for (let k = 1; k < numBands; k++) {
      let re = 0;
      let im = 0;
      const freqStep = (2 * Math.PI * k) / (numBands * 2);
      for (let n = 0; n < N; n += 2) {
        const sample = float32Data[n];
        const angle = freqStep * n;
        re += sample * Math.cos(angle);
        im -= sample * Math.sin(angle);
      }
      const mag = Math.sqrt(re * re + im * im) / (N / 2);
      bandMagnitudes[k] = mag;
      if (mag > maxMag) {
        maxMag = mag;
        maxBand = k;
      }
    }

    if (maxMag > 0.002 && rms > 0.005) {
      const nyquist = this.sampleRate / 2;
      const dftPeakHz = Math.round((maxBand / numBands) * nyquist);
      if (dftPeakHz > 0) {
        peakHz = dftPeakHz;
      }
    }

    for (let i = 0; i < bins; i++) {
      const bandIdx = Math.min(numBands - 1, Math.floor((i * numBands) / bins));
      const mag = bandMagnitudes[bandIdx];
      // Escala logaritmica para visualizacion rica del espectro
      const dbBand = mag > 0.00005 ? Math.max(-65, 20 * Math.log10(mag * 8)) : -65;
      const targetVal = Math.max(0, Math.min(255, Math.round(((dbBand + 65) / 65) * 255)));
      // Suavizado temporal con el frame previo
      freqData[i] = Math.round(this.latestSnapshot.freqData[i] * 0.45 + targetVal * 0.55);
    }

    this.lastPacketTime = Date.now();
    this.latestSnapshot = {
      timestamp: this.lastPacketTime,
      sampleRate: this.sampleRate,
      bufferLength: bins,
      rms: +rms.toFixed(4),
      db: db,
      volumePercent: volumePercent,
      peakFrequencyHz: peakHz,
      freqData: freqData,
      timeByteData: timeByteData,
      timeFloatData: float32Data.subarray(0, bins)
    };

    return this.latestSnapshot;
  }

  /**
   * Actualiza metricas cuando llegan en formato JSON desde el servidor.
   */
  feedMetrics(msg) {
    if (!msg) return null;
    const rms = Number(msg.rms || 0);
    const db = Number(msg.db !== undefined ? msg.db : -60.0);
    const peakHz = Number(msg.peakFrequencyHz || 0);
    const volumePercent = Math.min(100, Math.max(0, Math.round(((db + 60) / 60) * 100)));

    // Si hace mas de 150 ms que no entra binario pero si JSON, actualizar snapshot
    const now = Date.now();
    this.lastPacketTime = now;
    this.latestSnapshot.timestamp = msg.timestamp || now;
    this.latestSnapshot.rms = +rms.toFixed(4);
    this.latestSnapshot.db = +db.toFixed(2);
    this.latestSnapshot.volumePercent = volumePercent;
    this.latestSnapshot.peakFrequencyHz = peakHz;

    return this.latestSnapshot;
  }

  /**
   * Devuelve el estado actual para el renderizador de Canvas a 60 FPS.
   */
  getSnapshot() {
    const elapsed = Date.now() - this.lastPacketTime;

    if (elapsed > 500) {
      const bins = this.fftSize / 2;
      for (let i = 0; i < bins; i++) {
        this.latestSnapshot.freqData[i] = Math.floor(this.latestSnapshot.freqData[i] * 0.85);
        this.latestSnapshot.timeByteData[i] = 128;
      }
      this.latestSnapshot.rms = 0;
      this.latestSnapshot.db = -60.0;
      this.latestSnapshot.volumePercent = 0;
      this.latestSnapshot.peakFrequencyHz = 0;
    }

    return this.latestSnapshot;
  }
}

window.AudioCore = AudioCore;
