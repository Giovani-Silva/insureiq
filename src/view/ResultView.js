const RISK_CONFIG = {
  0: { label: 'Baixo',       color: 'risk-low'         },
  1: { label: 'Médio-Baixo', color: 'risk-medium-low'  },
  2: { label: 'Médio-Alto',  color: 'risk-medium-high' },
  3: { label: 'Alto',        color: 'risk-high'        },
};

const RISK_LABELS  = ['Baixo', 'Médio-Baixo', 'Médio-Alto', 'Alto'];

const DRIVING_OPTIONS = ['Clean', 'Minor Violations', 'Major Violations', 'Accident', 'DUI'];
const DRIVING_LABELS  = {
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

  // Estado
  #profiles       = [];           // todos os perfis
  #currentProfile = null;         // perfil sendo editado agora
  #editedProfiles = new Map();    // profileId → cópia editada (persiste entre trocas)
  #debounceTimer  = null;
  #inferenceStart = null;
  #callCount      = 0;

  constructor(el) { this.#el = el; }

  onBack(callback)     { this.#onBackCallback     = callback; }
  onClassify(callback) { this.#onClassifyCallback = callback; }

  // ── Ponto de entrada principal ────────────────────────────────────────────
  showInteractive(profiles, initialProfile) {
    this.#profiles = profiles;
    this.#loadProfile(initialProfile);
    this.#render();
    this.#el.classList.remove('hidden');
    this.#triggerClassify(false);
  }

  // ── Atualiza o painel de resultado (chamado pelo worker) ──────────────────
  updateResult({ riskLevel, confidence, probabilities, recommended }) {
    const liveEl = document.getElementById('result-live');
    if (!liveEl) return;

    liveEl.classList.remove('beam-border');
    this.#callCount++;

    const elapsed = this.#inferenceStart ? Date.now() - this.#inferenceStart : null;
    const risk    = RISK_CONFIG[riskLevel];

    // ── Painel de resultado ──
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
              <div class="prob-fill ${RISK_CONFIG[i].color}-fill" style="width:${(p*100).toFixed(0)}%"></div>
            </div>
            <span class="prob-pct text-secondary">${(p*100).toFixed(0)}%</span>
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
                <div class="product-coverage text-tertiary">${p.coberturas.slice(0,2).join(' · ')}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // ── Network card ──
    this.#updateNetworkCard({ riskLevel, confidence, elapsed });
  }

  hide() {
    clearTimeout(this.#debounceTimer);
    this.#el.classList.add('hidden');
  }

  // ── Carrega perfil (respeitando edits salvos) ─────────────────────────────
  #loadProfile(profile) {
    const saved = this.#editedProfiles.get(profile.id);
    this.#currentProfile = saved ? { ...saved } : { ...profile };
  }

  // ── Salva edits do perfil atual antes de trocar ───────────────────────────
  #saveCurrentEdits() {
    if (this.#currentProfile) {
      this.#editedProfiles.set(this.#currentProfile.id, { ...this.#currentProfile });
    }
  }

  // ── Render completo da tela interativa ────────────────────────────────────
  #render() {
    const p = this.#currentProfile;

    this.#el.innerHTML = `
      <div class="interactive-screen">

        <!-- Header com voltar + hint -->
        <div class="interactive-header">
          <button class="back-btn" id="back-btn">← Voltar</button>
          <span class="interactive-hint text-tertiary">
            Edite os atributos e veja o risco mudar em tempo real
          </span>
        </div>

        <div class="interactive-grid">

          <!-- Painel esquerdo: switcher + editor -->
          <div class="editor-panel">

            <!-- Custom profile switcher -->
            <div class="profile-switcher" id="profile-switcher">
              <button class="switcher-trigger" id="switcher-trigger">
                <span class="switcher-avatar">${p.avatar}</span>
                <div class="switcher-info">
                  <span class="switcher-name">${p.nome}</span>
                  <span class="switcher-meta text-tertiary">${p.ocupacao}</span>
                </div>
                <span class="switcher-chevron">▾</span>
              </button>
              <div class="switcher-menu hidden" id="switcher-menu">
                ${this.#profiles.map(pr => `
                  <button class="switcher-option ${pr.id === p.id ? 'switcher-option--active' : ''}"
                          data-profile-id="${pr.id}">
                    <span class="option-avatar">${pr.avatar}</span>
                    <div class="option-info">
                      <span class="option-name">${pr.nome}</span>
                      <span class="option-meta text-tertiary">${pr.ocupacao} · ${pr.idade} anos</span>
                    </div>
                    ${pr.id === p.id ? '<span class="option-check">✓</span>' : ''}
                  </button>
                `).join('')}
              </div>
            </div>

            <!-- Editor de atributos -->
            <div class="editor-fields">
              <div class="editor-section-label text-tertiary">Atributos</div>

              <div class="field-group">
                <label class="field-label">Direção</label>
                <select class="field-select" data-field="registroDirecao">
                  ${DRIVING_OPTIONS.map(v => `
                    <option value="${v}" ${p.registroDirecao === v ? 'selected' : ''}>
                      ${DRIVING_LABELS[v]}
                    </option>
                  `).join('')}
                </select>
              </div>

              <div class="field-group">
                <div class="field-header">
                  <label class="field-label">Score de crédito</label>
                  <span class="field-value" id="credit-val">${p.creditScore}</span>
                </div>
                <div class="range-row">
                  <span class="range-min text-tertiary">500</span>
                  <input type="range" class="field-range" data-field="creditScore"
                    min="500" max="850" step="10" value="${p.creditScore}">
                  <span class="range-max text-tertiary">850</span>
                </div>
              </div>

              <div class="field-group">
                <div class="field-header">
                  <label class="field-label">Sinistros</label>
                  <div class="field-stepper">
                    <button class="step-btn" data-field="historicoSinistros" data-dir="-1" data-min="0" data-max="5">−</button>
                    <span class="step-value" id="claims-val">${p.historicoSinistros}</span>
                    <button class="step-btn" data-field="historicoSinistros" data-dir="1"  data-min="0" data-max="5">+</button>
                  </div>
                </div>
              </div>

              <div class="field-group">
                <div class="field-header">
                  <label class="field-label">Sinistros anteriores</label>
                  <div class="field-stepper">
                    <button class="step-btn" data-field="sinistrosAnteriores" data-dir="-1" data-min="0" data-max="3">−</button>
                    <span class="step-value" id="prev-val">${p.sinistrosAnteriores}</span>
                    <button class="step-btn" data-field="sinistrosAnteriores" data-dir="1"  data-min="0" data-max="3">+</button>
                  </div>
                </div>
              </div>

              <div class="field-group">
                <div class="field-header">
                  <label class="field-label">Idade</label>
                  <span class="field-value" id="age-val">${p.idade}</span>
                </div>
                <div class="range-row">
                  <span class="range-min text-tertiary">18</span>
                  <input type="range" class="field-range" data-field="idade"
                    min="18" max="70" step="1" value="${p.idade}">
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

          <!-- Coluna 3: Rede neural -->
          <div class="network-card" id="network-card">
          <div class="network-header">
            <span class="network-title text-tertiary">Rede neural · inferência</span>
            <div class="network-stats">
              <span class="network-stat" id="stat-calls">
                <span class="text-tertiary">chamadas</span>
                <span class="stat-value" id="nc-calls">0</span>
              </span>
              <span class="network-stat-sep"></span>
              <span class="network-stat" id="stat-time">
                <span class="text-tertiary">último</span>
                <span class="stat-value" id="nc-time">—</span>
              </span>
              <span class="network-stat-sep"></span>
              <span class="network-stat">
                <span class="text-tertiary">confiança</span>
                <span class="stat-value" id="nc-confidence">—</span>
              </span>
            </div>
          </div>

          <div class="network-viz" id="network-viz">
            ${this.#renderNetworkViz()}
          </div>
        </div>

      </div>
    `;

    this.#bindEvents();
  }

  // ── Renderiza a visualização da rede neural ───────────────────────────────
  #renderNetworkViz() {
    const layers = [
      { label: 'Input',  nodes: 4, note: '25 feat.' },
      { label: 'Dense',  nodes: 4, note: '64'       },
      { label: 'Dense',  nodes: 3, note: '32'       },
      { label: 'Dense',  nodes: 2, note: '16'       },
      { label: 'Output', nodes: 4, note: '4 classes'},
    ];
    const parts = [];
    layers.forEach((layer, li) => {
      parts.push('<div class="nn-layer-v" data-layer="' + li + '">');
      parts.push('<div class="nn-nodes-h">');
      for (let ni = 0; ni < layer.nodes; ni++) {
        parts.push('<div class="nn-node" data-layer="' + li + '" data-node="' + ni + '"></div>');
      }
      if (li === 0) parts.push('<span class="nn-node--dots">…</span>');
      parts.push('</div>');
      parts.push('<div class="nn-layer-label-v">' + layer.label + '</div>');
      parts.push('<div class="nn-layer-note-v">' + layer.note + '</div>');
      parts.push('</div>');
      if (li < layers.length - 1) {
        parts.push('<div class="nn-connector-v" data-conn="' + li + '">');
        parts.push('<div class="nn-pulse-v" data-conn="' + li + '"></div>');
        parts.push('</div>');
      }
    });
    return '<div class="nn-layers-v">' + parts.join('') + '</div>';
  }

  // ── Anima a rede neural durante inferência ────────────────────────────────
  #animateNetwork() {
    const layers  = this.#el.querySelectorAll('.nn-layer-v');
    const pulses  = this.#el.querySelectorAll('.nn-pulse-v');
    const delay   = 80;

    layers.forEach(l  => l.classList.remove('nn-layer-v--active'));
    pulses.forEach(p  => p.classList.remove('nn-pulse-v--active'));

    layers.forEach((layer, i) => {
      setTimeout(() => layer.classList.add('nn-layer-v--active'), i * delay);
    });

    pulses.forEach((pulse, i) => {
      setTimeout(() => {
        pulse.classList.add('nn-pulse-v--active');
        setTimeout(() => pulse.classList.remove('nn-pulse-v--active'), 400);
      }, i * delay + delay / 2);
    });

    // Remove active state after animation
    setTimeout(() => {
      layers.forEach(l => l.classList.remove('nn-layer-v--active'));
    }, layers.length * delay + 200);
  }

  // ── Atualiza o network card com stats ─────────────────────────────────────
  #updateNetworkCard({ riskLevel, confidence, elapsed }) {
    const callsEl      = document.getElementById('nc-calls');
    const timeEl       = document.getElementById('nc-time');
    const confidenceEl = document.getElementById('nc-confidence');

    if (callsEl)      callsEl.textContent      = this.#callCount;
    if (timeEl)       timeEl.textContent        = elapsed ? `${elapsed}ms` : '—';
    if (confidenceEl) confidenceEl.textContent  = `${(confidence * 100).toFixed(1)}%`;
  }

  // ── Bind de eventos ───────────────────────────────────────────────────────
  #bindEvents() {
    // Voltar
    document.getElementById('back-btn')?.addEventListener('click', () => {
      clearTimeout(this.#debounceTimer);
      this.#saveCurrentEdits();
      this.#onBackCallback?.();
    });

    // Custom dropdown — open/close
    const trigger = document.getElementById('switcher-trigger');
    const menu    = document.getElementById('switcher-menu');

    trigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      menu?.classList.toggle('hidden');
    });

    document.addEventListener('click', () => menu?.classList.add('hidden'));

    menu?.addEventListener('click', (e) => e.stopPropagation());

    // Troca de perfil via dropdown
    this.#el.querySelectorAll('.switcher-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.profileId);
        if (id === this.#currentProfile.id) { menu?.classList.add('hidden'); return; }

        this.#saveCurrentEdits();

        const newProfile = this.#profiles.find(p => p.id === id);
        if (!newProfile) return;

        this.#loadProfile(newProfile);
        menu?.classList.add('hidden');
        this.#render();
        this.#triggerClassify(false);
      });
    });

    // Select
    this.#el.querySelectorAll('select[data-field]').forEach(el => {
      el.addEventListener('change', () => {
        this.#currentProfile[el.dataset.field] = el.value;
        this.#triggerClassify();
      });
    });

    // Range
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

    // Steppers
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

  // ── Dispara classificação com debounce ────────────────────────────────────
  #triggerClassify(debounce = true) {
    clearTimeout(this.#debounceTimer);

    const liveEl = document.getElementById('result-live');
    if (liveEl) liveEl.classList.add('beam-border');

    const run = () => {
      this.#inferenceStart = Date.now();
      this.#animateNetwork();
      this.#onClassifyCallback?.(this.#currentProfile);
    };

    if (debounce) {
      this.#debounceTimer = setTimeout(run, 280);
    } else {
      run();
    }
  }
}
