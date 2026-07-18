# InsureIQ

Sistema de classificação de perfil de risco para seguros com Machine Learning rodando no browser via TensorFlow.js.

Projeto desenvolvido como exercício prático da pós-graduação em Engenharia de IA Aplicada.

---

## Como funciona

O usuário seleciona um perfil pré-definido. O modelo classifica o risco em quatro categorias e recomenda produtos de seguro compatíveis. Todo o processamento acontece no browser via Web Worker — sem servidor de inferência, sem envio de dados para API.

**Níveis de risco:**
- 🟢 Baixo
- 🟡 Médio-Baixo
- 🟠 Médio-Alto
- 🔴 Alto

**Fatores considerados:** histórico de direção, sinistros anteriores, score de crédito, idade e ocupação.

---

## Stack

- [TensorFlow.js](https://www.tensorflow.org/js) — treinamento e inferência no browser
- [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) — ML em thread separada
- Vanilla JS ES6+ — sem framework
- Dataset: [Insurance Claims and Policy Data](https://www.kaggle.com/datasets/ravalsmit/insurance-claims-and-policy-data) (Kaggle)

---

## Estrutura

```
insureiq/
├── data/
│   ├── profiles.json          # Personas pré-definidas para seleção
│   ├── products.json          # Catálogo de produtos de seguro
│   └── training-data.json     # Gerado pelo script (não versionado)
├── scripts/
│   ├── convert-dataset.js     # Converte CSV do Kaggle → training-data.json
│   └── test-training.js       # Valida o modelo no Node antes da UI
├── src/
│   ├── controller/
│   ├── events/
│   ├── service/
│   ├── view/
│   └── workers/
│       └── riskModelWorker.js # TF.js rodando em Web Worker
├── index.html
└── style.css
```

---

## Setup

### 1. Instala as dependências

```bash
npm install
```

### 2. Baixa o dataset

Acesse [kaggle.com/datasets/ravalsmit/insurance-claims-and-policy-data](https://www.kaggle.com/datasets/ravalsmit/insurance-claims-and-policy-data), baixe e coloque o arquivo `data_synthetic.csv` dentro da pasta `data/`.

### 3. Gera o training-data.json

```bash
npm run convert
```

Isso lê o CSV, computa os labels de risco a partir das features e gera o `data/training-data.json`.

> O CSV e o JSON gerado não são versionados (ver `.gitignore`). O `training-data.json` pode ser regenerado a qualquer momento rodando `npm run convert`.

### 4. Valida o modelo (opcional)

```bash
npm run testTraining
```

Treina o modelo no Node e testa a predição com os perfis do `profiles.json`. Esperado: ~92% de acurácia.

### 5. Abre o projeto no browser

```bash
npx serve .
```

Acessa `http://localhost:3000`.

---

## Como os labels de risco são calculados

O dataset original tem um campo `Risk Profile` gerado sinteticamente, sem correlação real com as features. Por isso os labels são recomputados a partir de uma fórmula baseada em fatores reais de risco em seguros:

| Feature | Pontuação |
|---|---|
| Driving Record: Clean | 0 |
| Driving Record: Minor Violations | 1 |
| Driving Record: Major Violations | 2 |
| Driving Record: Accident | 3 |
| Driving Record: DUI | 4 |
| Claim History: 0 | 0 |
| Claim History: 1-2 | 1 |
| Claim History: 3-4 | 2 |
| Claim History: 5 | 3 |
| Previous Claims: 0-3 | 0-3 |
| Credit Score ≥ 750 | 0 |
| Credit Score 650-749 | 1 |
| Credit Score 580-649 | 2 |
| Credit Score < 580 | 3 |
| Idade 25-65 | 0 |
| Idade > 65 | 1 |
| Idade < 25 | 2 |

**Thresholds:** 0-3 → Baixo | 4-6 → Médio-Baixo | 7-9 → Médio-Alto | 10+ → Alto

---

## Arquitetura do modelo

Rede neural sequencial com classificação multi-classe:

```
Input  (25 features)
Dense  (64 neurônios, ReLU)
Dense  (32 neurônios, ReLU)
Dense  (16 neurônios, ReLU)
Output (4 classes, Softmax)
```

Loss: `categoricalCrossentropy` | Optimizer: `Adam (lr=0.001)`

---

## Autor

**Giovani Silva** — Senior Frontend & Mobile Engineer  
[linkedin.com/in/giovanisilva](https://www.linkedin.com/in/giovanisilva)