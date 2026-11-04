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
   * encola el audio en el Jitter Buffer de Web Audio API y actualiza metricas.
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

    if (this.audioCtx && this.audioCtx.state === 'running') {
      const audioBuffer = this.audioCtx.createBuffer(1, numSamples, this.sampleRate);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.analyser);

      const currentTime = this.audioCtx.currentTime;
      // Si se quedo atras o se adelanto demasiado (> 0.5s), re-sincronizar a 150 ms
      if (this.nextStartTime < currentTime || this.nextStartTime > currentTime + 0.5) {
        this.nextStartTime = currentTime + 0.15;
      }
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
    }

    const bins = this.fftSize / 2;
    const timeByteData = this.latestSnapshot.timeByteData;
    const freqData = this.latestSnapshot.freqData;

    if (this.analyser && this.audioCtx && this.audioCtx.state === 'running') {
      this.analyser.getByteFrequencyData(freqData);
      this.analyser.getByteTimeDomainData(timeByteData);

      let maxBinVal = 0;
      let maxBinIdx = 0;
      for (let i = 1; i < bins; i++) {
        if (freqData[i] > maxBinVal) {
          maxBinVal = freqData[i];
          maxBinIdx = i;
        }
      }
      if (maxBinVal > 20) {
        const nyquist = this.sampleRate / 2;
        peakHz = Math.round((maxBinIdx * nyquist) / bins);
      }
    } else {
      for (let i = 0; i < bins; i++) {
        const sampleIdx = Math.min(numSamples - 1, Math.floor((i * numSamples) / bins));
        timeByteData[i] = Math.max(0, Math.min(255, Math.round((float32Data[sampleIdx] + 1.0) * 127.5)));
      }
    }

    this.lastPacketTime = Date.now();
    this.latestSnapshot.timestamp = this.lastPacketTime;
    this.latestSnapshot.rms = +rms.toFixed(4);
    this.latestSnapshot.db = db;
    this.latestSnapshot.volumePercent = volumePercent;
    this.latestSnapshot.peakFrequencyHz = peakHz;

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

    this.lastPacketTime = Date.now();
    this.latestSnapshot.timestamp = msg.timestamp || this.lastPacketTime;
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
      return this.latestSnapshot;
    }

    if (this.analyser && this.audioCtx && this.audioCtx.state === 'running') {
      this.analyser.getByteFrequencyData(this.latestSnapshot.freqData);
      this.analyser.getByteTimeDomainData(this.latestSnapshot.timeByteData);
    }

    return this.latestSnapshot;
  }
}

window.AudioCore = AudioCore;
