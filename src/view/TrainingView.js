import { TrainingChart } from './TrainingChart.js';

export const TRAINING_CONFIGS = {
  fast: {
    key:        'fast',
    label:      'Rápido',
    sampleSize: 5000,
    epochs:     15,
    time:       '~30s',
    accuracy:   '~75%',
    desc:       'Ideal para explorar o projeto',
  },
  medium: {
    key:        'medium',
    label:      'Médio',
    sampleSize: 20000,
    epochs:     30,
    time:       '~2 min',
    accuracy:   '~87%',
    desc:       'Equilíbrio entre velocidade e precisão',
  },
  full: {
    key:        'full',
    label:      'Completo',
    sampleSize: null,
    epochs:     50,
    time:       '~5 min',
    accuracy:   '~92%',
    desc:       'Dataset completo, maior precisão',
  },
};

export class TrainingView {
  #el;
  #chart         = null;
  #onStartCallback = null;
  #config        = null;

  constructor(el) {
    this.#el = el;
  }

  onStart(callback) {
    this.#onStartCallback = callback;
  }

  // ── Tela 1: Speed selector ────────────────────────────────────────────────
  showSelector() {
    this.#el.innerHTML = `
      <div class="training-screen">
        <div class="training-header">
          <span class="badge">InsureIQ</span>
          <span class="badge-desc text-tertiary">Selecione a velocidade de treinamento</span>
        </div>

        <div class="speed-grid">
          ${Object.values(TRAINING_CONFIGS).map(cfg => `
            <button class="speed-card" data-key="${cfg.key}">
              <div class="speed-top">
                <span class="speed-label">${cfg.label}</span>
                <span class="speed-time text-tertiary">${cfg.time}</span>
              </div>
              <div class="speed-accuracy">${cfg.accuracy} acurácia</div>
              <div class="speed-desc text-tertiary">${cfg.desc}</div>
            </button>
          `).join('')}
        </div>

        <p class="speed-hint text-tertiary">
          Mais dados e épocas aumentam a acurácia mas levam mais tempo.
          O modelo roda totalmente no browser, sem enviar dados para nenhum servidor.
        </p>
      </div>
    `;

    this.#el.classList.remove('hidden');

    this.#el.querySelectorAll('.speed-card').forEach(card => {
      card.addEventListener('click', () => {
        const key = card.dataset.key;
        this.#config = TRAINING_CONFIGS[key];
        this.#onStartCallback?.(this.#config);
      });
    });
  }

  // ── Tela 2: Training progress + chart ────────────────────────────────────
  showProgress(config) {
    this.#config = config;

    this.#el.innerHTML = `
      <div class="training-screen">
        <div class="training-header">
          <span class="badge beam-border">Treinando</span>
          <span class="text-tertiary" style="font-size:11px">${config.label} · ${config.epochs} épocas · ${config.time} estimado</span>
        </div>

        <div class="training-body beam-border">
          <div class="training-top">
            <span class="training-label text-secondary">Treinando rede neural...</span>
            <span class="training-epoch text-tertiary" id="epoch-label">Época 0/${config.epochs}</span>
          </div>

          <div class="progress-track">
            <div class="progress-fill" id="progress-fill" style="width: 0%"></div>
          </div>

          <div class="metrics-row" id="metrics-row">
            <span class="metric-item">
              <span class="text-tertiary">loss</span>
              <span id="m-loss" class="metric-value">—</span>
            </span>
            <span class="metric-sep"></span>
            <span class="metric-item">
              <span class="text-tertiary">acc</span>
              <span id="m-acc" class="metric-value">—</span>
            </span>
            <span class="metric-sep"></span>
            <span class="metric-item">
              <span class="text-tertiary">val_acc</span>
              <span id="m-val" class="metric-value">—</span>
            </span>
          </div>

          <canvas id="training-chart" class="training-chart"></canvas>
        </div>
      </div>
    `;

    this.#el.classList.remove('hidden');

    // Inicializa chart depois do DOM estar pronto
    requestAnimationFrame(() => {
      const canvas = document.getElementById('training-chart');
      if (canvas) this.#chart = new TrainingChart(canvas, config.epochs);
    });
  }

  update({ epoch, loss, accuracy, valAccuracy }) {
    const total = this.#config?.epochs ?? 50;
    const pct   = Math.round(((epoch + 1) / total) * 100);

    document.getElementById('progress-fill')?.style && (
      document.getElementById('progress-fill').style.width = `${pct}%`
    );

    const epochLabel = document.getElementById('epoch-label');
    if (epochLabel) epochLabel.textContent = `Época ${epoch + 1}/${total}`;

    const mLoss = document.getElementById('m-loss');
    const mAcc  = document.getElementById('m-acc');
    const mVal  = document.getElementById('m-val');

    if (mLoss) mLoss.textContent = loss.toFixed(4);
    if (mAcc)  mAcc.textContent  = `${(accuracy * 100).toFixed(1)}%`;
    if (mVal)  mVal.textContent  = `${(valAccuracy * 100).toFixed(1)}%`;

    this.#chart?.push(loss, valAccuracy);
  }

  complete() {
    const badge  = this.#el.querySelector('.badge');
    const label  = this.#el.querySelector('.training-label');
    const body   = this.#el.querySelector('.training-body');

    if (badge)  { badge.textContent = 'Concluído'; badge.classList.add('badge--success'); badge.classList.remove('beam-border'); }
    if (label)  label.textContent = 'Modelo treinado com sucesso.';
    if (body)   body.classList.remove('beam-border');

    document.getElementById('progress-fill')?.style && (
      document.getElementById('progress-fill').style.width = '100%'
    );
  }

  hide() { this.#el.classList.add('hidden'); }
  show() { this.#el.classList.remove('hidden'); }
}