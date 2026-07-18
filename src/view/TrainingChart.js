export class TrainingChart {
  #canvas;
  #ctx;
  #lossData    = [];
  #accData     = [];
  #totalEpochs = 50;

  constructor(canvas, totalEpochs) {
    this.#canvas      = canvas;
    this.#ctx         = canvas.getContext('2d');
    this.#totalEpochs = totalEpochs;
    this.#setSize();
  }

  #setSize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.#canvas.getBoundingClientRect();
    this.#canvas.width  = rect.width  * dpr;
    this.#canvas.height = rect.height * dpr;
    this.#ctx.scale(dpr, dpr);
  }

  push(loss, valAcc) {
    this.#lossData.push(loss);
    this.#accData.push(valAcc);
    this.#draw();
  }

  #draw() {
    const ctx    = this.#ctx;
    const W      = this.#canvas.getBoundingClientRect().width;
    const H      = this.#canvas.getBoundingClientRect().height;
    const padL   = 36;
    const padR   = 12;
    const padT   = 12;
    const padB   = 24;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + chartW, y);
      ctx.stroke();
    }

    // Y labels
    ctx.fillStyle  = '#62666d';
    ctx.font       = '10px Inter, sans-serif';
    ctx.textAlign  = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = 1 - (i / 4);
      const y   = padT + (chartH / 4) * i;
      ctx.fillText(val.toFixed(1), padL - 4, y + 3);
    }

    const n = this.#lossData.length;
    if (n < 2) return;

    const xOf = (i) => padL + (i / (this.#totalEpochs - 1)) * chartW;
    const yOf = (v) => padT + (1 - Math.min(v, 1.5) / 1.5) * chartH;

    // Loss line (dim orange)
    this.#drawLine(ctx, this.#lossData, xOf, yOf, 'rgba(251,146,60,0.7)');

    // Val acc line (green)
    this.#drawLine(ctx, this.#accData, xOf, yOf, 'rgba(74,222,128,0.9)');

    // Legend
    ctx.textAlign = 'left';
    ctx.font      = '10px Inter, sans-serif';

    ctx.fillStyle = 'rgba(251,146,60,0.8)';
    ctx.fillRect(padL, H - padB + 6, 8, 2);
    ctx.fillStyle = '#62666d';
    ctx.fillText('loss', padL + 12, H - padB + 9);

    ctx.fillStyle = 'rgba(74,222,128,0.9)';
    ctx.fillRect(padL + 48, H - padB + 6, 8, 2);
    ctx.fillStyle = '#62666d';
    ctx.fillText('val_acc', padL + 60, H - padB + 9);
  }

  #drawLine(ctx, data, xOf, yOf, color) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    data.forEach((v, i) => {
      const x = xOf(i);
      const y = yOf(v);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}