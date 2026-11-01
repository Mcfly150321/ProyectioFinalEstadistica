/**
 * audio-core.js
 * Motor de recepcion, decodificacion, analisis espectral y reproduccion del
 * flujo PCM de 16 bits (16 kHz) enviado por el ESP32 (INMP441).
 * No utiliza microfono del navegador; opera exclusivamente como monitor.
 */

class AudioCore {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 16000;
    this.fftSize = options.fftSize || 512;
    this.smoothingTimeConstant = options.smoothingTimeConstant || 0.8;

    this.audioCtx = null;
    this.analyser = null;
    this.gainNode = null;

    this.isPlaybackEnabled = false;
    this.nextStartTime = 0;
    this.lastPacketTime = 0;

    // Ultimo estado calculado a partir de los paquetes del ESP32
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
   * Inicializa el AudioContext tras interaccion del usuario (login o boton de audio).
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
      this.audioCtx.resume();
    }
  }

  /**
   * Activa o silencia la salida de altavoz del navegador para escuchar al ESP32.
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
   * calcula metricas en tiempo real y encola el audio en el Jitter Buffer.
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
    const volumePercent = Math.min(100, Math.round(rms * 190));
    const db = rms > 0.0001 ? Math.max(-60.0, +(20 * Math.log10(rms)).toFixed(2)) : -60.0;

    // Frecuencia estimada por cruce por cero como base
    const durationSec = numSamples / this.sampleRate;
    let peakHz = (rms > 0.008 && durationSec > 0)
      ? Math.round((zeroCrossings / 2) / durationSec)
      : 0;

    // Si el AudioContext esta corriendo, encolar para reproduccion y FFT por hardware
    if (this.audioCtx && this.audioCtx.state === 'running') {
      const audioBuffer = this.audioCtx.createBuffer(1, numSamples, this.sampleRate);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.analyser);

      const currentTime = this.audioCtx.currentTime;
      // Jitter buffer de 150 ms para absorber variaciones de red sin cortes
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime + 0.15;
      }
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
    }

    // Actualizar arreglos de visualizacion
    const bins = this.fftSize / 2;
    const timeByteData = new Uint8Array(bins);
    const freqData = new Uint8Array(bins);

    if (this.analyser && this.audioCtx && this.audioCtx.state === 'running') {
      this.analyser.getByteFrequencyData(freqData);
      this.analyser.getByteTimeDomainData(timeByteData);

      // Si el AnalyserNode tiene pico claro, usar su frecuencia dominante exacta
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
      // Fallback por software cuando el AudioContext aun no ha sido activado
      for (let i = 0; i < bins; i++) {
        const sampleIdx = Math.min(numSamples - 1, Math.floor((i * numSamples) / bins));
        timeByteData[i] = Math.max(0, Math.min(255, Math.round((float32Data[sampleIdx] + 1.0) * 127.5)));
      }
      // Aproximacion de espectro para visualizacion inmediata sin requerir clic
      if (peakHz > 0) {
        const nyquist = this.sampleRate / 2;
        const centerBin = Math.min(bins - 1, Math.max(0, Math.round((peakHz / nyquist) * bins)));
        const mag = Math.min(255, Math.round(volumePercent * 2.5));
        for (let i = 0; i < bins; i++) {
          const dist = Math.abs(i - centerBin);
          freqData[i] = Math.max(0, Math.round(mag * Math.exp(-(dist * dist) / 18)));
        }
      }
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
   * Devuelve el estado actual para el renderizador de Canvas a 60 FPS.
   * Si el ESP32 deja de transmitir por mas de 400 ms, decae suavemente a silencio.
   */
  getSnapshot() {
    const elapsed = Date.now() - this.lastPacketTime;

    if (elapsed > 400) {
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
