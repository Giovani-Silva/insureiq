export class TrainingView {
  #el;

  constructor(el) {
    this.#el = el;
  }

  show() {
    this.#el.innerHTML = `
      <div class="training-screen">
        <div class="training-header">
          <span class="badge">Iniciando modelo</span>
        </div>
        <div class="training-body">
          <p class="training-label">Treinando rede neural...</p>
          <div class="progress-track">
            <div class="progress-fill" id="progress-fill" style="width: 0%"></div>
          </div>
          <div class="training-metrics">
            <span id="epoch-label">Época 0/50</span>
            <span id="metrics-label" class="text-tertiary">aguardando...</span>
          </div>
          <div class="training-log" id="training-log"></div>
        </div>
      </div>
    `;
    this.#el.classList.remove('hidden');
  }

  update({ epoch, loss, accuracy, valAccuracy }) {
    const total = 50;
    const pct = Math.round(((epoch + 1) / total) * 100);

    const fill = document.getElementById('progress-fill');
    const epochLabel = document.getElementById('epoch-label');
    const metricsLabel = document.getElementById('metrics-label');
    const log = document.getElementById('training-log');

    if (fill) fill.style.width = `${pct}%`;
    if (epochLabel) epochLabel.textContent = `Época ${epoch + 1}/${total}`;
    if (metricsLabel) {
      metricsLabel.textContent =
        `loss ${loss.toFixed(4)} · acc ${(accuracy * 100).toFixed(1)}% · val_acc ${(valAccuracy * 100).toFixed(1)}%`;
    }

    if (log && (epoch + 1) % 10 === 0) {
      const line = document.createElement('div');
      line.className = 'log-line';
      line.textContent = `[${epoch + 1}/${total}] loss: ${loss.toFixed(4)} | acc: ${(accuracy * 100).toFixed(1)}% | val: ${(valAccuracy * 100).toFixed(1)}%`;
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
    }
  }

  complete() {
    const badge = this.#el.querySelector('.badge');
    const label = this.#el.querySelector('.training-label');
    if (badge) { badge.textContent = 'Modelo pronto'; badge.classList.add('badge--success'); }
    if (label) label.textContent = 'Treinamento concluído. Selecione um perfil.';
  }

  hide() { this.#el.classList.add('hidden'); }
}
