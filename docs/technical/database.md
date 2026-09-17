# 🗄️ Modelo de Dados e Banco de Dados (Supabase PostgreSQL)

**Versão:** 5.0
**Data:** 16/09/2026
**Schema:** `public`
**Engine:** PostgreSQL 15+ (Supabase)

---

## 1. Visão Geral e Princípios Estruturais

O banco de dados é governado por princípios estritos de **isolamento multilocatário (multitenancy)**, integridade referencial e auditoria:
1. **Ownership por Classes de Tabelas e Gate de Acesso**: Tabelas financeiras e de catálogos possuem `user_id UUID NOT NULL REFERENCES auth.users(id)` e aplicam RLS estrito com a condição `(user_id = auth.uid() AND public.has_app_access())`. Tabelas de governança e auditoria seguem políticas dedicadas por perfil de acesso e papéis restritos.
2. **Row Level Security (RLS) Ativo em Todas as Tabelas**: Nenhuma tabela do schema `public` permite leitura ou escrita pública anônima. Usuários não autenticados, pendentes ou suspensos são contidos no banco de dados.
3. **Preservação de Histórico**: Tabelas de catálogo utilizam *soft-inactivation* (`ativo BOOLEAN DEFAULT true`), impedindo que a exclusão de uma categoria quebre lançamentos históricos anteriores.
4. **Triggers de Validação Contábil com search_path Seguro**: Triggers procedurales em PL/pgSQL rodam com `search_path = pg_catalog, public, pg_temp` fixado explicitamente.

---

## 2. Inventário de Tabelas do Schema `public`

### 2.1. Tabelas do Núcleo Financeiro

#### 1. `public.transacoes`
* **Finalidade**: Tabela central do sistema, armazena todos os lançamentos financeiros realizados (receitas, despesas, investimentos e saques).
* **Ownership**: `user_id` vinculado a `auth.users(id)`.
* **Colunas Principais**:
  * `id` (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`): Identificador único da transação.
  * `user_id` (`UUID NOT NULL`): Chave estrangeira para o dono do registro.
  * `tipo` (`TEXT NOT NULL CHECK (tipo IN ('Receita','Despesa','Investimento','Saque'))`): Tipo da operação.
  * `data` (`DATE NOT NULL`): Data civil do evento financeiro.
  * `descricao` (`TEXT NOT NULL`): Descrição do lançamento (pode conter tags ancoradas ex: `[Férias] Hotel`).
  * `valor` (`NUMERIC NOT NULL CHECK (valor > 0)`): Valor financeiro da transação.
  * `categoria` (`TEXT NOT NULL`): Nome da categoria associada.
  * `subcategoria` (`TEXT`): Nome da subcategoria (opcional).
  * `pagamento` (`TEXT NOT NULL`): Meio de pagamento (`PIX`, `Cartão de Crédito`, `Débito`, `Dinheiro`).
  * `cartao` (`TEXT`): Nome do cartão de crédito (obrigatório se pagamento for `Cartão de Crédito`).
  * `parcela` (`TEXT`): Indicador de parcelamento (`À vista`, `1/3`, `2/3`, ou `Recorrente`).
  * `grupo_parcela_id` (`TEXT`): Identificador único para amarrar todas as parcelas de uma mesma compra parcelada.
  * `fatura_destino` (`TEXT`): Competência de fechamento (`ATUAL` ou `PROXIMA`).
  * `tags` (`TEXT[]`): Array de tags associadas ao lançamento.
  * `created_at` (`TIMESTAMPTZ DEFAULT now()`).
* **RLS**: 4 políticas ativas (`transacoes_select_policy`, `transacoes_insert_policy`, `transacoes_update_policy`, `transacoes_delete_policy`), aplicando `(user_id = auth.uid() AND public.has_app_access())`.
* **Integridade**: `ON DELETE CASCADE` se o usuário for removido do Auth.

---

#### 2. `public.app_categorias`
* **Finalidade**: Catálogo dinâmico de categorias de primeiro nível do usuário.
* **Ownership**: `user_id` obrigatório.
* **Colunas**: `id` (UUID), `user_id` (UUID), `nome` (TEXT), `tipo` (TEXT: 'Despesa' ou 'Receita'), `cor` (TEXT), `ativo` (BOOLEAN DEFAULT true), `created_at`.
* **Restrições**: Índice único por `(user_id, LOWER(nome), tipo)`.
* **Inativação**: Registros inativados (`ativo = false`) desaparecem dos seletores de novo lançamento, mas permanecem no banco para preservar o histórico visual de transações passadas.

---

#### 3. `public.app_subcategorias`
* **Finalidade**: Catálogo de subcategorias subordinadas a uma categoria pai.
* **Ownership**: `user_id` obrigatório.
* **Colunas**: `id` (UUID), `user_id` (UUID), `categoria_id` (UUID NOT NULL REFERENCES app_categorias(id) ON DELETE RESTRICT), `nome` (TEXT), `ativo` (BOOLEAN DEFAULT true), `created_at`.
* **Integridade**: `ON DELETE RESTRICT` impede a exclusão física da categoria pai caso existam subcategorias atreladas.

---

#### 4. `public.app_cartoes`
* **Finalidade**: Catálogo de cartões de crédito do usuário.
* **Ownership**: `user_id` obrigatório.
* **Colunas**: `id` (UUID), `user_id` (UUID), `nome` (TEXT), `dia_fechamento` (INT CHECK (1-31)), `dia_vencimento` (INT CHECK (1-31)), `cor` (TEXT), `ativo` (BOOLEAN DEFAULT true), `created_at`.
* **Restrições**: Índice único por `(user_id, LOWER(nome))`.

---

#### 5. `public.app_tags`
* **Finalidade**: Catálogo dinâmico de tags para agrupamento transversal de transações (ex: `Viagem para Praia`, `Reforma do Quarto`).
* **Ownership**: `user_id` obrigatório.
* **Colunas**: `id` (UUID), `user_id` (UUID), `nome` (TEXT), `cor` (TEXT), `ativo` (BOOLEAN DEFAULT true), `created_at`.
* **Restrições**: Índice único por `(user_id, LOWER(nome))`.

---

#### 6. `public.metas`
* **Finalidade**: Orçamentos e metas mensais estipulados por categoria para acompanhamento de teto de gastos.
* **Ownership**: `user_id` obrigatório.
* **Colunas**: `id` (UUID), `user_id` (UUID), `categoria` (TEXT), `valor_teto` (NUMERIC), `created_at`.

---

### 2.2. Liquidação Antecipada e Crédito

#### 7. `public.liquidacoes_credito`
* **Finalidade**: Registra pagamentos antecipados (ex: via PIX) que abatem parcelas ou compras em aberto de cartão de crédito.
* **Ownership**: `user_id` obrigatório.
* **Colunas**:
  * `id` (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`).
  * `user_id` (`UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`).
  * `transacao_id` (`UUID NOT NULL REFERENCES public.transacoes(id) ON DELETE CASCADE`).
  * `grupo_parcela_id` (`TEXT`): Identificador do grupo de parcelas (para compras parceladas).
  * `parcela_numero` (`INTEGER NOT NULL DEFAULT 1 CHECK (parcela_numero >= 1)`).
  * `valor` (`NUMERIC NOT NULL CHECK (valor > 0)`): Valor liquidado (integral ou parcial).
  * `data_liquidacao` (`DATE NOT NULL`): Data civil em que o PIX foi pago.
  * `forma_liquidacao` (`TEXT NOT NULL DEFAULT 'PIX'`).
  * `status` (`TEXT NOT NULL DEFAULT 'ATIVA' CHECK (status IN ('ATIVA', 'CANCELADA'))`).
  * `cancelled_at` (`TIMESTAMPTZ`): Data/hora da reversão, caso cancelada.
  * `created_at`, `updated_at` (`TIMESTAMPTZ DEFAULT now()`).
* **Triggers Ativos**:
  * `trg_liquidacoes_credito_updated_at`: Atualiza `updated_at = now()` com `search_path = pg_catalog, public, pg_temp`.
  * `trg_liquidacoes_credito_validate_coherence`: Validação de coerência contábil (despesa de cartão) com `search_path = pg_catalog, public, pg_temp`.
* **Restrições de Unicidade**: Índice único parcial garantindo que só exista **uma liquidação ATIVA** por parcela: `unique_active_liquidacao_por_parcela` em `(user_id, transacao_id, parcela_numero) WHERE status = 'ATIVA'`.

---

### 2.3. Agendamentos e Assinaturas (Fase 4.6)

#### 8. `public.agendamentos_financeiros`
* **Finalidade**: Armazena as regras de contratos recorrentes (assinaturas como Netflix, Spotify) e agendamentos PIX futuros.
* **Ownership**: `user_id` obrigatório.
* **Colunas**: `id` (UUID), `user_id` (UUID), `tipo` (TEXT: 'DESPESA'/'RECEITA'), `descricao` (TEXT), `valor` (NUMERIC), `forma_pagamento` (TEXT), `categoria` (TEXT), `subcategoria` (TEXT), `cartao` (TEXT), `frequencia` (TEXT: 'MENSAL', 'SEMANAL', 'ANUAL', 'UNICA'), `dia_vencimento` (INT), `data_inicio` (DATE), `data_fim` (DATE), `ativo` (BOOLEAN DEFAULT true), `created_at`.

#### 9. `public.agendamento_ocorrencias`
* **Finalidade**: Instâncias concretas geradas para cada competência a partir de um agendamento regra.
* **Colunas**: `id` (UUID), `agendamento_id` (UUID REFERENCES agendamentos_financeiros(id) ON DELETE CASCADE), `user_id` (UUID), `data_vencimento` (DATE), `valor` (NUMERIC), `status` (`TEXT CHECK (status IN ('PENDENTE', 'CONFIRMADA', 'IGNORADA'))`), `transacao_id` (`UUID REFERENCES transacoes(id) ON DELETE SET NULL`), `created_at`.
* **Invariante**: Enquanto `status = 'PENDENTE'`, o valor é meramente uma projeção orçamentária e **nunca** soma nas métricas de caixa realizado. Ao ser confirmada, gera um registro real em `public.transacoes` e vincula o `transacao_id`.

---

### 2.4. Central Administrativa, Auditoria e Acesso (Fase 4.5)

#### 10. `public.admin_users`
* **Finalidade**: Lista de usuários com privilégios de superadministrador.
* **Colunas**: `user_id` (UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE), `created_at`.
* **Função Auxiliar**: `is_admin()` avalia `EXISTS(SELECT 1 FROM admin_users WHERE user_id = auth.uid())`.
* **RLS**: Deny-all para clientes; leitura apenas via função canônica `is_admin()`.

#### 11. `public.user_profiles`
* **Finalidade**: Perfil de identificação do usuário com controle de aprovação de acesso (*Access Gate*).
* **Colunas**: `user_id` (UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE), `display_name` (TEXT NOT NULL, 2 a 80 chars), `access_status` (`TEXT CHECK (access_status IN ('pending', 'approved', 'rejected', 'suspended')) DEFAULT 'pending'`), `created_at`, `approved_at`, `approved_by` (UUID REFERENCES auth.users(id) ON DELETE SET NULL).
* **Função Auxiliar**: `has_app_access()` garante que apenas usuários com `access_status = 'approved'` (ou admins) possam operar dados financeiros.
* **RLS**: Leitura direta permitida apenas para o próprio perfil (`user_id = auth.uid()`). Escrita direta por clientes negada (provisionamento via trigger `handle_new_user_profile` ou RPC `complete_legacy_profile`).

#### 12. `public.admin_audit_logs`
* **Finalidade**: Trilha de auditoria indelével de ações administrativas sensíveis no sistema.
* **Colunas**: `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid()), `admin_user_id` (UUID REFERENCES auth.users(id) ON DELETE SET NULL), `target_user_id` (UUID), `target_email` (TEXT NOT NULL), `action` (`TEXT CHECK (action IN ('USER_DATA_RESET', 'USER_DATA_RESTORED', 'USER_DATA_PURGED', 'PASSWORD_RESET_REQUESTED'))`), `metadata` (JSONB NOT NULL DEFAULT '{}'::jsonb), `created_at` (TIMESTAMPTZ NOT NULL DEFAULT now()).
* **Proteção**: RLS habilitado sem permissão de escrita/leitura direta para clientes; registros gravados exclusivamente pelas RPCs administrativas seguras.

#### 13. `public.user_data_resets`
* **Finalidade**: Armazena snapshots transitórios em JSON dos dados financeiros de usuários quando um administrador executa um reset a pedido do usuário, permitindo restauração de emergência em até 48 horas.
* **Colunas**: `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid()), `user_id` (UUID REFERENCES auth.users(id) ON DELETE CASCADE), `snapshot` (JSONB NOT NULL), `status` (`TEXT CHECK (status IN ('active', 'restored', 'purged')) DEFAULT 'active'`), `created_at` (TIMESTAMPTZ NOT NULL DEFAULT now()), `expires_at` (TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours')), `restored_at` (TIMESTAMPTZ), `purged_at` (TIMESTAMPTZ), `created_by` (UUID REFERENCES auth.users(id) ON DELETE SET NULL).
* **Restrições**: Índice parcial exclusivo `idx_user_data_resets_one_active_per_user` garantindo no máximo 1 reset ativo por usuário. Fail-closed total via RLS (nenhuma leitura/escrita direta por clientes).

---

## 3. Principais RPCs (Stored Procedures)

Abaixo estão as principais Stored Procedures e RPCs catalogadas no banco de dados, divididas por classe de governança:

### 3.1. Classe A — Operações de Domínio do Usuário Autenticado
Permissão `EXECUTE` concedida a `authenticated`. O isolamento multitenant é garantido no corpo da função via `user_id = auth.uid()` ou `has_app_access()`.

| Nome da RPC | Privilégios | Finalidade |
| :--- | :--- | :--- |
| `merge_categories(p_source_id, p_target_id, p_meta_action)` | SECURITY DEFINER | Transfere transações da categoria de origem para o destino, resolve teto de metas (KEEP_TARGET, KEEP_SOURCE, SUM) e inativa a origem. |
| `merge_subcategories(p_source_id, p_target_id)` | SECURITY DEFINER | Transfere transações da subcategoria de origem para o destino e inativa a origem. |
| `merge_cards(p_source_id, p_target_id)` | SECURITY DEFINER | Transfere transações de cartão de crédito para o destino e inativa o cartão de origem. |
| `merge_tags(p_source_id, p_target_id)` | SECURITY DEFINER | Substitui tags em todas as transações afetadas do usuário e inativa a tag de origem. |
| `confirmar_agendamento_ocorrencia(p_ocorrencia_id, p_valor_realizado, p_data_realizada)` | SECURITY DEFINER | Transforma uma ocorrência prevista em transação financeira realizada, atualizando status para CONFIRMADA. |
| `cancelar_agendamento_ocorrencia(p_ocorrencia_id)` | SECURITY DEFINER | Cancela uma ocorrência pendente sem gerar lançamentos contábeis. |
| `complete_legacy_profile(p_display_name)` | SECURITY DEFINER | Permite que usuários legados autenticados definam seu nome de identificação e gerem perfil com status pendente. |
| `has_app_access()` | SECURITY DEFINER | Avalia se o usuário da requisição está aprovado (`approved`) ou é administrador. |
| `is_admin()` | SECURITY DEFINER | Avalia se o usuário atual autenticado possui privilégio de superadministrador. |

### 3.2. Classe B — RPCs Administrativas
Permissão `EXECUTE` para `authenticated`, com validação server-side estrita `IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso negado'`.

| Nome da RPC | Privilégios | Finalidade |
| :--- | :--- | :--- |
| `admin_list_users(p_search, p_status, p_limit, p_offset)` | SECURITY DEFINER | Lista usuários cadastrados com dados de perfil e status de acesso (sem expor credenciais ou lançamentos financeiros). |
| `admin_set_user_access(p_user_id, p_new_status)` | SECURITY DEFINER | Altera o status de acesso do usuário (`approved`, `rejected`, `suspended`) com gravação de auditoria. |
| `admin_get_activity_metrics()` | SECURITY DEFINER | Retorna faixas agregadas de operações (30d) e nível de atividade por usuário sem expor dados contábeis. |
| `admin_get_activity_summary()` | SECURITY DEFINER | Retorna contagens agregadas de usuários por status de acesso. |
| `admin_reset_user_data(p_target_user_id)` | SECURITY DEFINER | Cria snapshot transitório em `user_data_resets` e limpa transações/catálogos do usuário alvo com auditoria. |
| `admin_restore_user_data(p_target_user_id, p_reset_id)` | SECURITY DEFINER | Restaura snapshot em até 48 horas, preservando integridade referencial. |
| `admin_get_user_reset_status(p_target_user_id)` | SECURITY DEFINER | Consulta se existe reset ativo e recuperável para o usuário, disparando purge preventivo internamente. |
| `admin_log_password_reset_request(p_target_user_id)` | SECURITY DEFINER | Registra solicitação de redefinição de senha na trilha de auditoria administrativa. |
| `admin_prepare_user_deletion(p_target_user_id)` | SECURITY DEFINER | Valida pré-requisitos para exclusão física de usuário antes do acionamento da Edge Function. |

### 3.3. Classe C — Rotinas Internas de Manutenção
Privilégio `EXECUTE` revogado de `PUBLIC`, `anon` e `authenticated`; acesso concedido a `postgres` e `service_role`.

| Nome da RPC | Privilégios | Finalidade |
| :--- | :--- | :--- |
| `admin_purge_expired_user_resets()` | SECURITY DEFINER | Rotina de expurgo de snapshots expirados (> 48h). Chamada internamente por RPCs autorizadas ou pg_cron. |

---

## 4. Ressalva Operacional Crítica sobre Migrations Remotas

> [!CAUTION]
> **Aviso de Governança de Banco de Dados**:
> 1. O ambiente remoto do Supabase foi configurado através de migrations aplicadas manualmente e scripts incrementais durante as Fases 3.0 a 5-B.
> 2. **O histórico da tabela `supabase_migrations.schema_migrations` NÃO está reconciliado com o repositório local.**
> 3. **NUNCA executar `supabase db push`**: O comando tentará reaplicar todas as migrations sequenciais a partir do início ou descartar objetos existentes, corrompendo o schema de produção.
> 4. **NUNCA executar `supabase migration repair`**: Tentativas cegas de reparo de migrations resultarão em estados de erro e bloqueio de deployment.
> 5. Toda migration futura deve ser revisada, testada isoladamente e aplicada de forma estritamente controlada e idempotente.
