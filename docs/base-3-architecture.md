# 🏗️ Arquitetura Consolidada da Base 3.0

**Data de Conclusão e Validação:** 09/09/2026
**Status:** ✅ Concluída, Validada e Protegida
**Suíte de Testes:** 143 Testes Unitários (`node:test`) + 235 Testes E2E (`playwright`) — 100% Verdes

---

## 1. Objetivo da Base 3.0

A **Base 3.0** teve como propósito central a modernização arquitetural e o saneamento técnico do ecossistema do Dashboard Financeiro, transformando um monólito procedural em uma estrutura modular, desacoplada, tipada por contratos de domínio puro e rigorosamente testada, sem introduzir regressões ou alterar regras financeiras pré-existentes.

Os pilares fundamentais concluídos foram:
1. **Extração e Isolamento de Serviços Backend**: Centralização de 100% das chamadas Supabase em serviços desacoplados (`src/services/`).
2. **Extração de Domínio Financeiro Puro**: Criação de motores matemáticos determinísticos e isolados de DOM e variáveis globais (`src/domain/`).
3. **Fundação de Testes Unitários de Alta Velocidade**: Criação de testes puros de caracterização e regressão com `node:test` (143 testes, execução em ~300ms).
4. **Saneamento do Banco de Dados e RLS**: Remoção definitiva de Gastos Compartilhados, reforço `NOT NULL` em `user_id`, criação de índices de alta performance e governança de migrations versionadas (`supabase/migrations/`).
5. **Preservação Estrita de Datas Civis Locais**: Eliminação de anomalias de fuso horário / UTC no fuso do Brasil (UTC-3).

---

## 2. Diagrama de Fluxo de Dados

```text
┌─────────────────────────────────────────────────────────┐
│                   Supabase PostgreSQL                   │
│          (RLS Ativo, 6 Tabelas, 4 Merge RPCs)           │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                  src/services/ Layer                    │
│   (supabaseClient, auth, transactions, catalogs, metas) │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│              src/store/ & Estado Local                  │
│       (state.js puro + caches globalData no app)        │
└──────────────┬──────────────────────────┬───────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────────────┐  ┌───────────────────────┐
│     src/domain/ (Puro)       │  │    src/core/ (Puro)   │
│  - cashCalculator.js         │  │  - dateUtils.js       │
│  - competenceEngine.js       │  │  - formatters.js      │
│  - invoiceCalculator.js      │  │  - security.js        │
│  - forecastEngine.js         │  │  - textUtils.js       │
└──────────────┬───────────────┘  └───────────┬───────────┘
               │                              │
               └──────────────┬───────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                UI & Camada de Apresentação              │
│       (index.html: Tabelas, Modais, Cards, KPIs, DOM)   │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Estrutura Modular e Responsabilidades

```text
src/
├── core/                        # Utilitários puros e invariantes transversais
│   ├── dateUtils.js             # Manipulação de datas civis locais, meses BR e parsing sem shifts UTC
│   ├── formatters.js            # Formatação de moeda BRL (com Privacy Mode) e badges de fatura
│   ├── security.js              # Sanitização XSS (escapeHtml) e validação de força de senhas
│   └── textUtils.js             # Normalização de strings, tags ancoradas em colchetes [TAG]
│
├── services/                    # Encapsulamento de I/O e comunicação com Supabase
│   ├── supabaseClient.js        # Instância compartilhada do cliente Supabase
│   ├── authService.js           # Login, logout, signup, recuperação e troca de senha
│   ├── catalogsService.js       # CRUD de categorias, subcategorias, cartões, tags e merge RPCs
│   ├── metasService.js          # CRUD e sincronização de orçamentos e metas mensais
│   └── transactionsService.js   # CRUD de transações, exclusão em lote por grupo e atualizações
│
├── store/                       # Gerenciamento de estado compartilhado
│   └── state.js                 # Privacy mode, routing sync, rename previews, extrato filtrado, etc.
│
└── domain/                      # Motores financeiros e regras de negócio determinísticas
    ├── cash/
    │   └── cashCalculator.js    # Saldo de dinheiro físico (espécie): Saques menos Despesas em Dinheiro
    ├── competence/
    │   └── competenceEngine.js  # Alocação por competência (despesas imediatas civis + faturas de cartão)
    ├── creditCard/
    │   └── invoiceCalculator.js # SSOT para agrupamento de compras, projeção de parcelas/recorrências e saldo devedor futuro
    └── forecast/
        └── forecastEngine.js    # Projeção orçamentária futura (3, 6, 12 meses) com breakdowns e confirmados
```

---

## 4. Motores de Domínio Financeiro

### 4.1. Dinheiro Físico / Espécie (`cashCalculator.js`)
* **Regra**: `Saldo Espécie = ∑(SAQUE) - ∑(DESPESA onde forma de pagamento é "Dinheiro")`.
* **Propriedades**: Não sofre clamp artificial (pode ser negativo se houver gastos sem saques registrados); transações de `RECEITA` com forma de pagamento "Dinheiro" não alteram o caixa físico.

### 4.2. Competência Mensal (`competenceEngine.js`)
* **Regra**: Despesas não-cartão (PIX, Dinheiro, Débito, Boleto) pertencem ao mês civil em que ocorreram (`year-month`). Despesas no cartão de crédito pertencem à fatura correspondente.

### 4.3. Faturas e Parcelas de Cartão (`invoiceCalculator.js`)
* **SSOT**: Centraliza todo o algoritmo de sementes (`purchasesMap`), deduplicação por UUID (`grupo_parcela_id`) e chave composta heurística legada (`safeDesc_safeCartao_safeValue_total_originalYear_originalMonth`).
* **Offset de Faturas**:
  - `ATUAL`: offset 0 (mês da compra).
  - `PROXIMA`: offset +1 (mês seguinte).
  - `YYYY-M`: fatura absoluta explícita.
* **Projeção de Parcelas**: Calcula `parcelaNoMes = initAtual + deltaTarget` e determina pertinência no intervalo `[1, total]`.
* **Saldo Devedor Futuro**: `totalRestanteFuturo` soma parcelas remanescentes de dívidas parceladas finitas (compras recorrentes e à vista não são tratadas como dívidas com prazo).

### 4.4. Previsão Financeira 2.0 (`forecastEngine.js`)
* **Regra**: Itera pelo horizonte (3, 6 ou 12 meses) consumindo `competenceEngine.js`. Agrega total comprometido, despesas de cartão, parcelas, recorrências, outras despesas imediatas, quebras por cartão/categoria e receitas/aportes confirmados. Suporta estornos negativos que abatem algebricamente o comprometimento.

---

## 5. Convenções e Regras Críticas

### 5.1. Faturas em Base 0 (`YYYY-M`)
* No banco e na interface legada, a convenção `YYYY-M` utiliza o mês em base 0 do JavaScript (ex.: `2026-7` representa Agosto de 2026).
* Essa convenção foi preservada integralmente em todos os módulos e testes para garantir compatibilidade retroativa com os dados existentes.

### 5.2. Preservação de Datas Civis Locais
* Todas as datas escolhidas pelo usuário no padrão `YYYY-MM-DD` são manipuladas localmente fixando meio-dia (`rawDate + 'T12:00:00'`) ou através de `formatLocalDateInput`, evitando deslocamentos de dia ocasionados por conversões ingênuas de fuso horário UTC (como `toISOString()` noturno no Brasil UTC-3).

---

## 6. Banco de Dados, RLS e Governança

* **Tabelas (6)**: `app_cartoes`, `app_categorias`, `app_subcategorias`, `app_tags`, `metas`, `transacoes` — todas com `rowsecurity = true`.
* **Políticas (24)**: Isolamento estrito por `user_id = (SELECT auth.uid())` para `SELECT`, `INSERT`, `UPDATE` e `DELETE`.
* **Integridade**: `transacoes.user_id` é `NOT NULL`.
* **Índices de Performance**: `idx_transacoes_user_data` (`user_id, data DESC`) e `idx_app_subcategorias_categoria_id` (`categoria_id`).
* **Merge RPCs Confirmadas (4)**:
  1. `merge_cards(p_source_id, p_target_id)`
  2. `merge_categories(p_source_id, p_target_id, p_meta_resolution)`
  3. `merge_subcategories(p_source_id, p_target_id)`
  4. `merge_tags(p_source_id, p_target_id)`
* **Migrations**: Centralizadas e versionadas em `supabase/migrations/20260909103000_base3_database_cleanup.sql`.

---

## 7. Bridges de Compatibilidade (`window.*`)

Como estratégia consciente da Base 3.0 para evitar a reescrita desnecessária de toda a camada de apresentação HTML/DOM e manter os handlers inline funcionando perfeitamente, foram mantidas 55 pontes explícitas no script módulo:
* Utilitários Core (`escapeHtml`, `normalizeCatalogName`, `normalizeText`, `isStrongPassword`, `extractTagsFromDesc`, `buildDescWithTags`, `monthNamesBR`, `formatLocalDateInput`, `formatFaturaBadge`, `fmt`).
* Estado (`togglePrivacyMode`, `getRoutingSync`, `setRoutingSync`, `getPendingRenameData`, `setPendingRenameData`, `clearPendingRenameData`, `getFilteredExtratoData`, `setFilteredExtratoData`, etc.).
* Serviços Backend (`auth*`, `metas*`, `catalog*`, `transactions*`).
* Motores de Domínio (`calculateCashBalance`, `calculateInvoiceSummary`, `getExpensesByCompetence`, `calculateFinancialForecast`).

> [!NOTE]
> Essas bridges representam uma decisão arquitetural transitória e controlada: fornecem interoperabilidade entre o ecossistema ES6 modular e o monólito de UI sem gerar acoplamento oculto.

---

## 8. Funcionalidades Futuras (Não Implementadas na Base 3.0)

Para manter a clareza e precisão do registro técnico:
* ⚠️ **Liquidação Antecipada de Parcelas**: Não foi implementada na Base 3.0 (planejada para a Fase 3.5).
* ⚠️ **Migração Completa de UI para Componentes Reativos / PWA**: Não foi implementada na Base 3.0 (o `index.html` permanece como camada de apresentação funcional).
