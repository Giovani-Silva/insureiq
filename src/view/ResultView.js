const RISK_CONFIG = {
  0: { label: 'Baixo',       color: 'risk-low',         icon: '●' },
  1: { label: 'Médio-Baixo', color: 'risk-medium-low',  icon: '●' },
  2: { label: 'Médio-Alto',  color: 'risk-medium-high', icon: '●' },
  3: { label: 'Alto',        color: 'risk-high',        icon: '●' },
};

const RISK_LABELS = ['Baixo', 'Médio-Baixo', 'Médio-Alto', 'Alto'];

export class ResultView {
  #el;
  #onBackCallback = null;

  constructor(el) {
    this.#el = el;
  }

  onBack(callback) {
    this.#onBackCallback = callback;
  }

  show({ profile, riskLevel, confidence, probabilities, recommended }) {
    const risk = RISK_CONFIG[riskLevel];

    this.#el.innerHTML = `
      <div class="result-screen">

        <button class="back-btn" id="back-btn">← Voltar</button>

        <div class="result-grid">

          <div class="result-profile">
            <div class="result-avatar">${profile.avatar}</div>
            <div class="result-profile-name">${profile.nome}</div>
            <div class="result-profile-meta">${profile.ocupacao}</div>
            <div class="result-profile-meta">${profile.idade} anos</div>
            <div class="result-divider"></div>
            <div class="result-profile-detail">Score de crédito: ${profile.creditScore}</div>
            <div class="result-profile-detail">Direção: ${profile.registroDirecao}</div>
            <div class="result-profile-detail">Sinistros: ${profile.historicoSinistros}</div>
          </div>

          <div class="result-main">

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

          </div>
        </div>
      </div>
    `;

    document.getElementById('back-btn')?.addEventListener('click', () => {
      this.#onBackCallback?.();
    });

    this.#el.classList.remove('hidden');
  }

  hide() { this.#el.classList.add('hidden'); }
}
