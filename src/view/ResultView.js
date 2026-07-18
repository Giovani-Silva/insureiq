const RISK_CONFIG = {
  0: { label: 'Baixo',       color: 'risk-low'         },
  1: { label: 'Médio-Baixo', color: 'risk-medium-low'  },
  2: { label: 'Médio-Alto',  color: 'risk-medium-high' },
  3: { label: 'Alto',        color: 'risk-high'        },
};

const RISK_LABELS = ['Baixo', 'Médio-Baixo', 'Médio-Alto', 'Alto'];

const DRIVING_OPTIONS = ['Clean', 'Minor Violations', 'Major Violations', 'Accident', 'DUI'];

const DRIVING_LABELS = {
  'Clean':            'Limpo',
  'Minor Violations': 'Infrações leves',
  'Major Violations': 'Infrações graves',
  'Accident':         'Acidente',
  'DUI':              'DUI',
};

export class ResultView {
  #el;
  #onBackCallback     = null;
  #onClassifyCallback = null;
  #currentProfile     = null;
  #debounceTimer      = null;

  constructor(el) { this.#el = el; }

  onBack(callback)     { this.#onBackCallback     = callback; }
  onClassify(callback) { this.#onClassifyCallback = callback; }

  // Abre o editor interativo com o perfil base
  showEditor(profile) {
    this.#currentProfile = { ...profile };

    this.#el.innerHTML = `
      <div class="interactive-screen">

        <div class="interactive-header">
          <button class="back-btn" id="back-btn">← Voltar</button>
          <span class="interactive-hint text-tertiary">Edite os atributos e veja o risco mudar em tempo real</span>
        </div>

        <div class="interactive-grid">

          <!-- Painel esquerdo: perfil + editor -->
          <div class="editor-panel">

            <div class="profile-mini">
              <span class="profile-avatar-lg">${profile.avatar}</span>
              <div>
                <div class="result-profile-name">${profile.nome}</div>
                <div class="result-profile-meta text-secondary">${profile.ocupacao} · ${profile.idade} anos</div>
              </div>
            </div>

            <div class="editor-fields">
              <div class="editor-section-label text-tertiary">Atributos</div>

              <!-- Direção -->
              <div class="field-group">
                <label class="field-label">Direção</label>
                <select class="field-select" data-field="registroDirecao">
                  ${DRIVING_OPTIONS.map(v => `
                    <option value="${v}" ${profile.registroDirecao === v ? 'selected' : ''}>
                      ${DRIVING_LABELS[v]}
                    </option>
                  `).join('')}
                </select>
              </div>

              <!-- Score de crédito -->
              <div class="field-group">
                <div class="field-header">
                  <label class="field-label">Score de crédito</label>
                  <span class="field-value" id="credit-val">${profile.creditScore}</span>
                </div>
                <div class="range-row">
                  <span class="range-min text-tertiary">500</span>
                  <input type="range" class="field-range" data-field="creditScore"
                    min="500" max="850" step="10" value="${profile.creditScore}">
                  <span class="range-max text-tertiary">850</span>
                </div>
              </div>

              <!-- Sinistros -->
              <div class="field-group">
                <div class="field-header">
                  <label class="field-label">Sinistros</label>
                  <div class="field-stepper">
                    <button class="step-btn" data-field="historicoSinistros" data-dir="-1" data-min="0" data-max="5">−</button>
                    <span class="step-value" id="claims-val">${profile.historicoSinistros}</span>
                    <button class="step-btn" data-field="historicoSinistros" data-dir="1" data-min="0" data-max="5">+</button>
                  </div>
                </div>
              </div>

              <!-- Sinistros anteriores -->
              <div class="field-group">
                <div class="field-header">
                  <label class="field-label">Sinistros anteriores</label>
                  <div class="field-stepper">
                    <button class="step-btn" data-field="sinistrosAnteriores" data-dir="-1" data-min="0" data-max="3">−</button>
                    <span class="step-value" id="prev-val">${profile.sinistrosAnteriores}</span>
                    <button class="step-btn" data-field="sinistrosAnteriores" data-dir="1" data-min="0" data-max="3">+</button>
                  </div>
                </div>
              </div>

              <!-- Idade -->
              <div class="field-group">
                <div class="field-header">
                  <label class="field-label">Idade</label>
                  <span class="field-value" id="age-val">${profile.idade}</span>
                </div>
                <div class="range-row">
                  <span class="range-min text-tertiary">18</span>
                  <input type="range" class="field-range" data-field="idade"
                    min="18" max="70" step="1" value="${profile.idade}">
                  <span class="range-max text-tertiary">70</span>
                </div>
              </div>

            </div>
          </div>

          <!-- Painel direito: resultado em tempo real -->
          <div class="result-live" id="result-live">
            <div class="result-computing-state">
              <span class="text-tertiary" style="font-size:12px">Calculando...</span>
              <div class="verdict-skeleton"></div>
            </div>
          </div>

        </div>
      </div>
    `;

    this.#el.classList.remove('hidden');
    this.#bindEvents();
    this.#triggerClassify(false);
  }

  // Atualiza apenas o painel de resultado
  updateResult({ riskLevel, confidence, probabilities, recommended }) {
    const liveEl = document.getElementById('result-live');
    if (!liveEl) return;

    liveEl.classList.remove('beam-border');

    const risk = RISK_CONFIG[riskLevel];

    liveEl.innerHTML = `
      <div class="result-verdict">
        <div class="verdict-label text-tertiary">Perfil de risco</div>
        <div class="verdict-risk ${risk.color}">
          <span class="verdict-dot"></span>
          ${risk.label}
        </div>
        <div class="verdict-confidence text-secondary">
          ${(confidence * 100).toFixed(1)}% de confiança
        </div>
      </div>

      <div class="result-probs">
        <div class="probs-label text-tertiary">Distribuição de probabilidade</div>
        ${probabilities.map((p, i) => `
          <div class="prob-row">
            <span class="prob-name ${RISK_CONFIG[i].color}">${RISK_LABELS[i]}</span>
            <div class="prob-track">
              <div class="prob-fill ${RISK_CONFIG[i].color}-fill" style="width: ${(p * 100).toFixed(0)}%"></div>
            </div>
            <span class="prob-pct text-secondary">${(p * 100).toFixed(0)}%</span>
          </div>
        `).join('')}
      </div>

      <div class="result-products">
        <div class="products-label text-tertiary">Produtos recomendados</div>
        <div class="products-grid">
          ${recommended.map(p => `
            <div class="product-card">
              <div class="product-icon">${p.icon}</div>
              <div class="product-info">
                <div class="product-name">${p.nome}</div>
                <div class="product-price text-secondary">${p.mensalidade}/mês</div>
                <div class="product-coverage text-tertiary">${p.coberturas.slice(0, 2).join(' · ')}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  #bindEvents() {
    document.getElementById('back-btn')?.addEventListener('click', () => {
      clearTimeout(this.#debounceTimer);
      this.#onBackCallback?.();
    });

    this.#el.querySelectorAll('select[data-field]').forEach(el => {
      el.addEventListener('change', () => {
        this.#currentProfile[el.dataset.field] = el.value;
        this.#triggerClassify();
      });
    });

    this.#el.querySelectorAll('input[type="range"][data-field]').forEach(el => {
      el.addEventListener('input', () => {
        const field = el.dataset.field;
        const val   = Number(el.value);
        this.#currentProfile[field] = val;
        const map = { creditScore: 'credit-val', idade: 'age-val' };
        if (map[field]) document.getElementById(map[field]).textContent = val;
        this.#triggerClassify();
      });
    });

    this.#el.querySelectorAll('.step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const field  = btn.dataset.field;
        const dir    = Number(btn.dataset.dir);
        const min    = Number(btn.dataset.min);
        const max    = Number(btn.dataset.max);
        const newVal = Math.min(max, Math.max(min, this.#currentProfile[field] + dir));
        this.#currentProfile[field] = newVal;
        const map = { historicoSinistros: 'claims-val', sinistrosAnteriores: 'prev-val' };
        if (map[field]) document.getElementById(map[field]).textContent = newVal;
        this.#triggerClassify();
      });
    });
  }

  #triggerClassify(debounce = true) {
    clearTimeout(this.#debounceTimer);
    const liveEl = document.getElementById('result-live');
    if (liveEl) liveEl.classList.add('beam-border');

    const run = () => this.#onClassifyCallback?.(this.#currentProfile);
    if (debounce) {
      this.#debounceTimer = setTimeout(run, 280);
    } else {
      run();
    }
  }

  hide() {
    clearTimeout(this.#debounceTimer);
    this.#el.classList.add('hidden');
  }
}
