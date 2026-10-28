/**
 * audio-transmitter.js
 * Modulo de transmision continua de datos hacia el servidor (ngrok / backend local).
 * Soporta Fetch POST (HTTP) y WebSocket (WS).
 */

class AudioTransmitter {
  constructor(audioCore, options = {}) {
    this.audioCore = audioCore;
    this.protocol = options.protocol || 'fetch'; // 'fetch' o 'ws'
    this.serverUrl = options.serverUrl || '/api/audio-stream';
    this.rateMs = options.rateMs || 100;
    this.sendRaw = options.sendRaw || false;

    this.timer = null;
    this.socket = null;
    this.isTransmitting = false;

    // Callbacks
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onPacketSent = options.onPacketSent || (() => {});
  }

  setProtocol(protocol) {
    this.protocol = protocol;
  }

  setServerUrl(url) {
    this.serverUrl = url;
  }

  setRate(rateMs) {
    this.rateMs = rateMs;
    if (this.isTransmitting) {
      this.stop();
      this.start();
    }
  }

  setSendRaw(sendRaw) {
    this.sendRaw = sendRaw;
  }

  start() {
    if (this.isTransmitting) return;
    this.isTransmitting = true;

    if (this.protocol === 'ws') {
      this.initWebSocket();
    } else {
      this.onStatusChange('active', 'Transmitiendo via HTTP POST');
    }

    this.timer = setInterval(() => this.dispatchPacket(), this.rateMs);
  }

  stop() {
    this.isTransmitting = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.onStatusChange('idle', 'Detenido');
  }

  initWebSocket() {
    try {
      this.onStatusChange('connecting', 'Conectando WebSocket...');
      this.socket = new WebSocket(this.serverUrl);

      this.socket.onopen = () => {
        this.onStatusChange('active', 'WebSocket Conectado');
      };

      this.socket.onerror = (err) => {
        this.onStatusChange('error', 'Error en conexion WebSocket');
      };

      this.socket.onclose = () => {
        if (this.isTransmitting) {
          this.onStatusChange('error', 'WebSocket Desconectado');
        }
      };
    } catch (err) {
      this.onStatusChange('error', 'Error al crear WebSocket');
    }
  }

  dispatchPacket() {
    if (!this.isTransmitting) return;

    const snapshot = this.audioCore.getSnapshot();
    if (!snapshot) return;

    const payload = {
      timestamp: snapshot.timestamp,
      sampleRate: snapshot.sampleRate,
      rms: snapshot.rms,
      db: snapshot.db,
      peakFrequencyHz: snapshot.peakFrequencyHz,
      rawSamples: this.sendRaw ? Array.from(snapshot.timeFloatData) : undefined
    };

    if (this.protocol === 'ws') {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(payload));
        this.onPacketSent(payload);
      }
    } else {
      // Fetch POST continuo (no bloqueante)
      fetch(this.serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      .then(res => {
        if (res.ok) {
          this.onPacketSent(payload);
        }
      })
      .catch(() => {
        // En caso de corte momentaneo de red
      });
    }
  }
}

window.AudioTransmitter = AudioTransmitter;
