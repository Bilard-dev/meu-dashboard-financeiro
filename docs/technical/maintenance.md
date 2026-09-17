# 🛠️ Guia de Manutenção, Cuidados Operacionais e Pendências

**Versão:** 5.0
**Data:** 16/09/2026

---

## 1. Pendências e Cuidados Operacionais Conhecidos

Este capítulo documenta o estado real de itens que requerem atenção operacional, separados estritamente por suas naturezas (Pendência Manual de Validação, Pendência Operacional de Infraestrutura e Preservação de Processo). Nenhum desses itens representa corrupção de dados ou falha de compilação.

### 1.1. Pendências Manuais de Validação do Usuário (Homologação Visual)
| # | Item | Status Real | Orientação Técnica e Ação Necessária |
| :---: | :--- | :---: | :--- |
| **1** | **Validação Manual da Fase 4.7-A** | ⏳ PENDENTE | O Painel de Médias Financeiras e o comparativo de gastos do mês atual contra média histórica possuem 100% dos testes unitários e E2E aprovados, mas a validação manual visual e sensorial pelo usuário final na interface ainda não foi realizada. **Não declarar como concluída sem homologação humana.** |
| **2** | **Validação Manual da Fase 4.7-B** | ⏳ PENDENTE | A integração entre Liquidação Antecipada de Cartão e a Previsão Financeira 2.0 (badges Quitado/Parcial e abatimento de obrigações) possui todos os testes automatizados aprovados, restando a homologação visual pelo usuário. **Não declarar como concluída sem homologação humana.** |

### 1.2. Pendências Operacionais e de Infraestrutura
| # | Item | Status Real | Orientação Técnica e Ação Necessária |
| :---: | :--- | :---: | :--- |
| **3** | **Leaked Password Protection (Supabase Auth)** | ⚠️ AÇÃO MANUAL | Na auditoria de segurança da Fase 5-A foi identificado que a proteção contra senhas vazadas em vazamentos públicos conhecidos (*HaveIBeenPwned*) estava desabilitada. Como essa configuração não pode ser alterada via SQL/migration, **deve ser verificada/ativada manualmente pelo proprietário no painel web do Supabase** (`Authentication > Advanced Settings > Password Protection`). |
| **4** | **Governança de Migrations Remotas** | 🛑 PROIBIÇÃO | O histórico de migrations da tabela interna `supabase_migrations.schema_migrations` no banco remoto não está sincronizado com o fluxo sequencial local. **PROIBIDO utilizar `supabase db push` ou `supabase migration repair`**. Qualquer nova migration deve ser executada de forma atômica e declarativa. |

### 1.3. Preservação de Processo e Artefatos Locais
| # | Item | Status Real | Orientação Técnica e Ação Necessária |
| :---: | :--- | :---: | :--- |
| **5** | **Stash Legado Preservado** | 📦 PRESERVADO | Existe um stash em `stash@{0}: On main: wip: M4.0-D mobile financial views`. Ele contém rascunhos visuais de uma etapa de exploração da interface mobile. **Não aplicar e não descartar** (`git stash drop`) sem ordem explícita do usuário. |
| **6** | **Manual Visual do Usuário (Untracked)** | 📁 PRESERVADO | A pasta `docs/manual/` e o arquivo compactado `manual-screenshots.zip` contêm 13 capturas de alta resolução da interface e o manual para o usuário final leigo. Eles são mantidos propositalmente no disco e fora do commit técnico para não inflar o histórico de objetos do git. |

---

## 2. O que NUNCA Fazer ao Estender o Sistema

Para garantir que o código continue limpo, seguro e performático em manutenções futuras:

1. ❌ **NÃO reintroduzir código hardcoded de catálogos**:
   * Nunca defina arrays estáticos como `const categorias = ['Alimentação', 'Transporte']` no JavaScript. O sistema possui catálogo 100% dinâmico alimentado pelo banco de dados.
2. ❌ **NÃO duplicar regras contábeis em `index.html`**:
   * Toda e qualquer conta relacionada a liquidação antecipada, parcelas, saldos devedores ou saídas financeiras **deve ser executada através das funções puras em `src/domain/`** (especialmente `calculateEffectivePaymentOutflows` em `settlementEngine.js`).
3. ❌ **NÃO inserir chaves administrativas no cliente**:
   * A chave `service_role` **jamais** deve ser importada ou referenciada no frontend ou em arquivos públicos. Toda ação com privilégio elevado pertence exclusivamente a Edge Functions com autenticação severa.
4. ❌ **NÃO mascarar erros com reloads ou temporizadores artificiais**:
   * Evite `window.location.reload()`, `setTimeout(..., 1000)` ou repetições forçadas de requisição para encobrir problemas de concorrência ou reatividade. Resolva a causa raiz determinística na camada de dados ou de estado (`state.js`).
5. ❌ **NÃO remover colunas ou tabelas sem plano de migração reversível**:
   * Exclusões físicas de colunas no banco de dados devem ser previamente avaliadas quanto a impactos no histórico financeiro de anos anteriores do usuário.

---

## 3. Protocolo Progressivo para Correção de Bugs

Caso um novo erro ou comportamento anômalo seja reportado, siga este fluxo rigoroso:

1. **Localização Precisa**:
   * Identifique o módulo de menor escopo possível (ex: `cashCalculator.js` se for saldo em dinheiro, `invoiceCalculator.js` se for agrupamento de faturas).
2. **Reprodução por Teste Automatizado**:
   * Crie um teste unitário mínimo em `tests/unit/` com o caso que falha antes de alterar qualquer linha de implementação.
3. **Correção de Menor Escopo**:
   * Aplique a alteração mínima necessária para fazer o teste passar, garantindo que nenhum teste pré-existente seja quebrado.
4. **Validação Cruzada**:
   * Execute `npm run test:unit` (todos os 439 testes devem permanecer verdes).
   * Execute a especificação do Playwright diretamente afetada pelo fluxo.
5. **Verificação Git**:
   * Rode `git diff --check` para garantir conformidade de formatação e ausência de trailing whitespaces.
