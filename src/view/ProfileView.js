export class ProfileView {
  #el;
  #onSelectCallback = null;

  constructor(el) {
    this.#el = el;
  }

  onSelect(callback) {
    this.#onSelectCallback = callback;
  }

  show(profiles) {
    this.#el.innerHTML = `
      <div class="profiles-screen">
        <div class="section-header">
          <h2 class="section-title">Selecione um perfil</h2>
          <p class="section-subtitle">O modelo classificará o risco e recomendará produtos compatíveis</p>
        </div>
        <div class="profile-grid">
          ${profiles.map(p => this.#renderCard(p)).join('')}
        </div>
      </div>
    `;

    this.#el.querySelectorAll('.profile-card').forEach(card => {
      card.addEventListener('click', () => {
        // Remove seleção anterior
        this.#el.querySelectorAll('.profile-card').forEach(c => {
          c.classList.remove('profile-card--selected', 'beam-border');
        });

        // Ativa beam border no card clicado
        card.classList.add('profile-card--selected', 'beam-border');

        const id = Number(card.dataset.id);
        this.#onSelectCallback?.(id);
      });
    });

    this.#el.classList.remove('hidden');
  }

  clearSelection() {
    this.#el.querySelectorAll('.profile-card').forEach(c => {
      c.classList.remove('profile-card--selected', 'beam-border');
    });
  }

  #renderCard(profile) {
    return `
      <button class="profile-card" data-id="${profile.id}">
        <span class="profile-avatar">${profile.avatar}</span>
        <div class="profile-info">
          <span class="profile-name">${profile.nome}</span>
          <span class="profile-meta">${profile.ocupacao} · ${profile.idade} anos</span>
          <span class="profile-desc">${profile.descricao}</span>
        </div>
        <span class="profile-arrow">→</span>
      </button>
    `;
  }

  hide() { this.#el.classList.add('hidden'); }
}