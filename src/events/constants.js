export const workerEvents = {
  // UI → Worker
  trainModel:   'trainModel',
  classifyRisk: 'classifyRisk',

  // Worker → UI
  trainingLog:     'trainingLog',
  progressUpdate:  'progressUpdate',
  trainingComplete:'trainingComplete',
  riskResult:      'riskResult',
};
