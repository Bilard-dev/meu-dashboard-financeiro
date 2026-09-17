# 🏛️ Arquitetura do Sistema — Meu Dashboard Financeiro

**Versão:** 5.0
**Data:** 16/09/2026

---

## 1. Visão Geral e Paradigma Arquitetural

O **Meu Dashboard Financeiro** adota uma arquitetura **Single Page Application (SPA)** orientada a módulos ES6 puros no frontend (*Zero-Build* / vanilla JavaScript) combinada com um backend desacoplado gerenciado via **Supabase** (PostgreSQL, Auth e Edge Functions).

A arquitetura passou por um processo progressivo de saneamento (Base 3.0 até Fase 5.0), desacoplando lógica matemática de negócio da manipulação visual de DOM.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Camada de Apresentação (UI)                     │
│  index.html (Layout, DOM, Modais, Cards, Listeners, Chart.js, Render)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Bridges de Interoperabilidade (window.*)                 │
│      Ponte ES6 Module ↔ Handlers Inline / Código Legado no DOM         │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│       Motores de Domínio Puro        │  │   Serviços e Estado Local    │
│            (src/domain/)             │  │   (src/services/, src/store) │
│ - settlementEngine.js                │  │ - transactionsService.js     │
│ - forecastEngine.js                  │  │ - creditSettlementService.js │
│ - analyticsEngine.js                 │  │ - catalogsService.js         │
│ - invoiceCalculator.js               │  │ - schedulesService.js        │
│ - competenceEngine.js                │  │ - adminService.js            │
│ - cashCalculator.js                  │  │ - state.js (Memory Store)    │
└───────────────────┬──────────────────┘  └──────────────┬───────────────┘
                    │                                    │
                    └──────────────────┬─────────────────┘
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Camada de Dados e Segurança                        │
│             Supabase Client (PostgreSQL 15 + RLS + RPCs)               │
│               + Supabase Auth + Edge Functions (Deno)                  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Divisão de Responsabilidades e Modularização

### 2.1. O que já foi extraído para `src/` (Módulos Puros)

| Módulo | Caminho | Responsabilidade Primária |
| :--- | :--- | :--- |
| **`dateUtils.js`** | `src/core/` | Parsing seguro de data civil (meio-dia UTC) para imunidade contra timezone shift (UTC-3), formatação `YYYY-MM-DD` e nomes de meses em pt-BR. |
| **`formatters.js`** | `src/core/` | Formatação monetária em Real (`R$ 1.234,56`), badges de status de fatura e suporte ao Modo Privacidade (`R$ •••••`). |
| **`security.js`** | `src/core/` | Sanitização XSS estrita (`escapeHtml`) e validação de requisitos de força de senha (`isStrongPassword`). |
| **`textUtils.js`** | `src/core/` | Normalização de catálogos (remoção de acentos/espaços) e parsing/injeção de tags prefixadas em colchetes `[TAG] Descrição`. |
| **`settlementEngine.js`** | `src/domain/creditSettlement/` | **Motor canônico contábil**: mapeamento de liquidações antecipadas, quitação integral, quitação parcial, reversão e cálculo de saídas efetivas de caixa por método de pagamento. |
| **`forecastEngine.js`** | `src/domain/forecast/` | Projeção determinística de fluxo de caixa futuro para 3, 6 e 12 meses, deduzindo obrigações liquidadas e integrando agendamentos. |
| **`analyticsEngine.js`** | `src/domain/analytics/` | Cálculo consolidado de médias financeiras (por mês, dia e lançamento), divisores dinâmicos de período e comparativo gasto atual vs média histórica. |
| **`invoiceCalculator.js`** | `src/domain/creditCard/` | Agrupamento de compras com cartão por competência de fatura, projeção de parcelamentos, cálculo de limite/saldo devedor e recálculo sincronizado de KPIs e resumos por filtros multidimensionais (cartão, tipo de compra, categoria e busca — Hotfix 5-D). |
| **`competenceEngine.js`** | `src/domain/competence/` | Separação estrita entre competência civil de despesas imediatas e faturas de cartão de crédito. |
| **`cashCalculator.js`** | `src/domain/cash/` | Cálculo do saldo de dinheiro físico (espécie) via diferença matemática entre saques e despesas em dinheiro. |
| **`supabaseClient.js`** | `src/services/` | Inicialização única da instância `createClient`, lendo credenciais públicas (`anonKey`) com fallback resiliente. |
| **`authService.js`** | `src/services/` | Wrapper sobre `supabase.auth` (login, cadastro, logout, reset de senha por e-mail e atualização de credenciais). |
| **`transactionsService.js`**| `src/services/` | Consultas, inserção, edição e exclusão de transações (`transacoes`), inclusive exclusão em lote de parcelas vinculadas. |
| **`catalogsService.js`** | `src/services/` | Gestão de categorias, subcategorias, cartões e tags, além de disparar RPCs de unificação (`merge`). |
| **`creditSettlementService.js`** | `src/services/` | Persistência, consulta e reversão lógica (`status = 'CANCELADA'`) de liquidações antecipadas em `liquidacoes_credito`. |
| **`schedulesService.js`** | `src/services/` | Regras de criação/desativação de assinaturas e geração/confirmação/cancelamento de ocorrências de agendamentos. |
| **`adminService.js`** | `src/services/` | Painel de controle: auditoria, aprovação/rejeição de acessos, estatísticas globais, resets e chamada à Edge Function de exclusão. |
| **`state.js`** | `src/store/` | Estado central em memória para flags de runtime (privacy mode, routing sync, dados de merge, extrato filtrado). |

---

### 2.2. O que permanece centralizado em `index.html`

Por opção consciente de arquitetura para manter a aplicação leve, sem bundler e executável diretamente via navegador/GitHub Pages, `index.html` retém:
1. **Estrutura HTML e Modais**: Templates declarativos de modais (quitação antecipada, rápido mobile, novo lançamento, edição, catálogos, confirmação).
2. **Ciclo de Vida e Bootstrap**: Event listener `DOMContentLoaded`, escuta de mudanças de estado de autenticação (`onAuthStateChange`) e orquestração do carregamento inicial.
3. **Caches Globais em Memória**: Variáveis de runtime gerenciadas pela interface:
   * `globalData` (todas as transações do usuário logado);
   * `globalCategorias`, `globalSubcategorias`, `globalCartoes`, `globalTags`;
   * `globalCreditSettlements` (liquidações de crédito ativas e revertidas);
   * `globalSchedules`, `globalOccurrences`;
   * `globalUser` e `currentUserProfile`.
4. **Renderização de DOM**: Funções que manipulam `innerHTML` e montam tabelas (`renderParcelasTab`, `renderForecastTab`, `runAnaliseGastos`, `updateDashboard`, `renderAdminTab`). Na aba de parcelas, sincroniza os filtros multidimensionais com o recálculo dos cards superiores e KPIs (Hotfix 5-D).
5. **Orquestração de Gravação e Trava de Concorrência**: Controle do fluxo de persistência de transações (`addOrUpdateTransaction`), com trava lógica de reentrância privada (`isSavingTransaction`), desabilitação atômica de botões durante o save e sincronização sequencial com o backend (Hotfix 5-E).
6. **Integração com Chart.js**: Criação e atualização de instâncias dos gráficos (`myChart`, `catAveragesChart`).
7. **Controle de Eventos Mobile**: Abertura/fechamento do Bottom Sheet "Mais", Bottom Navigation ativa, FAB Central e Lançador Rápido.

---

## 3. Bridges de Compatibilidade (`window.*`)

Para permitir que funções utilitárias e serviços modulares sejam acionados a partir de handlers HTML declarativos (ex: `onclick="openCatalogModal(...)"`) sem quebrar o escopo de módulos ES6, o bloco `<script type="module">` em `index.html` expõe explicitamente ponte global controlada:

```javascript
// Exemplo de Bridge em index.html:
window.escapeHtml = escapeHtml;
window.formatLocalDateInput = formatLocalDateInput;
window.calculateEffectivePaymentOutflows = calculateEffectivePaymentOutflows;
window.calculateCategoryAverages = calculateCategoryAverages;
window.compareCategoryActualVsAverage = compareCategoryActualVsAverage;
window.isInstallmentSettled = isInstallmentSettled;
window.createSettlementMap = createSettlementMap;
window.buildFinancialEvents = buildFinancialEvents;
window.getExpensesByCompetence = getExpensesByCompetence;
window.calculateFinancialForecast = calculateFinancialForecast;
window.getPrivacyMode = getPrivacyMode;
window.togglePrivacyMode = togglePrivacyMode;
window.getRoutingSync = getRoutingSync;
window.setRoutingSync = setRoutingSync;
```

> [!TIP]
> Essa ponte evita vazamento descontrolado de variáveis globais e mantém os módulos em `src/` 100% puros e testáveis em ambiente Node.js sem necessidade de DOM (`jsdom` ou mocks de navegador).

---

## 4. Roteamento SPA (Hash Routing)

O roteamento é puramente *client-side* baseado no fragmento de hash da URL (`window.location.hash`).

### 4.1. Tabela Canônica de Rotas

| Rota Hash | Aba Ativa no DOM | Descrição |
| :--- | :--- | :--- |
| `#/dashboard` | `#tab-resumo` | Dashboard Principal (KPIs do mês, Saldo em Dinheiro, Gráficos e Extrato Recente). |
| `#/extrato` | `#tab-analise` | Análise de Gastos detalhada, Filtros Avançados, Painel de Médias e Comparativo. |
| `#/faturas` ou `#/parcelas` | `#tab-parcelas` | Faturas de Cartão, Parcelamentos Futuros e Liquidação Antecipada de Crédito. |
| `#/previsao` | `#tab-previsao` | Previsão Financeira 2.0 (Projeção futura de 3, 6 ou 12 meses com liquidações). |
| `#/investimentos` | `#tab-investimentos` | Carteira de Investimentos (Aportes, Rendimentos e Histórico de Ativos). |
| `#/agendamentos` | `#tab-agendamentos` | Assinaturas Recorrentes e Agendamentos PIX (Contratos e Ocorrências). |
| `#/configuracoes` | `#tab-categorias` | Gerenciamento Dinâmico de Catálogos (Categorias, Subcategorias, Cartões e Tags). |
| `#/minha-conta` | `#tab-conta` | Dados cadastrais do usuário, troca de senha e alternância de Tema (Dark/Light). |
| `#/admin` | `#tab-admin` | Central Administrativa (Acessível exclusivamente por usuários com `is_admin() = true`). |

### 4.2. Comportamento e Resiliência do Roteamento
* **Normalização Automática**: URLs sem hash ou com rota inválida (ex: `#/rota-inexistente`) realizam *fallback* suave e normalizam a URL para `#/dashboard`.
* **Sincronização Bidirecional**: Trocar de aba via clique em botões desktop ou Bottom Nav mobile altera o hash via `setRoutingSync(true)` para evitar recargas desnecessárias; alterar o hash diretamente na barra de endereços dispara o evento `hashchange` e alterna a aba correspondente.
* **Deep Linking Pós-Login**: Se um usuário deslogado tentar acessar `#/previsao`, a rota pretendida é memorizada e reaberta imediatamente após a autenticação bem-sucedida.

---

## 5. Arquitetura Mobile e PWA

1. **Responsividade Adaptativa**:
   * Viewports `<= 768px`: Header simplificado, ativação do `#mobileBottomNav` com 5 posições (Início, Faturas, FAB Central `+`, Investimentos e Mais), espaçamento inferior seguro (`env(safe-area-inset-bottom)`) e formulário `quickLaunchModal`.
   * Viewports `> 768px`: Bottom Nav oculto, navegação tradicional por abas no topo e formulário completo na Aba 6 (`#tab-novo`).
2. **PWA (Progressive Web App)**:
   * Arquivo `manifest.json` com `display: "standalone"`, `theme_color: "#1e293b"`, orientação e ícones em múltiplas resoluções.
   * `sw.js` (Service Worker) intercepta requisições estáticas para permitir inicialização rápida e funcionamento da casca da aplicação mesmo com instabilidades de rede.
