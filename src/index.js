import { workerEvents } from './events/constants.js';
import { ModelController } from './controller/ModelController.js';
import { ProfileController } from './controller/ProfileController.js';
import { TrainingView } from './view/TrainingView.js';
import { ProfileView } from './view/ProfileView.js';
import { ResultView } from './view/ResultView.js';

// ─── Controllers ──────────────────────────────────────────────────────────────
const modelCtrl   = new ModelController();
const profileCtrl = new ProfileController();

// ─── Views ────────────────────────────────────────────────────────────────────
const trainingView = new TrainingView(document.getElementById('training-section'));
const profileView  = new ProfileView(document.getElementById('profiles-section'));
const resultView   = new ResultView(document.getElementById('result-section'));

// ─── Inicializa ───────────────────────────────────────────────────────────────
async function init() {
  // Carrega perfis
  const profiles = await profileCtrl.load();

  // Inicializa worker e registra eventos
  modelCtrl
    .on(workerEvents.trainingLog, ({ epoch, loss, accuracy, valAccuracy }) => {
      trainingView.update({ epoch, loss, accuracy, valAccuracy });
    })
    .on(workerEvents.trainingComplete, () => {
      trainingView.complete();

      // Pequena pausa pra usuário ver "concluído" antes de transitar
      setTimeout(() => {
        trainingView.hide();
        profileView.show(profiles);
      }, 1200);
    })
    .on(workerEvents.riskResult, (data) => {
      profileView.hide();
      resultView.show(data);
    });

  modelCtrl.init();

  // Seleção de perfil → classificação
  profileCtrl.onSelect((profile) => {
    modelCtrl.classify(profile);
  });

  profileView.onSelect((id) => {
    profileCtrl.select(id);
  });

  // Voltar pra seleção de perfil
  resultView.onBack(() => {
    resultView.hide();
    profileView.show(profiles);
  });

  // Inicia treinamento
  trainingView.show();
  modelCtrl.train();
}

init();
