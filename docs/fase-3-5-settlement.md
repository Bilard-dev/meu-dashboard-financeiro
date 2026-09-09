# ⚡ Fase 3.5 — Liquidação Antecipada do Crédito (Early Credit Settlement)

**Data de Implementação:** 09/09/2026  
**Status:** ✅ Concluída, Testada e Validada  
**Suíte de Testes:** 160 Testes Unitários (`node:test`) + 239 Testes E2E (`playwright`) — 100% Verdes  

---

## 1. Problema Real e Regra de Negócio

No fluxo financeiro do usuário:
1. Uma compra é realizada no **Cartão de Crédito** para aproveitamento de benefícios e pontuação (ex: R$ 600,00 à vista ou em 3x R$ 200,00).
2. Posteriormente, o usuário antecipa o pagamento dessa obrigação via **PIX** pelo aplicativo bancário/cartão antes do fechamento da fatura.
3. **Invariante Financeira**: A liquidação via PIX **NÃO** é uma segunda despesa. O total despendido continua sendo exatamente R$ 600,00 (imunidade contra *double counting*).
4. A transação original permanece intacta com `pagamento = 'Cartão de Crédito'`, preservando estabelecimento, categoria, subcategoria, data de compra e tags.
5. A obrigação na fatura daquele cartão/competência é quitada, reduzindo o saldo aberto da fatura e o saldo devedor restante futuro.
6. **Reversibilidade**: A qualquer momento, a quitação pode ser revertida, restaurando a parcela como pendente.

---

## 2. Modelagem de Dados (`public.liquidacoes_credito`)

Arquivo de migration: `supabase/migrations/20260909120000_fase35_credit_settlement.sql`

```sql
CREATE TABLE IF NOT EXISTS public.liquidacoes_credito (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transacao_id UUID NOT NULL REFERENCES public.transacoes(id) ON DELETE CASCADE,
    parcela_numero INTEGER NOT NULL DEFAULT 1 CHECK (parcela_numero >= 1),
    valor NUMERIC NOT NULL CHECK (valor > 0),
    data_liquidacao DATE NOT NULL,
    forma_liquidacao TEXT NOT NULL DEFAULT 'PIX',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_liquidacao_por_parcela UNIQUE (user_id, transacao_id, parcela_numero)
);

CREATE INDEX IF NOT EXISTS idx_liquidacoes_credito_user_transacao
ON public.liquidacoes_credito (user_id, transacao_id);

CREATE INDEX IF NOT EXISTS idx_liquidacoes_credito_user_data
ON public.liquidacoes_credito (user_id, data_liquidacao DESC);

ALTER TABLE public.liquidacoes_credito ENABLE ROW LEVEL SECURITY;
```

### Políticas RLS
- `liquidacoes_credito_select_policy`: `(user_id = (SELECT auth.uid()))`
- `liquidacoes_credito_insert_policy`: `(user_id = (SELECT auth.uid()))`
- `liquidacoes_credito_update_policy`: `(user_id = (SELECT auth.uid()))`
- `liquidacoes_credito_delete_policy`: `(user_id = (SELECT auth.uid()))`

---

## 3. Camadas de Domínio e Serviço

### 3.1. Serviço (`src/services/creditSettlementService.js`)
- `fetchCreditSettlements(userId)`: busca liquidações com resiliência para schema em migração.
- `insertCreditSettlement(payload)`: persiste nova quitação.
- `deleteCreditSettlement(userId, id)`: exclui quitação por UUID.
- `deleteCreditSettlementByTransaction(userId, transacaoId, parcelaNumero)`: reversão direta por transação e parcela.
- `deleteCreditSettlementsByTransactionId(userId, transacaoId)`: exclusão em cascata.

### 3.2. Motor de Domínio (`src/domain/creditSettlement/settlementEngine.js`)
- `buildSettlementKey(transacaoId, parcelaNumero)`: gera chave O(1) determinística.
- `createSettlementMap(settlements)`: indexa conjunto de quitações em `Map`.
- `isInstallmentSettled(settlementMap, transacaoId, parcelaNumero)`: verifica quitação.
- `enrichItemsWithSettlement(items, settlements)`: enriquece itens de fatura com metadados de quitação.

### 3.3. Integração com Calculadoras Financeiras
- `invoiceCalculator.js`:
  - `calculateInvoiceSummary(selectedYm, transactions, settlements = [])`:
    - `totalFaturaSelecionada`: calcula saldo aberto pendente (exclui itens quitados).
    - `totalFaturaBruta`: total nominal integral da fatura.
    - `totalLiquidadoNaCompetencia`: total baixado antecipadamente.
    - `totalRestanteFuturo`: exclui parcelas futuras já quitadas.
    - `itemsNoMes`: linhas enriquecidas com `isLiquidado: true|false` e `liquidacao: object`.
- `forecastEngine.js`:
  - `calculateFinancialForecast(startYm, horizonMonths, transactions, settlements = [])`:
    - Despesas de parcelas futuras quitadas antecipadamente não aumentam o comprometimento orçamentário (`totalComprometido`).

---

## 4. Interface e Experiência do Usuário (UI)

1. **Aba Parcelas / Fatura Cartão**:
   - Cada compra ou parcela exibe o botão de ação rápida `⚡` (**Quitar com PIX**).
   - Ao clicar, abre o modal `#creditSettlementModal` com valor, descrição, seletor de data e forma de liquidação (PIX).
   - Ao confirmar, o item recebe o badge `⚡ Quitada (PIX)` e visual riscado/verde, o saldo em aberto da fatura diminui e surge o botão `↩️` (**Reverter Quitação**).
   - Ao reverter, o item volta ao estado pendente com confirmação explícita.
