/**
 * audio-core.js
 * Modulo encargado de la captura de audio nativa mediante Web Audio API.
 * Extrae metricas continuas de nivel (RMS, dB), frecuencia dominante y muestras PCM.
 */

class AudioCore {
  constructor(options = {}) {
    this.fftSize = options.fftSize || 512;
    this.smoothingTimeConstant = options.smoothingTimeConstant || 0.8;

    this.audioCtx = null;
    this.analyser = null;
    this.micStream = null;
    this.isRunning = false;
  }

  /**
   * Solicita acceso al microfono del navegador y configura el grafo Web Audio.
   */
  async start() {
    if (this.isRunning) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("API de captura no soportada en este contexto (se requiere HTTPS o localhost).");
    }

    // Configuracion sin filtros agresivos de telefonia para capturar audio fiel
    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    };

    this.micStream = await navigator.mediaDevices.getUserMedia(constraints);

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioContextClass();

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = this.smoothingTimeConstant;

    const source = this.audioCtx.createMediaStreamSource(this.micStream);
    source.connect(this.analyser);

    this.isRunning = true;
    return this.audioCtx;
  }

  /**
   * Detiene el flujo de audio y libera los recursos del microfono.
   */
  stop() {
    this.isRunning = false;

    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
      this.audioCtx = null;
    }

    this.analyser = null;
  }

  /**
   * Obtiene los arreglos de datos actuales en frecuencia y tiempo.
   */
  getSnapshot() {
    if (!this.analyser) {
      return null;
    }

    const bufferLen = this.analyser.frequencyBinCount;
    const freqData = new Uint8Array(bufferLen);
    const timeByteData = new Uint8Array(bufferLen);
    const timeFloatData = new Float32Array(bufferLen);

    this.analyser.getByteFrequencyData(freqData);
    this.analyser.getByteTimeDomainData(timeByteData);
    this.analyser.getFloatTimeDomainData(timeFloatData);

    // Calculo de RMS e identificacion de frecuencia dominante (pico)
    let sumSquares = 0;
    let peakVal = 0;
    let peakIndex = 0;

    for (let i = 0; i < bufferLen; i++) {
      const val = timeFloatData[i];
      sumSquares += val * val;

      if (freqData[i] > peakVal) {
        peakVal = freqData[i];
        peakIndex = i;
      }
    }

    const rms = Math.sqrt(sumSquares / bufferLen);
    const volumePercent = Math.min(100, Math.round(rms * 190));
    const db = rms > 0.0001 ? +(20 * Math.log10(rms)).toFixed(2) : -60.0;

    const nyquist = (this.audioCtx ? this.audioCtx.sampleRate : 44100) / 2;
    const peakHz = Math.round((peakIndex * nyquist) / bufferLen);

    return {
      timestamp: Date.now(),
      sampleRate: this.audioCtx ? this.audioCtx.sampleRate : 44100,
      bufferLength: bufferLen,
      rms: +rms.toFixed(4),
      db: db,
      volumePercent: volumePercent,
      peakFrequencyHz: peakVal > 20 ? peakHz : 0,
      freqData: freqData,
      timeByteData: timeByteData,
      timeFloatData: timeFloatData
    };
  }
}

window.AudioCore = AudioCore;
