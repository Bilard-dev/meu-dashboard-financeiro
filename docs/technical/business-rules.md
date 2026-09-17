# ⚖️ Regras de Negócio Críticas e Invariantes Financeiras

**Versão:** 5.0
**Data:** 16/09/2026

---

## 1. Princípio da Imutabilidade Contábil

As regras detalhadas neste documento constituem o núcleo contábil e financeiro do **Meu Dashboard Financeiro**. Elas foram blindadas por testes automatizados (432 testes unitários e 331 testes E2E).

> [!CAUTION]
> **Aviso para Manutenções Futuras**: Nenhuma refatoração, ajuste estético de interface ou migração de banco de dados tem autorização para alterar ou flexibilizar as regras descritas abaixo sem validação e autorização prévia explícita.

---

## 2. Invariantes Financeiras Fundamentais

### 2.1. Liquidação Antecipada de Crédito (Early Settlement)

A regra contábil canônica do sistema estabelece a distinção matemática estrita entre três grandezas independentes:

$$\text{Despesa Econômica} \neq \text{Saída Financeira} \neq \text{Obrigação do Cartão}$$

#### A) O que é cada grandeza:
1. **Despesa Econômica**: Representa o consumo de bens ou serviços realizado na data da compra. Pertence à competência da fatura original do cartão de crédito. **Nunca duplica** e **nunca é substituída** pela quitação.
2. **Saída Financeira (Efetiva de Caixa)**: Representa o desembolso real de moeda (liquidez bancária) saindo da conta corrente, poupança ou caixa no momento do pagamento via PIX, saldo ou transferência. Pertence à data da liquidação.
3. **Obrigação Restante do Cartão**: Representa o saldo devedor que ainda resta a pagar à operadora do cartão de crédito quando a fatura fechar.

#### B) Demonstração Numérica Obrigatória:
Cenário: Compra no Cartão de Crédito de **R$ 500,00**, com Liquidação Antecipada via PIX de **R$ 300,00**:
* **Despesa Econômica**: **R$ 500,00** (a compra original não se transforma em PIX e continua categorizada no cartão).
* **Saída Financeira Efetiva via PIX**: **R$ 300,00** (débito real na conta bancária).
* **Obrigação Restante no Cartão**: **R$ 200,00** ($500 - 300 = 200$).
* **Fórmula do Saldo Residual**:
  $$\text{Saldo Residual Cartão} = \max(0, \text{Valor Original} - \text{Valor Liquidado})$$
* **Salvaguarda contra Valor Negativo**: Se por divergência a quitação registrar R$ 600,00 para uma compra de R$ 500,00, o saldo devedor do cartão é cravado em **R$ 0,00** e a saída é limitada ao teto de R$ 500,00, impedindo passivos negativos no extrato.

> [!NOTE]
> **Histórico de Precisão Contábil (Fase 5-C.2)**: Embora a estrutura de dados de liquidação suportasse valores parciais desde a sua concepção, a integração visual nos agregados da Aba Análise e do painel possuía uma inconsistência em que liquidações parciais zeravam indevidamente a obrigação de cartão e atribuíam o valor integral original ao PIX. Na Fase 5-C.2, esse cálculo de segregação proporcional (ex: 500 compra / 300 PIX $\rightarrow$ 300 PIX e 200 Cartão) foi formalmente corrigido e centralizado no `settlementEngine.js` (`calculateEffectivePaymentOutflows`), eliminando lógica contábil duplicada do `index.html`.

#### C) Comportamento em Liquidação Integral:
* Compra no cartão: R$ 500,00.
* Liquidação integral via PIX: R$ 500,00.
* **Resultado**: Despesa Econômica = R$ 500,00 | Saída PIX = R$ 500,00 | Obrigação Cartão = R$ 0,00.

#### D) Comportamento em Reversão:
* A exclusão física da liquidação é bloqueada; a reversão ocorre por cancelamento lógico (`status = 'CANCELADA'`).
* **Resultado Imediato**: A obrigação integral de R$ 500,00 é imediatamente restaurada no cartão de crédito, e o evento de saída financeira em PIX é expurgado dos totais do período.

---

### 2.2. Previsão Financeira 2.0 (`forecastEngine.js`)

A projeção de fluxo de caixa futuro de 3, 6 ou 12 meses deve refletir com exatidão os reflexos de liquidações antecipadas:
1. **Dedução de Obrigações**: Compras parceladas ou à vista projetadas em faturas futuras que foram antecipadamente quitadas têm seu peso reduzido na projeção de saídas.
2. **Quitação Integral**: Obrigação futura torna-se R$ 0,00 e o item recebe status visual `Quitado` (com valor original tachado na tabela da previsão).
3. **Quitação Parcial**: Obrigação futura é projetada estritamente pelo valor restante ($V_{\text{original}} - V_{\text{liquidado}}$), recebendo badge `Parcial`.
4. **Isolamento de Competência**: A antecipação de uma fatura de Outubro paga em Agosto não altera o montante econômico de Agosto, apenas antecipa o efeito financeiro.

---

### 2.3. Agendamentos e Assinaturas: Prevista $\neq$ Realizada (`schedulesService.js`)

O sistema suporta contratos de assinaturas (ex: Netflix) e despesas fixas agendadas:
1. **Ocorrência Prevista (`status = 'PENDENTE'`)**:
   * É estritamente um item virtual projetado para antecipar despesas na Aba Previsão.
   * **NUNCA** soma nas despesas realizadas do mês, **NUNCA** diminui o saldo em conta bancária e **NUNCA** altera KPIs do Dashboard principal.
2. **Confirmação da Ocorrência**:
   * O usuário clica em "Confirmar Lançamento".
   * Apenas neste momento uma transação real é inserida em `public.transacoes`.
   * A ocorrência em `public.agendamento_ocorrencias` transiciona para `CONFIRMADA` e guarda o `transacao_id` gerado, prevenindo duplicações.
3. **Cancelamento / Ignorar**:
   * Transiciona para `IGNORADA` sem criar lançamentos no livro contábil.

---

### 2.4. Dinheiro Físico / Saldo em Espécie (`cashCalculator.js`)

O controle de dinheiro vivo opera em livro-caixa físico desacoplado das contas digitais:
* **Fórmula Fundamental**:
  $$\text{Saldo Dinheiro Vivo} = \sum \text{Valor}(\text{tipo} = \text{'SAQUE'}) - \sum \text{Valor}(\text{tipo} = \text{'DESPESA'} \land \text{pagamento} = \text{'Dinheiro'})$$
* **Regras Estritas**:
  * Receitas com forma de pagamento marcada como "Dinheiro" **não** alimentam a carteira física (evita distorções de recebimentos informais ou depósitos diretos).
  * O saldo **não sofre clamp** a zero: se houver despesas em dinheiro sem saques prévios cadastrados, o indicador exibirá valor negativo em vermelho (ex: `-R$ 50,00`), alertando o usuário sobre saques não registrados.

---

### 2.5. Catálogos Dinâmicos e Preservação de Histórico

1. **Vedação a Listas Hardcoded**: Categorias, subcategorias, cartões e tags **são entidades 100% dinâmicas** criadas e mantidas pelo usuário no banco de dados. O código-fonte jamais deve forçar opções fixas ou estáticas.
2. **Inativação (Soft-Delete)**:
   * A "exclusão" de uma categoria ou cartão no catálogo marca `ativo = false`.
   * **Motivo**: Lançamentos antigos continuam referenciando o nome original na tabela e no extrato histórico. Se o registro fosse deletado fisicamente, transações passadas perderiam a categorização visual.
3. **Unificação Transacional (Merge)**:
   * Caso o usuário deseje eliminar uma categoria duplicada (ex: `Combustível` para `Transporte`), deve utilizar a função de **Merge** (via RPC `merge_categories`), que atualiza em lote todos os lançamentos históricos da origem para o destino, resolve o teto de metas e inativa a origem.

---

### 2.6. Controle de Acesso e Perfil Administrativo

1. **Separação entre Gestão de Usuários e Dados Financeiros**:
   * O papel de Administrador (`is_admin() = true`) permite gerenciar o *Access Gate* (aprovar, suspender, resetar acessos), auditar logs e gerenciar contas.
   * O Administrador **NÃO** tem acesso transparente de leitura ou escrita sobre as transações financeiras pessoais de outros usuários. As políticas de RLS continuam isolando estritamente os lançamentos por `user_id = auth.uid()`.
2. **Estados do Ciclo de Acesso**:
   * `pending`: Usuário recém-cadastrado. O modal de *Access Gate* bloqueia a visão dos dados financeiros até liberação pelo administrador.
   * `approved`: Acesso normal completo às funcionalidades financeiras.
   * `suspended` / `rejected`: Acesso suspenso ou recusado. A sessão é bloqueada e redirecionada para a tela de contato/bloqueio.

---

### 2.7. Sincronização Estrita de Filtros na Aba Cartão e Parcelas (Hotfix 5-D)

1. **Unicidade da Fonte de Verdade Visual**:
   * Os cards superiores e KPIs da aba Cartão e Parcelas (`Fatura do Mês`, `Fatura Projetada com Previstas`, `Fatura do Mês Seguinte`, `Total Pendente Futuro` e `Gastos Por Cartão`) devem refletir com precisão os mesmos filtros aplicados à listagem/tabela.
   * Filtros considerados: **Cartão**, **Tipo de Compra** (À vista, Parceladas, Recorrentes), **Categoria** e **Termo de Busca**.
2. **Causa Raiz Anterior e Resolução**:
   * Anteriormente, os resumos eram calculados sobre o conjunto global do mês antes da filtragem, gerando divergência entre a tabela e os cards superiores.
   * A função pura `calculateInvoiceSummary` (`src/domain/creditCard/invoiceCalculator.js`) recebe o objeto de filtros `{ cartao, type, category, search }` e recalcula tanto os itens da fatura quanto os agrupadores por cartão e totais futuros com base no subconjunto filtrado.
   * *Referência*: Commit `bc5f08c` (`fix: sync credit card filters with summaries`).

---

### 2.8. Proteção contra Concorrência e Gravação Duplicada de Transações (Hotfix 5-E / 5-E.1)

1. **Invariante de Gravação Única (Anti-Double-Click)**:
   * O fluxo de gravação de transações (tanto em "Salvar e Ir pro Resumo" quanto em "Salvar e Lançar Outro") utiliza uma guarda de reentrância lógica privada (`isSavingTransaction`) no escopo do cliente.
   * Durante uma operação de persistência assíncrona (`INSERT` ou `UPDATE`), nenhuma nova tentativa de save é autorizada.
2. **Proteção de Interface**:
   * Os botões de ação (`#btnSalvar`, `#btnSalvarOutro`, `#btnCancelarEdicao`) têm o atributo `disabled = true` aplicado imediatamente ao clique inicial.
   * O botão acionado recebe feedback visual textual imediato (`Salvando...`).
   * *Nota de Implementação*: Os campos de input (`#i_descricao`, `#i_valor`, etc.) **não** são desabilitados via propriedade `disabled`, preservando a experiência de digitação ágil do usuário; a integridade contra submissões concorrentes é assegurada estritamente pela trava lógica e pelo bloqueio dos botões de envio.
3. **Ordenação de Sincronização e Resiliência**:
   * O `INSERT` no Supabase é explicitamente aguardado (`await transactionsInsert`).
   * O desktop executa a sincronização subsequente de forma ordenada via `await manualSync()`, eliminando sobreposição de requisições de leitura e escrita.
   * Em caso de falha de rede ou validação no banco, os dados digitados permanecem intactos nos campos para correção pelo usuário, e a trava é liberada com segurança no bloco `finally`.
   * Em caso de sucesso no modo contínuo ("Salvar e Lançar Outro"), os campos de descrição, valor e tags são limpos para o próximo registro, mantendo a categoria, forma de pagamento e cartão pré-selecionados.
   * *Referência*: Commits `b014db6` (`fix: prevent concurrent transaction saves`) e Hotfix 5-E.1.
