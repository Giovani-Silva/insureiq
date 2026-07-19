# InsureIQ

Sistema de classificação de perfil de risco para seguros com Machine Learning rodando no browser via TensorFlow.js.

Projeto desenvolvido como exercício prático da pós-graduação em Engenharia de IA Aplicada.

---

## Como funciona

O usuário escolhe a velocidade de treinamento e assiste a rede neural aprender em tempo real. Depois seleciona um perfil e edita seus atributos — direção, score de crédito, sinistros, idade — e vê o risco e os produtos recomendados atualizando instantaneamente. Todo o processamento acontece no browser via Web Worker, sem servidor de inferência e sem envio de dados para nenhuma API.

**Níveis de risco:**
- 🟢 Baixo
- 🟡 Médio-Baixo
- 🟠 Médio-Alto
- 🔴 Alto

**Fatores considerados:** histórico de direção, sinistros, sinistros anteriores, score de crédito e idade.

---

## Funcionalidades

- **Seleção de velocidade de treino** — Rápido (~30s, ~75% acurácia), Médio (~2min, ~87%) ou Completo (~5min, ~92%)
- **Gráfico de treinamento em tempo real** — loss e val_acc por época em Canvas
- **Editor interativo de perfil** — sliders, steppers e select com atualização ao vivo
- **Switch de perfil sem sair da tela** — dropdown customizado entre os 8 perfis disponíveis
- **Estado persistente por perfil** — edits salvos em memória ao trocar de perfil
- **Visualização da rede neural** — camadas animadas a cada inferência com stats (chamadas, tempo, confiança)
- **Beam border animado** — indica computação ativa sem poluir a interface
- **Modal "Explicar resultado"** — explica em linguagem simples o que a rede fez, por que o risco foi classificado assim e por que cada produto foi recomendado

---

## Stack

- [TensorFlow.js](https://www.tensorflow.org/js) — treinamento e inferência no browser
- [Web Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) — ML em thread separada, sem travar a UI
- Canvas API — gráfico de treinamento desenhado sem bibliotecas externas
- Vanilla JS ES6+ — sem framework, arquitetura MVC manual
- Dataset: [Insurance Claims and Policy Data](https://www.kaggle.com/datasets/ravalsmit/insurance-claims-and-policy-data) (Kaggle)

---

## Estrutura

```
insureiq/
├── data/
│   ├── profiles.json           # 8 personas pré-definidas para seleção
│   ├── products.json           # Catálogo de 5 produtos de seguro
│   └── training-data.json      # Gerado pelo script (não versionado)
│
├── scripts/
│   ├── convert-dataset.js      # CSV do Kaggle → training-data.json (roda 1 vez)
│   └── test-training.js        # Valida o pipeline de ML no Node antes da UI
│
├── src/
│   ├── index.js                # Entry point — orquestra controllers e views
│   │
│   ├── events/
│   │   └── constants.js        # Eventos de comunicação UI ↔ Worker
│   │
│   ├── controller/
│   │   ├── ModelController.js  # Wrapper do Web Worker
│   │   └── ProfileController.js# Carrega e gerencia seleção de perfis
│   │
│   └── view/
│       ├── TrainingView.js     # Speed selector + progress bar + gráfico Canvas
│       ├── TrainingChart.js    # Gráfico de loss/val_acc em tempo real
│       ├── ProfileView.js      # Grid de seleção de perfis
│       └── ResultView.js       # Editor interativo + resultado + modal explicativo
│
├── workers/
│   └── riskModelWorker.js      # TF.js: treino + inferência em Web Worker
│
├── index.html
├── style.css
├── package.json
└── README.md
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

Lê o CSV, computa os labels de risco a partir das features e gera `data/training-data.json`.

> O CSV e o JSON gerado não são versionados. O `training-data.json` pode ser regenerado a qualquer momento rodando `npm run convert`.

### 4. Valida o modelo (opcional)

```bash
npm run testTraining
```

Treina no Node com barra de progresso e testa predições nos 8 perfis. Esperado: ~92% de acurácia no modo completo.

### 5. Abre no browser

```bash
npx serve .
```

Acessa `http://localhost:3000`.

---

## Como os labels de risco são calculados

O dataset original tem um campo `Risk Profile` gerado sinteticamente sem correlação real com as features. Os labels são recomputados a partir de uma fórmula baseada em fatores reais de risco em seguros:

| Feature | Pontuação |
|---|---|
| Direção: Limpo | 0 |
| Direção: Infrações leves | 1 |
| Direção: Infrações graves | 2 |
| Direção: Acidente | 3 |
| Direção: DUI | 4 |
| Sinistros: 0 | 0 |
| Sinistros: 1–2 | 1 |
| Sinistros: 3–4 | 2 |
| Sinistros: 5 | 3 |
| Sinistros anteriores: 0–3 | 0–3 |
| Score ≥ 750 | 0 |
| Score 650–749 | 1 |
| Score 580–649 | 2 |
| Score < 580 | 3 |
| Idade 25–65 | 0 |
| Idade > 65 | 1 |
| Idade < 25 | 2 |

**Thresholds:** 0–3 → Baixo | 4–6 → Médio-Baixo | 7–9 → Médio-Alto | 10+ → Alto

---

## Arquitetura do modelo

Rede neural sequencial com classificação multi-classe:

```
Input  (25 features normalizadas)
Dense  (64 neurônios, ReLU)
Dense  (32 neurônios, ReLU)
Dense  (16 neurônios, ReLU)
Output (4 classes, Softmax)
```

Loss: `categoricalCrossentropy` | Optimizer: `Adam (lr=0.001)` | Validation split: 10%

O vetor de entrada (25 dimensões) é composto por 6 features contínuas normalizadas (idade, renda, sinistros, crédito etc.) e 19 posições de one-hot encoding para variáveis categóricas (direção, ocupação, educação).

---

## Autor

**Giovani Silva** — Senior Frontend & Mobile Engineer  
[linkedin.com/in/giovanisilva](https://www.linkedin.com/in/giovanisilva)
