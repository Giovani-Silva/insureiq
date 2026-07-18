/**
 * Roda UMA VEZ antes do projeto.
 * Lê o CSV do Kaggle, computa os labels de risco a partir das features
 * (ignorando o Risk Profile sintético do dataset), normaliza e gera
 * training-data.json pronto para o TensorFlow.js consumir no browser.
 *
 * Como usar:
 *   node scripts/convert-dataset.js
 *
 * Saída:
 *   data/training-data.json
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Paths ────────────────────────────────────────────────────────────────────
const CSV_PATH    = path.join(__dirname, '../data/data_synthetic.csv');
const OUTPUT_PATH = path.join(__dirname, '../data/training-data.json');

// ─── Valores de normalização (extraídos do dataset) ──────────────────────────
const STATS = {
  age:                  { min: 18,    max: 70     },
  incomeLevel:          { min: 20001, max: 149999 },
  claimHistory:         { min: 0,     max: 5      },
  previousClaimHistory: { min: 0,     max: 3      },
  creditScore:          { min: 500,   max: 850    },
};

// ─── Índices para one-hot encoding ───────────────────────────────────────────
const GENDER_INDEX = { Female: 0, Male: 1 };

const DRIVING_RECORD_INDEX = {
  'Clean':            0,
  'Minor Violations': 1,
  'Major Violations': 2,
  'Accident':         3,
  'DUI':              4,
};

const OCCUPATION_INDEX = {
  'Artist':       0,
  'Doctor':       1,
  'Engineer':     2,
  'Entrepreneur': 3,
  'Lawyer':       4,
  'Manager':      5,
  'Nurse':        6,
  'Salesperson':  7,
  'Teacher':      8,
};

const EDUCATION_INDEX = {
  'High School Diploma': 0,
  'Associate Degree':    1,
  "Bachelor's Degree":   2,
  "Master's Degree":     3,
  'Doctorate':           4,
};

const MARITAL_INDEX = {
  'Single':    0,
  'Married':   1,
  'Divorced':  2,
  'Separated': 3,
  'Widowed':   4,
};

// ─── Pontuação de risco por Driving Record ───────────────────────────────────
const DRIVING_SCORES = {
  'Clean':            0,
  'Minor Violations': 1,
  'Major Violations': 2,
  'Accident':         3,
  'DUI':              4,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const normalize = (value, min, max) => (value - min) / (max - min);

function oneHot(index, length) {
  const arr = new Array(length).fill(0);
  if (index >= 0 && index < length) arr[index] = 1;
  return arr;
}

// ─── Fórmula de risco ─────────────────────────────────────────────────────────
// Substitui o 'Risk Profile' sintético do dataset por um label computado
// a partir das features que realmente determinam risco em seguros.
//
// Score máximo possível: 4 + 3 + 3 + 3 + 2 = 15
//
// Thresholds:
//   0-3  → Risk 0 (Baixo)
//   4-6  → Risk 1 (Médio-Baixo)
//   7-9  → Risk 2 (Médio-Alto)
//   10+  → Risk 3 (Alto)
//
// Distribuição resultante no dataset:
//   Baixo: ~10% | Médio-Baixo: ~38% | Médio-Alto: ~40% | Alto: ~13%
function computeRiskLabel(row) {
  let score = 0;

  // Driving Record (0-4) — fator de maior peso em seguros auto
  score += DRIVING_SCORES[row['Driving Record']] ?? 0;

  // Histórico de sinistros (0-3)
  const claims = Number(row['Claim History']);
  if      (claims <= 0) score += 0;
  else if (claims <= 2) score += 1;
  else if (claims <= 4) score += 2;
  else                  score += 3;

  // Sinistros anteriores (0-3)
  score += Math.min(Number(row['Previous Claims History']), 3);

  // Credit Score — relação inversa (0-3)
  // Crédito baixo indica instabilidade financeira e maior probabilidade de sinistro
  const credit = Number(row['Credit Score']);
  if      (credit >= 750) score += 0;
  else if (credit >= 650) score += 1;
  else if (credit >= 580) score += 2;
  else                    score += 3;

  // Idade — jovens (<25) e idosos (>65) têm estatisticamente mais sinistros (0-2)
  const age = Number(row['Age']);
  if      (age < 25)  score += 2;
  else if (age > 65)  score += 1;
  else                score += 0;

  // Converter score total em classe de risco
  if      (score <= 3)  return 0; // Baixo
  else if (score <= 6)  return 1; // Médio-Baixo
  else if (score <= 9)  return 2; // Médio-Alto
  else                  return 3; // Alto
}

// ─── Encoder de perfil ───────────────────────────────────────────────────────
function encodeProfile(row) {
  const age           = normalize(Number(row['Age']),                    STATS.age.min,                  STATS.age.max);
  const gender        = GENDER_INDEX[row['Gender']] ?? 0;
  const income        = normalize(Number(row['Income Level']),           STATS.incomeLevel.min,          STATS.incomeLevel.max);
  const claims        = normalize(Number(row['Claim History']),          STATS.claimHistory.min,         STATS.claimHistory.max);
  const prevClaims    = normalize(Number(row['Previous Claims History']),STATS.previousClaimHistory.min, STATS.previousClaimHistory.max);
  const creditScore   = normalize(Number(row['Credit Score']),           STATS.creditScore.min,          STATS.creditScore.max);

  const drivingOH     = oneHot(DRIVING_RECORD_INDEX[row['Driving Record']]  ?? 0, 5);
  const occupationOH  = oneHot(OCCUPATION_INDEX[row['Occupation']]           ?? 0, 9);
  const educationOH   = oneHot(EDUCATION_INDEX[row['Education Level']]       ?? 0, 5);

  return [
    age,
    gender,
    income,
    claims,
    prevClaims,
    creditScore,
    ...drivingOH,
    ...occupationOH,
    ...educationOH,
  ];
}

// ─── Converte o label para one-hot (4 classes de risco) ──────────────────────
function encodeLabel(riskLabel) {
  return oneHot(riskLabel, 4);
}

// ─── Main ────────────────────────────────────────────────────────────────────
console.log('📂 Lendo CSV...');
const raw  = fs.readFileSync(CSV_PATH, 'utf-8');
const rows = parse(raw, { columns: true, skip_empty_lines: true });

console.log(`✅ ${rows.length} linhas encontradas`);
console.log('🔢 Computando labels e codificando perfis...');

const inputs  = [];
const labels  = [];
let   skipped = 0;

// Contador de distribuição pra validação
const distribution = { 0: 0, 1: 0, 2: 0, 3: 0 };

for (const row of rows) {
  const riskLabel = computeRiskLabel(row);
  const vector    = encodeProfile(row);
  const label     = encodeLabel(riskLabel);

  if (vector.some(isNaN)) {
    skipped++;
    continue;
  }

  inputs.push(vector);
  labels.push(label);
  distribution[riskLabel]++;
}

console.log(`⚠️  Linhas ignoradas: ${skipped}`);
console.log(`✅  Amostras válidas: ${inputs.length}`);
console.log(`📐  Dimensões do vetor: ${inputs[0].length}`);

console.log('\n📊 Distribuição dos labels computados:');
const total = inputs.length;
for (const [risk, count] of Object.entries(distribution)) {
  const pct    = ((count / total) * 100).toFixed(1);
  const labels_map = { 0: 'Baixo      ', 1: 'Médio-Baixo', 2: 'Médio-Alto ', 3: 'Alto       ' };
  console.log(`   Risk ${risk} (${labels_map[risk]}): ${String(count).padStart(5)} amostras (${pct}%)`);
}

// ─── Metadados para o Worker saber o shape sem hardcode ──────────────────────
const output = {
  meta: {
    inputDimensions: inputs[0].length,
    numClasses: 4,
    totalSamples: inputs.length,
    riskLabels: {
      0: 'Baixo',
      1: 'Médio-Baixo',
      2: 'Médio-Alto',
      3: 'Alto',
    },
    stats: STATS,
    indexes: {
      GENDER_INDEX,
      DRIVING_RECORD_INDEX,
      OCCUPATION_INDEX,
      EDUCATION_INDEX,
      MARITAL_INDEX,
    },
  },
  inputs,
  labels,
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output));

const sizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(1);
console.log(`\n🎉 training-data.json gerado em: ${OUTPUT_PATH}`);
console.log(`   Tamanho: ${sizeMB} MB`);
