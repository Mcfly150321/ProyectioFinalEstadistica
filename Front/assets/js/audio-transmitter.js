/**
 * audio-transmitter.js
 * Cliente WebSocket de Monitoreo (/ws/client).
 * Recibe en tiempo real el flujo de audio binario del ESP32 y su estado de conexion/grabacion.
 * No envia audio desde el navegador.
 */

class EspMonitorClient {
  constructor(audioCore, options = {}) {
    this.audioCore = audioCore;
    this.password = options.password || '';
    this.socket = null;
    this.reconnectTimer = null;
    this.shouldReconnect = false;

    this.onEspStatusChange = options.onEspStatusChange || (() => {});
    this.onPacketReceived = options.onPacketReceived || (() => {});
    this.onAuthError = options.onAuthError || (() => {});
  }

  /**
   * Verifica la clave WEB_PASSWORD contra el endpoint /api/auth.
   */
  async verifyPassword(password) {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data.authenticated);
    } catch (err) {
      console.error('Error al verificar clave:', err);
      return false;
    }
  }

  /**
   * Inicia la conexion WebSocket autenticada con el servidor para monitorear al ESP32.
   */
  connect(password) {
    if (password !== undefined) {
      this.password = password;
    }
    this.shouldReconnect = true;
    this.openSocket();
  }

  openSocket() {
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {}
      this.socket = null;
    }

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:5000';
    const encodedPass = encodeURIComponent(this.password);
    const wsUrl = `${wsProto}//${host}/ws/client?password=${encodedPass}`;

    try {
      this.socket = new WebSocket(wsUrl);
      this.socket.binaryType = 'arraybuffer';

      this.socket.onopen = () => {
        console.log('[Monitor] Conectado al servidor de monitoreo.');
      };

      this.socket.onmessage = async (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'status') {
              this.onEspStatusChange({
                espConnected: Boolean(msg.esp_connected),
                recording: Boolean(msg.recording)
              });
            }
          } catch (e) {
            console.warn('Mensaje JSON invalido:', e);
          }
        } else {
          // Paquete binario PCM16 proveniente del ESP32
          const buffer = event.data instanceof ArrayBuffer
            ? event.data
            : await event.data.arrayBuffer();

          const snapshot = this.audioCore.feedPcm16(buffer);
          if (snapshot) {
            this.onPacketReceived(snapshot);
          }
        }
      };

      this.socket.onclose = (event) => {
        // Codigo 1008 indica rechazo por clave incorrecta
        if (event.code === 1008) {
          this.shouldReconnect = false;
          this.onAuthError();
          return;
        }
        this.onEspStatusChange({ espConnected: false, recording: false });
        if (this.shouldReconnect) {
          this.reconnectTimer = setTimeout(() => this.openSocket(), 3000);
        }
      };

      this.socket.onerror = () => {
        // Manejado en onclose
      };
    } catch (err) {
      console.error('Error al abrir WebSocket:', err);
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

window.EspMonitorClient = EspMonitorClient;
