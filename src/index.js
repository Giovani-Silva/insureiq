import { workerEvents } from './events/constants.js';
import { ModelController } from './controller/ModelController.js';
import { ProfileController } from './controller/ProfileController.js';
import { TrainingView } from './view/TrainingView.js';
import { ProfileView } from './view/ProfileView.js';
import { ResultView } from './view/ResultView.js';

const modelCtrl   = new ModelController();
const profileCtrl = new ProfileController();

const trainingView = new TrainingView(document.getElementById('training-section'));
const profileView  = new ProfileView(document.getElementById('profiles-section'));
const resultView   = new ResultView(document.getElementById('result-section'));

async function init() {
  const profiles = await profileCtrl.load();

  modelCtrl
    .on(workerEvents.trainingLog, ({ epoch, loss, accuracy, valAccuracy }) => {
      trainingView.update({ epoch, loss, accuracy, valAccuracy });
    })
    .on(workerEvents.trainingComplete, () => {
      trainingView.complete();
      setTimeout(() => {
        trainingView.hide();
        profileView.show(profiles);
      }, 1200);
    })
    .on(workerEvents.riskResult, (data) => {
      // Atualiza só o painel de resultado — sem re-render do editor
      resultView.updateResult(data);
    });

  modelCtrl.init();

  // Perfil selecionado → abre editor interativo
  profileCtrl.onSelect((profile) => {
    profileView.hide();
    resultView.showEditor(profile);
  });

  profileView.onSelect((id) => {
    profileCtrl.select(id);
  });

  // Editor dispara reclassificação com debounce interno
  resultView.onClassify((profile) => {
    modelCtrl.classify(profile);
  });

  // Voltar para seleção de perfil
  resultView.onBack(() => {
    resultView.hide();
    profileView.show(profiles);
  });

  // Speed selector → inicia treinamento
  trainingView.onStart((config) => {
    trainingView.showProgress(config);
    modelCtrl.train(config);
  });

  trainingView.showSelector();
}

init();
