import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
import { workerEvents } from '../events/constants.js';

console.log('Risk model worker initialized');

// ─── Estado global do worker ──────────────────────────────────────────────────
let _model = null;
let _meta = null; // metadados do training-data.json (indexes, stats, dims)

// ─── Normalização ─────────────────────────────────────────────────────────────
// Mesma fórmula do curso: (val - min) / (max - min)
// Garante que todos os valores fiquem entre 0 e 1
// para que nenhuma feature domine o treinamento.
const normalize = (value, min, max) => (value - min) / (max - min || 1);

// ─── One-hot encoding ─────────────────────────────────────────────────────────
// Transforma um índice categórico num vetor binário.
// Exemplo: Occupation "Doctor" (index 1) com length 9
// → [0, 1, 0, 0, 0, 0, 0, 0, 0]
function oneHot(index, length) {
  const arr = new Array(length).fill(0);
  if (index >= 0 && index < length) arr[index] = 1;
  return arr;
}

// ─── Encoder de perfil ────────────────────────────────────────────────────────
// Transforma os dados de um perfil (persona ou usuário real) no
// mesmo vetor numérico de 25 dimensões usado no treinamento.
//
// Estrutura do vetor:
// [
//   age_norm,               // 1  — idade normalizada (18–70)
//   gender_binary,          // 1  — 0=Female, 1=Male
//   income_norm,            // 1  — renda normalizada (20001–149999)
//   claims_norm,            // 1  — histórico de sinistros (0–5)
//   prev_claims_norm,       // 1  — sinistros anteriores (0–3)
//   credit_score_norm,      // 1  — credit score (500–850)
//   ...driving_one_hot,     // 5  — Clean, Minor, Major, Accident, DUI
//   ...occupation_one_hot,  // 9  — Artist, Doctor, Engineer, ...
//   ...education_one_hot,   // 5  — High School, Associate, Bachelor, Master, Doctorate
// ]
// Total: 6 + 5 + 9 + 5 = 25 dimensões
function encodeProfile(profile, meta) {
  const { stats, indexes } = meta;

  // ── Features contínuas normalizadas ──
  const age = normalize(profile.idade, stats.age.min, stats.age.max);
  const gender = indexes.GENDER_INDEX[profile.genero] ?? 0;
  const income = normalize(profile.rendaMensal, stats.incomeLevel.min, stats.incomeLevel.max);
  const claims = normalize(profile.historicoSinistros, stats.claimHistory.min, stats.claimHistory.max);
  const prevClaims = normalize(profile.sinistrosAnteriores, stats.previousClaimHistory.min, stats.previousClaimHistory.max);
  const credit = normalize(profile.creditScore, stats.creditScore.min, stats.creditScore.max);

  // ── Features categóricas (one-hot) ──
  const drivingOH = oneHot(indexes.DRIVING_RECORD_INDEX[profile.registroDirecao] ?? 0, 5);
  const occupationOH = oneHot(indexes.OCCUPATION_INDEX[profile.ocupacao] ?? 0, 9);
  const educationOH = oneHot(indexes.EDUCATION_INDEX[profile.educacao] ?? 0, 5);

  return [
    age,
    gender,
    income,
    claims,
    prevClaims,
    credit,
    ...drivingOH,
    ...occupationOH,
    ...educationOH,
  ];
}

// ====================================================================
// 📌 Exemplo: como um perfil é ANTES da codificação
// ====================================================================
/*
const exampleProfile = {
  nome: 'Diego Souza',
  idade: 22,
  genero: 'Male',
  ocupacao: 'Artist',
  rendaMensal: 28000,
  historicoSinistros: 2,
  sinistrosAnteriores: 1,
  creditScore: 510,
  registroDirecao: 'DUI',
  educacao: 'High School Diploma',
};
*/

// ====================================================================
// 📌 Após a codificação, o modelo vê apenas números entre 0 e 1.
// O perfil acima viraria algo como:
//
// [
//   0.07,          // idade 22 normalizada (18–70)
//   1,             // Male
//   0.06,          // renda 28000 normalizada
//   0.40,          // 2 sinistros normalizados (0–5)
//   0.33,          // 1 sinistro anterior normalizado (0–3)
//   0.03,          // credit score 510 normalizado (500–850)
//   0, 0, 0, 0, 1, // DUI → one-hot driving [Clean, Minor, Major, Accident, DUI]
//   1, 0, 0, 0, 0, 0, 0, 0, 0, // Artist → one-hot occupation
//   1, 0, 0, 0, 0  // High School → one-hot education
// ]
//
// São esses 25 números que a rede neural processa.
// ====================================================================

// ====================================================================
// 🧠 Configuração e treinamento da rede neural
// ====================================================================
async function configureAndTrain(inputs, labels, inputDimensions, numClasses, epochs = 50) {
  const model = tf.sequential();

  // Camada de entrada
  // - inputShape: 25 (dimensões do vetor de perfil)
  // - units: 64 neurônios para capturar combinações de features
  // - activation: 'relu' mantém sinais positivos, descarta negativos
  model.add(tf.layers.dense({
    inputShape: [inputDimensions],
    units: 64,
    activation: 'relu',
  }));

  // Camada oculta 1
  // - 32 neurônios: começa a comprimir e distilir informação
  model.add(tf.layers.dense({
    units: 32,
    activation: 'relu',
  }));

  // Camada oculta 2
  // - 16 neurônios: mantém apenas os padrões mais relevantes
  model.add(tf.layers.dense({
    units: 16,
    activation: 'relu',
  }));

  // Camada de saída
  // - 4 neurônios: um para cada classe de risco (0=baixo, 1=médio-baixo, 2=médio-alto, 3=alto)
  // - activation: 'softmax' garante que as 4 probabilidades somem 1
  //   Exemplo: [0.72, 0.18, 0.07, 0.03] → risco baixo com 72% de confiança
  model.add(tf.layers.dense({
    units: numClasses,
    activation: 'softmax',
  }));

  // Diferença do curso:
  // - Curso usou 'binaryCrossentropy' (0 ou 1 — comprou ou não)
  // - Aqui usamos 'categoricalCrossentropy' (4 classes de risco)
  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });

  const xs = tf.tensor2d(inputs);
  const ys = tf.tensor2d(labels);

  await model.fit(xs, ys, {
    epochs,
    batchSize: 64,
    shuffle: true,
    validationSplit: 0.1, // 10% dos dados para validação em tempo real
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        postMessage({
          type: workerEvents.trainingLog,
          epoch,
          loss: logs.loss,
          accuracy: logs.acc,
          valLoss: logs.val_loss,
          valAccuracy: logs.val_acc,
        });
      },
    },
  });

  // Libera tensores da memória
  xs.dispose();
  ys.dispose();

  return model;
}

// ─── Treina o modelo com o training-data.json ──────────────────────────────
async function trainModel({ sampleSize, epochs = 50 }) {
  postMessage({ type: workerEvents.progressUpdate, progress: { progress: 10 } });

  const trainingData = await (await fetch('/data/training-data.json')).json();
  _meta = trainingData.meta;

  // Subsampla se sampleSize for definido (modos Rápido e Médio)
  let inputs = trainingData.inputs;
  let labels = trainingData.labels;

  if (sampleSize && sampleSize < inputs.length) {
    const indices = Array.from({ length: inputs.length }, (_, i) => i)
      .sort(() => Math.random() - 0.5)
      .slice(0, sampleSize);
    inputs = indices.map(i => inputs[i]);
    labels = indices.map(i => labels[i]);
  }

  postMessage({ type: workerEvents.progressUpdate, progress: { progress: 30 } });

  _model = await configureAndTrain(inputs, labels, _meta.inputDimensions, _meta.numClasses, epochs);

  postMessage({ type: workerEvents.progressUpdate, progress: { progress: 100 } });
  postMessage({ type: workerEvents.trainingComplete });
}

// ─── Classifica o risco de um perfil e retorna produtos ───────────────────
async function classifyRisk({ profile }) {
  if (!_model || !_meta) return;

  // 1️⃣ Codifica o perfil no mesmo formato do treinamento
  const vector = encodeProfile(profile, _meta);

  // 2️⃣ Cria um tensor 2D [1, 25] — batch de 1 amostra
  const inputTensor = tf.tensor2d([vector]);

  // 3️⃣ Roda a rede e extrai as probabilidades
  //    Exemplo de saída: [0.72, 0.18, 0.07, 0.03]
  const predictions = _model.predict(inputTensor);
  const probabilities = Array.from(predictions.dataSync());

  // 4️⃣ A classe com maior probabilidade é o perfil de risco
  const riskLevel = probabilities.indexOf(Math.max(...probabilities));
  const confidence = probabilities[riskLevel];

  // 5️⃣ Libera memória
  inputTensor.dispose();
  predictions.dispose();

  // 6️⃣ Carrega produtos e filtra os compatíveis com o risco
  const products = await (await fetch('/data/products.json')).json();
  const recommended = products.filter(p => p.riscoIdeal.includes(riskLevel));

  // 7️⃣ Envia resultado para a UI
  postMessage({
    type: workerEvents.riskResult,
    profile,
    riskLevel,        // 0, 1, 2 ou 3
    confidence,       // probabilidade da classe vencedora
    probabilities,    // [p0, p1, p2, p3] — todas as probabilidades
    recommended,      // produtos compatíveis com o risco
  });
}

// ─── Dispatcher de mensagens ──────────────────────────────────────────────
const handlers = {
  [workerEvents.trainModel]: trainModel,
  [workerEvents.classifyRisk]: classifyRisk,
};

self.onmessage = (e) => {
  const { action, ...data } = e.data;
  if (handlers[action]) handlers[action](data);
};
