# 🛡️ Política de Segurança, Índices e RLS do Banco de Dados (Supabase)

**Data da Última Revisão:** 09/09/2026
**Status de Segurança (RLS):** ✅ Concluído e Ativo em Produção
**Status da Migration Base 3.0:** ⏳ **Criada e Versionada — Aplicação Manual Pendente no Supabase SQL Editor**
**Schema:** `public`

---

## 1. Visão Geral
Este documento registra a arquitetura de segurança de dados em nível de linha (*Row Level Security* - RLS), políticas de acesso e integridade referencial aplicadas às tabelas do sistema financeiro no Supabase.

O objetivo principal desta configuração é garantir o **isolamento estrito entre usuários**: nenhum usuário autenticado tem permissão para visualizar, inserir, modificar ou excluir registros financeiros ou catálogos pertencentes a outra conta.

---

## 2. Tabelas Protegidas com RLS (Estado em Produção)
O Row Level Security (RLS) está explicitamente habilitado em todas as tabelas atualmente existentes no banco de produção:
* `public.transacoes`
* `public.app_categorias`
* `public.app_subcategorias`
* `public.app_cartoes`
* `public.app_tags`
* `public.metas`
* `public.gastos_compartilhados` *(legado aguardando execução da migration de limpeza)*

> [!NOTE]
> **Base 3.0 — Remoção de Gastos Compartilhados:** A funcionalidade de Gastos Compartilhados foi completamente removida do frontend. A tabela `public.gastos_compartilhados` e a coluna `gasto_compartilhado_id` permanecem temporariamente no banco de produção protegidas por RLS até a execução manual da migration `20260909103000_base3_database_cleanup.sql`.

---

## 3. Políticas Ativas em Produção

Existem exatamente **4 políticas ativas por tabela** (uma para cada operação CRUD: `SELECT`, `INSERT`, `UPDATE`, `DELETE`), todas restritas ao papel `authenticated` e otimizadas com a subconsulta `(SELECT auth.uid())`.

### 📋 Tabela `public.transacoes`

| Operação | Nome da Política | Condição `USING` | Condição `WITH CHECK` |
| :--- | :--- | :--- | :--- |
| **SELECT** | `transacoes_select_policy` | `(user_id = (SELECT auth.uid()))` | *(não se aplica)* |
| **INSERT** | `transacoes_insert_policy` | *(não se aplica)* | `(user_id = (SELECT auth.uid()))` |
| **UPDATE** | `transacoes_update_policy` | `(user_id = (SELECT auth.uid()))` | `(user_id = (SELECT auth.uid()))` |
| **DELETE** | `transacoes_delete_policy` | `(user_id = (SELECT auth.uid()))` | *(não se aplica)* |

### 📋 Tabelas de Catálogos (`app_categorias`, `app_subcategorias`, `app_cartoes`, `app_tags`) e `metas`
Todas possuem políticas simétricas no padrão:
* `SELECT`: `(user_id = (SELECT auth.uid()))`
* `INSERT`: `WITH CHECK (user_id = (SELECT auth.uid()))`
* `UPDATE`: `USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))`
* `DELETE`: `USING (user_id = (SELECT auth.uid()))`

### 📋 Tabela `public.gastos_compartilhados` (Ativa em Produção até Aplicação da Migration)
* `SELECT / UPDATE / DELETE`: `USING (created_by = (SELECT auth.uid()))`
* `INSERT / UPDATE`: `WITH CHECK (created_by = (SELECT auth.uid()))`

---

## 4. Índices Estratégicos

### Índices Ativos no Banco de Produção:
* Chaves primárias (PKs) em todas as tabelas.
* Índices únicos compostos por `(user_id, nome_normalizado)` em todas as tabelas de catálogos e metas.
* `idx_transacoes_grupo_parcela`: `(grupo_parcela_id) WHERE (grupo_parcela_id IS NOT NULL)`.
* `unique_transacao_por_gasto_compartilhado`: `(gasto_compartilhado_id) WHERE (gasto_compartilhado_id IS NOT NULL)` *(legado)*.

### Índices Definidos na Migration Base 3.0 (Pendentes de Aplicação):
1. **`idx_transacoes_user_data` (`user_id, data DESC`):**
   Otimiza a consulta principal do dashboard (`loadDashboardData`), eliminando sequential scan e ordenação em memória, e cobrindo a FK `transacoes_user_id_fkey`.
2. **`idx_app_subcategorias_categoria_id` (`categoria_id`):**
   Cobre a integridade referencial da FK `app_subcategorias_categoria_id_fkey` para operações de restrição de exclusão (`ON DELETE RESTRICT`).

---

## 5. Migration Versionada (Base 3.0) — Pendente de Aplicação Manual

* **Arquivo:** `supabase/migrations/20260909103000_base3_database_cleanup.sql`
* **Status:** ⏳ **Pendente de execução manual no Supabase SQL Editor**

```sql
BEGIN;

-- 1. Criação de Índices de Alta Eficiência
CREATE INDEX IF NOT EXISTS idx_transacoes_user_data
ON public.transacoes (user_id, data DESC);

CREATE INDEX IF NOT EXISTS idx_app_subcategorias_categoria_id
ON public.app_subcategorias (categoria_id);

-- 2. Remoção Definitiva do Backend Legado de Gastos Compartilhados
ALTER TABLE public.transacoes
DROP CONSTRAINT IF EXISTS fk_transacoes_gasto_compartilhado_owner;

DROP INDEX IF EXISTS public.unique_transacao_por_gasto_compartilhado;

ALTER TABLE public.transacoes
DROP COLUMN IF EXISTS gasto_compartilhado_id;

DROP TABLE IF EXISTS public.gastos_compartilhados;

-- 3. Reforço de Integridade no Schema
ALTER TABLE public.transacoes
ALTER COLUMN user_id SET NOT NULL;

COMMIT;
```

---

## 6. Destaques de Boas Práticas

1. **Uso de `USING` + `WITH CHECK` no `UPDATE`:**
   Garante que o usuário só consiga editar suas próprias linhas e impede a troca do campo `user_id` para outro identificador durante atualizações.
2. **Otimização com `(SELECT auth.uid())`:**
   A subconsulta isolada garante que o Postgres avalie a identidade do usuário uma única vez por statement.
3. **Governança de Migrations:**
   A partir da Base 3.0, todas as alterações DDL são versionadas formalmente no repositório Git em `supabase/migrations/` antes de sua aplicação em produção.
4. **Isolamento de Ferramentas de Auditoria:**
   As integrações automatizadas (como MCP Supabase) operam em modo somente-leitura por padrão de segurança, exigindo que migrações DDL sejam aplicadas via console administrativo / SQL Editor.
