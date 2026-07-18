export class ProfileController {
  #profiles = [];
  #onSelectCallback = null;

  async load() {
    const res = await fetch('/data/profiles.json');
    this.#profiles = await res.json();
    return this.#profiles;
  }

  onSelect(callback) {
    this.#onSelectCallback = callback;
  }

  select(profileId) {
    const profile = this.#profiles.find(p => p.id === profileId);
    if (profile) this.#onSelectCallback?.(profile);
  }

  getAll() {
    return this.#profiles;
  }
}
