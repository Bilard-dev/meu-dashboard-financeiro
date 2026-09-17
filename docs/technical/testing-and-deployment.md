# 🧪 Estrutura de Testes e Fluxo de Deploy

**Versão:** 5.0
**Data:** 16/09/2026

---

## 1. Pirâmide de Testes e Estratégia de Qualidade

A estabilidade do **Meu Dashboard Financeiro** apoia-se em duas suítes automatizadas complementares:
1. **Testes Unitários Rápidos (`node:test`)**: Validação pura, matemática e determinística de motores de domínio, cálculos, datas civis, normalização de texto e segurança XSS.
2. **Testes E2E e de Integração (`Playwright`)**: Validação de ponta a ponta simulando a experiência do usuário real no navegador (desktop e mobile), manipulação de formulários, transições SPA, integridade visual e interceptações de rede com mocks autenticados.

```text
               ▲
              / \
             / E2E \          Playwright (343 Testes)
            /  Browser \      - Viewports Desktop & Mobile
           /────────────\     - Jornadas de Usuário & Redes
          /              \
         /  Testes Puros  \   Node.js Nativo (439 Testes)
        /   de Domínio     \  - Regras Matemáticas & Motores
       /────────────────────\ - Execução em < 1 segundo
```

---

## 2. Comandos Canônicos do `package.json`

Os seguintes scripts são os únicos suportados e homologados:

| Comando | Descrição da Execução | Tempo Médio |
| :--- | :--- | :--- |
| `npm run test:unit` | Executa todos os testes unitários (`node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --test "tests/unit/*.test.js"`). | ~0,5 a 1 segundo |
| `npm test` | Executa a suíte completa de testes E2E do Playwright (`playwright test`). | ~8 a 10 minutos |
| `npm run test:ui` | Abre a interface interativa do Playwright com timeline, inspeção de DOM e screenshots passo a passo. | Modo Interativo |
| `npm run test:report` | Abre o relatório detalhado em HTML da última execução de testes do Playwright no navegador padrão. | Visualização |

### 2.1. Execução de Testes Focados (Recomendado para Desenvolvimento)
Para manter alta velocidade durante desenvolvimento e correção de bugs pontuais, recomenda-se executar apenas os arquivos de teste pertinentes à alteração:

```bash
# Executar apenas testes de uma especificação Playwright:
npx playwright test tests/credit_card_filters_kpis.spec.js
npx playwright test tests/investigate_race_condition.spec.js
npx playwright test tests/tags.spec.js
npx playwright test tests/mobile_navigation.spec.js

# Executar um único cenário de teste por linha:
npx playwright test tests/mobile_transaction_flow.spec.js:140
```

---

## 3. Estado Conhecido de Validação (Checkpoint Setembro/2026 — Pós-Hotfixes 5-D e 5-E)

> [!NOTE]
> Os números abaixo registram a referência histórica exata validada no checkpoint de **setembro/2026** (após a integração dos Hotfixes 5-D e 5-E/5-E.1). Eles atestam a integridade e não-regressão do sistema no momento do fechamento, servindo como linha de base para futuras manutenções.

* **Testes Unitários**: **439 / 439 PASS** (100% de sucesso). Inclui cobertura adicional em `invoiceCalculator.test.js` para filtragem multidimensional de faturas.
* **Testes Playwright Completo**: **343 / 343 PASS** em execução sequencial completa.
* **Testes Playwright Específicos do Hotfix 5-D**: **5 / 5 PASS** (`tests/credit_card_filters_kpis.spec.js`), validando a sincronização dos cards superiores e KPIs com filtros de cartão, tipo de compra, categoria e busca.
* **Testes Playwright de Concorrência e Regressão do Hotfix 5-E**: **7 / 7 PASS** (`tests/investigate_race_condition.spec.js`), protegendo cenários de:
  1. *Cenário Slow (Controle)*: 10 lançamentos sequenciais aguardando conclusão;
  2. *Cenário Fast (Principal)*: 10 lançamentos sem espera artificial;
  3. *Cenário Double-Click*: cliques rápidos gerando exatamente 1 POST e 1 registro;
  4. *Cenário Latência e Erro*: atraso de rede (600ms), bloqueio do segundo save e recuperação de estado após erro de rede;
  5. *Cenário Criação de Categoria*: intercalação de criação de categoria no meio de múltiplos lançamentos rápidos;
  6. *Cenário Comparativo*: fluxo de "Salvar e Ir pro Resumo";
  7. *Cenário Volume 25*: rajada contínua de 25 lançamentos rápidos em sequência.

---

## 4. Estrutura dos Arquivos de Teste

### 4.1. Testes Unitários (`tests/unit/`)
* `accessGate.test.js`: Valida o bloqueio de usuários pendentes e permissão de aprovados/admins.
* `adminDataResets.test.js`, `adminPasswordReset.test.js`, `adminService.test.js`, `adminUserDeletion.test.js`: Operações administrativas e trilhas de auditoria.
* `analyticsEngine.test.js`: Médias por mês, dia e lançamento, e comparativo de despesas do mês atual contra média histórica.
* `authUX.test.js`: Mensagens amigáveis de erro de autenticação e feedback visual.
* `cashCalculator.test.js`: Saldo em espécie e preservação de valores negativos sem clamp.
* `competenceEngine.test.js`: Regras de competência de faturas vs compras imediatas.
* `dateUtils.test.js` e `timezoneRegression.test.js`: Blindagem contra bugs de fuso horário UTC-3 no Brasil (lançamentos noturnos às 21h30 e 23h30).
* `forecastEngine.test.js`: Projeção futura considerando obrigações residuais de cartões quitados.
* `formatters.test.js`: Formatação de moeda BRL, mascaramento em Modo Privacidade e badges.
* `invoiceCalculator.test.js`: Agrupamento de parcelas, faturas abertas, limites de cartão e cálculo de resumos filtrados por cartão/tipo/categoria/busca.
* `schedules.test.js`: Geração determinística de ocorrências de assinaturas.
* `security.test.js`: Validações de escape XSS e critérios de senha forte.
* `settlementEngine.test.js`: 55 testes cobrindo liquidação antecipada integral, parcial, reversão, salvaguarda de saldo negativo e isolamento de período.
* `state.test.js` e `textUtils.test.js`: Estado em memória e manipulação de tags ancoradas.

### 4.2. Especificações E2E do Playwright (`tests/`)
* `admin_security.spec.js`: Painel admin, proteção contra auto-exclusão e restrições RLS.
* `advanced_filters.spec.js`: Filtros por período, tipo, categoria, tag, valores e médias.
* `credit_card_filters_kpis.spec.js`: Sincronização entre filtros da aba Cartão e Parcelas e cards superiores (Hotfix 5-D).
* `credit_settlement.spec.js` e `credit_settlement_financial_effects.spec.js`: Ciclos completos de liquidação antecipada, reflexos em KPIs e reversões.
* `investigate_race_condition.spec.js`: Blindagem contra concorrência, double-click e saves paralelos (Hotfix 5-E).
* `mobile_navigation.spec.js` e `mobile_transaction_flow.spec.js`: Bottom nav mobile, touch targets, Lançador Rápido e transição sem perda de dados para o formulário completo.
* `pwa.spec.js` e `responsive_viewports.spec.js`: Manifesto PWA, Service Worker e adaptação visual em 320px, 390px, 768px e 1920px.
* `tags.spec.js`, `transactions.spec.js`, `routing.spec.js`, `smoke.spec.js`: CRUD de transações, tags com colchetes e roteamento SPA por hash.

---

## 5. Fluxo Canônico de Deploy

O processo de deploy é contínuo e orientado à estabilidade da branch `main`:

```text
┌─────────────────────────────────────────────────────────┐
│ 1. Desenvolvimento e Ajustes Locais                     │
│    (Alterações em arquivos src/, index.html, etc.)      │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Validação Automatizada Pré-Commit                    │
│    - npm run test:unit (432 testes = 100% verde)        │
│    - Playwright nos specs afetados                      │
│    - git diff --check (nenhum erro de whitespace)       │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Checkpoint e Commit Git                              │
│    - Commits semânticos atômicos (feat, fix, security)  │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Push para Repositório Remoto                         │
│    - git push origin main                               │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Publicação em Produção (GitHub Pages)                │
│    - Pipeline do GitHub Actions faz o deploy estático   │
│      automático dos arquivos da branch main             │
└─────────────────────────────────────────────────────────┘
```

### 5.1. Diferenciação Obrigatória de Ambientes de Teste

Para garantir diagnósticos precisos, diferencie sempre:

* 🧪 **TESTE LOCAL**:
  * Utilizado durante o desenvolvimento para validar alterações antes de commitar.
  * Executado via servidor HTTP local servindo a pasta de trabalho (ex: `http://127.0.0.1:3000` via Playwright staticServer ou `python -m http.server 3000`).
  * Permite validar imediatamente arquivos modificados no disco antes de qualquer push.

* 🌐 **TESTE ONLINE**:
  * Utilizado para validar o ambiente de produção real hospedado no GitHub Pages.
  * Acessível publicamente em: `https://bilard-dev.github.io/meu-dashboard-financeiro/`.
  * Utiliza as migrations já aplicadas no banco de dados remoto do Supabase.
