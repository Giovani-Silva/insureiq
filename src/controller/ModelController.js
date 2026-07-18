import { workerEvents } from '../events/constants.js';

export class ModelController {
  #worker = null;
  #listeners = {};

  init() {
    this.#worker = new Worker('/src/workers/riskModelWorker.js', { type: 'module' });
    this.#worker.onmessage = (e) => {
      const { type, ...data } = e.data;
      this.#listeners[type]?.(data);
    };
  }

  on(event, callback) {
    this.#listeners[event] = callback;
    return this;
  }

  train() {
    this.#worker.postMessage({ action: workerEvents.trainModel });
  }

  classify(profile) {
    this.#worker.postMessage({ action: workerEvents.classifyRisk, profile });
  }
}
