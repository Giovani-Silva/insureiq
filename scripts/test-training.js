/**
 * Valida o pipeline de ML no Node antes de montar a UI.
 * Carrega o training-data.json, treina o modelo e testa
 * a predição com os perfis do profiles.json.
 *
 * Como usar:
 *   node --no-deprecation scripts/test-training.js
 */

import * as tf from '@tensorflow/tfjs-node';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Paths ────────────────────────────────────────────────────────────────────
const TRAINING_DATA_PATH = path.join(__dirname, '../data/training-data.json');
const PROFILES_PATH = path.join(__dirname, '../data/profiles.json');

// ─── Labels de risco pra exibição ────────────────────────────────────────────
const RISK_LABELS = {
  0: 'Baixo',
  1: 'Médio-Baixo',
  2: 'Médio-Alto',
  3: 'Alto',
};

const RISK_EMOJI = {
  0: '🟢',
  1: '🟡',
  2: '🟠',
  3: '🔴',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const normalize = (value, min, max) => (value - min) / (max - min || 1);

function oneHot(index, length) {
  const arr = new Array(length).fill(0);
  if (index >= 0 && index < length) arr[index] = 1;
  return arr;
}

// ─── Encoder (idêntico ao riskModelWorker.js) ─────────────────────────────────
function encodeProfile(profile, meta) {
  const { stats, indexes } = meta;

  const age = normalize(profile.idade, stats.age.min, stats.age.max);
  const gender = indexes.GENDER_INDEX[profile.genero] ?? 0;
  const income = normalize(profile.rendaMensal, stats.incomeLevel.min, stats.incomeLevel.max);
  const claims = normalize(profile.historicoSinistros, stats.claimHistory.min, stats.claimHistory.max);
  const prevClaims = normalize(profile.sinistrosAnteriores, stats.previousClaimHistory.min, stats.previousClaimHistory.max);
  const credit = normalize(profile.creditScore, stats.creditScore.min, stats.creditScore.max);

  const drivingOH = oneHot(indexes.DRIVING_RECORD_INDEX[profile.registroDirecao] ?? 0, 5);
  const occupationOH = oneHot(indexes.OCCUPATION_INDEX[profile.ocupacao] ?? 0, 9);
  const educationOH = oneHot(indexes.EDUCATION_INDEX[profile.educacao] ?? 0, 5);

  return [age, gender, income, claims, prevClaims, credit, ...drivingOH, ...occupationOH, ...educationOH];
}

// ─── Cria e treina o modelo ───────────────────────────────────────────────────
async function buildAndTrain(inputs, labels, inputDimensions, numClasses) {
  const model = tf.sequential();

  model.add(tf.layers.dense({ inputShape: [inputDimensions], units: 64, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
  model.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });

  console.log('\n🧠 Iniciando treinamento...\n');

  const xs = tf.tensor2d(inputs);
  const ys = tf.tensor2d(labels);

  await model.fit(xs, ys, {
    epochs: 50,
    batchSize: 64,
    shuffle: true,
    validationSplit: 0.1,
    verbose: 0, // TF fica quieto só meu callback imprime
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        const acc = (logs.acc * 100).toFixed(1);
        const valAcc = (logs.val_acc * 100).toFixed(1);
        const loss = logs.loss.toFixed(4);
        const done = Math.round(((epoch + 1) / 50) * 20);
        const bar = '█'.repeat(done) + '░'.repeat(20 - done);

        process.stdout.write(
          `\r  Época ${String(epoch + 1).padStart(2, '0')}/50 [${bar}] loss: ${loss} | acc: ${acc}% | val_acc: ${valAcc}%   `
        );

        if (epoch === 49) process.stdout.write('\n');
      },
    },
  });

  xs.dispose();
  ys.dispose();

  return model;
}

// ─── Predição de um perfil ────────────────────────────────────────────────────
function predict(model, profile, meta) {
  const vector = encodeProfile(profile, meta);
  const inputTensor = tf.tensor2d([vector]);
  const predictions = model.predict(inputTensor);
  const probs = Array.from(predictions.dataSync());
  const riskLevel = probs.indexOf(Math.max(...probs));
  const confidence = (probs[riskLevel] * 100).toFixed(1);

  inputTensor.dispose();
  predictions.dispose();

  return { riskLevel, confidence, probs };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('📂 Carregando training-data.json...');
  const trainingData = JSON.parse(fs.readFileSync(TRAINING_DATA_PATH, 'utf-8'));
  const { meta, inputs, labels } = trainingData;

  console.log(`✅ ${inputs.length} amostras carregadas`);
  console.log(`📐 Dimensões do vetor: ${meta.inputDimensions}`);
  console.log(`🎯 Classes de risco: ${meta.numClasses}`);

  // Embaralha e pega só 15.000 amostras
  const SAMPLE_SIZE = 15000;
  const indices = Array.from({ length: inputs.length }, (_, i) => i)
    .sort(() => Math.random() - 0.5)
    .slice(0, SAMPLE_SIZE);

  const sampledInputs = indices.map(i => inputs[i]);
  const sampledLabels = indices.map(i => labels[i]);

  const model = await buildAndTrain(sampledInputs, sampledLabels, meta.inputDimensions, meta.numClasses);

  console.log('\n✅ Treinamento concluído!\n');
  console.log('─'.repeat(55));

  // ─── Testa com os perfis do profiles.json ──────────────────
  console.log('\n🔍 Testando predições com os perfis...\n');

  const profiles = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf-8'));

  for (const profile of profiles) {
    const { riskLevel, confidence, probs } = predict(model, profile, meta);
    const emoji = RISK_EMOJI[riskLevel];
    const label = RISK_LABELS[riskLevel];

    console.log(`${emoji} ${profile.nome.padEnd(20)} → ${label.padEnd(12)} (${confidence}% confiança)`);
    console.log(`   ${profile.descricao}`);
    console.log(`   Probabilidades: baixo ${(probs[0] * 100).toFixed(0)}% | médio-baixo ${(probs[1] * 100).toFixed(0)}% | médio-alto ${(probs[2] * 100).toFixed(0)}% | alto ${(probs[3] * 100).toFixed(0)}%`);
    console.log();
  }

  console.log('─'.repeat(55));
  console.log('\n🎉 Pipeline validado.\n');
}

main().catch(console.error);
