/**
 * audio-visualizer.js
 * Modulo de renderizado en Canvas para visualizacion de espectro y osciloscopio.
 * Adapta la paleta de colores del tema Spark Admin.
 */

class AudioVisualizer {
  constructor(canvasElement, audioCore) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.audioCore = audioCore;

    this.mode = 'bars'; // 'bars' o 'wave'
    this.animId = null;
    this.isActive = false;

    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
    this.handleResize();
  }

  handleResize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
  }

  setMode(mode) {
    this.mode = mode;
  }

  start() {
    if (this.isActive) return;
    this.isActive = true;
    this.render();
  }

  stop() {
    this.isActive = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    this.clear();
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render() {
    if (!this.isActive) return;
    this.animId = requestAnimationFrame(() => this.render());

    const snapshot = this.audioCore.getSnapshot();
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.ctx.clearRect(0, 0, w, h);

    if (!snapshot) {
      return;
    }

    if (this.mode === 'bars') {
      this.drawFrequencyBars(snapshot.freqData, w, h);
    } else {
      this.drawOscilloscope(snapshot.timeByteData, snapshot.volumePercent, w, h);
    }
  }

  /**
   * Renderiza el espectro de frecuencias en barras verticales con gradiente Spark Admin.
   */
  drawFrequencyBars(freqData, width, height) {
    const barCount = 56;
    const step = Math.floor(freqData.length / barCount);
    const barWidth = (width / barCount) - 2;

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += freqData[i * step + j];
      }

      const avg = sum / step;
      const barHeight = (avg / 255) * (height * 0.92);
      const x = i * (barWidth + 2);
      const y = height - barHeight;

      // Gradiente inspirado en Spark Admin: Cian -> Esmeralda -> Verde Lima -> Ambar -> Rojo
      const grad = this.ctx.createLinearGradient(0, height, 0, 0);
      grad.addColorStop(0, '#0284c7');
      grad.addColorStop(0.35, '#10b981');
      grad.addColorStop(0.7, '#b4f105');
      grad.addColorStop(0.9, '#f59e0b');
      grad.addColorStop(1, '#ef4444');

      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      if (this.ctx.roundRect) {
        this.ctx.roundRect(x, y, barWidth, Math.max(2, barHeight), [3, 3, 0, 0]);
      } else {
        this.ctx.rect(x, y, barWidth, Math.max(2, barHeight));
      }
      this.ctx.fill();
    }
  }

  /**
   * Renderiza la forma de onda en tiempo real (osciloscopio).
   */
  drawOscilloscope(timeData, volumePercent, width, height) {
    this.ctx.lineWidth = 2.5;
    this.ctx.strokeStyle = volumePercent > 5 ? '#b4f105' : '#475569';
    this.ctx.beginPath();

    const sliceWidth = width / timeData.length;
    let x = 0;

    for (let i = 0; i < timeData.length; i++) {
      const v = timeData[i] / 128.0;
      const y = (v * height) / 2;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    this.ctx.lineTo(width, height / 2);
    this.ctx.stroke();
  }
}

window.AudioVisualizer = AudioVisualizer;
