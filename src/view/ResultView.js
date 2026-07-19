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
        <div class="verdict-top-row">
          <div class="verdict-label text-tertiary">Perfil de risco</div>
          <button class="explain-btn" id="explain-btn">Explicar resultado</button>
        </div>
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

    // ── Explain button ──
    const _profile = this.#currentProfile;
    const _risk    = riskLevel;
    const _rec     = recommended;
    requestAnimationFrame(() => {
      document.getElementById('explain-btn')?.addEventListener('click', () => {
        this.#showExplanation(_profile, _risk, _rec);
      });
    });
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

  // ── Calcula fatores de risco explicáveis ─────────────────────────────────
  #computeRiskFactors(profile) {
    const factors = [];

    const drivingMap = {
      'Clean':            { label: 'Limpo',           pts: 0 },
      'Minor Violations': { label: 'Infrações leves', pts: 1 },
      'Major Violations': { label: 'Infrações graves',pts: 2 },
      'Accident':         { label: 'Acidente',        pts: 3 },
      'DUI':              { label: 'DUI',             pts: 4 },
    };
    const drv = drivingMap[profile.registroDirecao] || { label: profile.registroDirecao, pts: 0 };
    factors.push({ label: 'Histórico de direção', value: drv.label, pts: drv.pts, max: 4 });

    let creditPts = 0, creditLabel = '';
    if      (profile.creditScore >= 750) { creditPts = 0; creditLabel = 'Excelente (≥ 750)'; }
    else if (profile.creditScore >= 650) { creditPts = 1; creditLabel = 'Bom (650–749)'; }
    else if (profile.creditScore >= 580) { creditPts = 2; creditLabel = 'Regular (580–649)'; }
    else                                 { creditPts = 3; creditLabel = 'Baixo (< 580)'; }
    factors.push({ label: 'Score de crédito', value: creditLabel, pts: creditPts, max: 3 });

    const c    = profile.historicoSinistros;
    const cPts = c <= 0 ? 0 : c <= 2 ? 1 : c <= 4 ? 2 : 3;
    factors.push({ label: 'Sinistros', value: c + ' ocorrência(s)', pts: cPts, max: 3 });

    const pc    = profile.sinistrosAnteriores;
    const pcPts = Math.min(pc, 3);
    factors.push({ label: 'Sinistros anteriores', value: pc + ' ocorrência(s)', pts: pcPts, max: 3 });

    const age    = profile.idade;
    const agePts = age < 25 ? 2 : age > 65 ? 1 : 0;
    const ageLbl = age < 25 ? age + ' anos (condutor jovem)' : age > 65 ? age + ' anos (condutor sênior)' : age + ' anos';
    factors.push({ label: 'Idade', value: ageLbl, pts: agePts, max: 2 });

    const total    = factors.reduce((s, f) => s + f.pts, 0);
    const maxTotal = factors.reduce((s, f) => s + f.max, 0);
    return { factors, total, maxTotal };
  }

  // ── Abre modal de explicação ──────────────────────────────────────────────
  #showExplanation(profile, riskLevel, recommended) {
    const { factors, total, maxTotal } = this.#computeRiskFactors(profile);
    const risk = RISK_CONFIG[riskLevel];

    const pctColor = (pts, max) => {
      const r = pts / max;
      if (r === 0)       return 'risk-low';
      if (r <= 0.33)     return 'risk-medium-low';
      if (r <= 0.66)     return 'risk-medium-high';
      return 'risk-high';
    };

    const barWidth = (pts, max) => Math.round((pts / max) * 100);

    const overlay = document.createElement('div');
    overlay.className = 'explain-overlay';
    overlay.id = 'explain-overlay';

    overlay.innerHTML = `
      <div class="explain-modal">
        <div class="explain-modal-header">
          <div>
            <div class="explain-modal-title">Como funciona</div>
            <div class="explain-modal-sub text-tertiary">Explicação em linguagem simples</div>
          </div>
          <button class="explain-close" id="explain-close">✕</button>
        </div>

        <div class="explain-body">

          <!-- Seção 1: O que é -->
          <div class="explain-section">
            <div class="explain-section-icon">🧠</div>
            <div class="explain-section-content">
              <div class="explain-section-title">O que é uma rede neural?</div>
              <div class="explain-section-text">
                Uma rede neural aprende padrões a partir de exemplos.
                Mostramos 53.000 perfis de segurados reais, cada um com atributos como histórico de direção,
                score de crédito e sinistros. A rede aprendeu sozinha quais combinações de atributos
                estão associadas a cada nível de risco — sem que alguém programasse regras manualmente.
              </div>
            </div>
          </div>

          <!-- Seção 2: Por que este resultado -->
          <div class="explain-section">
            <div class="explain-section-icon">📊</div>
            <div class="explain-section-content">
              <div class="explain-section-title">Por que ${profile.nome} é risco <span class="${risk.color}">${risk.label}</span>?</div>
              <div class="explain-section-text">
                Cada atributo do perfil contribui com uma pontuação. A soma define o nível de risco.
              </div>

              <div class="explain-factors">
                ${factors.map(f => `
                  <div class="explain-factor">
                    <div class="factor-header">
                      <span class="factor-label">${f.label}</span>
                      <span class="factor-value text-secondary">${f.value}</span>
                      <span class="factor-pts ${pctColor(f.pts, f.max)}">${f.pts > 0 ? '+' + f.pts : '—'}</span>
                    </div>
                    <div class="factor-bar-track">
                      <div class="factor-bar-fill ${pctColor(f.pts, f.max)}-fill" style="width:${barWidth(f.pts, f.max)}%"></div>
                    </div>
                  </div>
                `).join('')}

                <div class="explain-total">
                  <span class="text-tertiary">Pontuação total</span>
                  <span class="explain-total-score ${risk.color}">${total} / ${maxTotal}</span>
                </div>
              </div>

              <div class="explain-scale">
                <div class="scale-item risk-low">0–3 Baixo</div>
                <div class="scale-item risk-medium-low">4–6 Médio-Baixo</div>
                <div class="scale-item risk-medium-high">7–9 Médio-Alto</div>
                <div class="scale-item risk-high">10+ Alto</div>
              </div>
            </div>
          </div>

          <!-- Seção 3: Por que estes produtos -->
          <div class="explain-section">
            <div class="explain-section-icon">📦</div>
            <div class="explain-section-content">
              <div class="explain-section-title">Por que estes produtos foram recomendados?</div>
              <div class="explain-section-text">
                Cada produto de seguro tem um perfil de risco compatível.
                Para risco <span class="${risk.color}">${risk.label}</span>,
                selecionamos produtos com ${riskLevel >= 2 ? 'cobertura mais abrangente e franquias ajustadas ao maior nível de sinistralidade' : 'boa cobertura e franquias acessíveis para perfis de baixo risco'}.
              </div>
              <div class="explain-products">
                ${recommended.map(p => `
                  <div class="explain-product">
                    <span class="explain-product-icon">${p.icon}</span>
                    <div>
                      <div class="explain-product-name">${p.nome}</div>
                      <div class="explain-product-why text-tertiary">${p.descricao}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('explain-close')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }
}
