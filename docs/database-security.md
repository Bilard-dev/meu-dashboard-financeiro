# 🛡️ Política de Segurança, Índices e RLS do Banco de Dados (Supabase)

**Data da Implementação e Validação:** 09/09/2026
**Status:** ✅ Concluído e Validado em Produção (Base 3.0)
**Schema:** `public`

---

## 1. Visão Geral
Este documento registra a arquitetura de segurança de dados em nível de linha (*Row Level Security* - RLS), índices e integridade referencial aplicadas às tabelas do sistema financeiro no Supabase.

O objetivo principal desta configuração é garantir o **isolamento estrito entre usuários**: nenhum usuário autenticado tem permissão para visualizar, inserir, modificar ou excluir registros financeiros ou catálogos pertencentes a outra conta.

---

## 2. Tabelas Protegidas com RLS
O Row Level Security (RLS) está explicitamente habilitado em 100% das tabelas da aplicação:
* `public.transacoes`
* `public.app_categorias`
* `public.app_subcategorias`
* `public.app_cartoes`
* `public.app_tags`
* `public.metas`

> [!NOTE]
> **Base 3.0 — Remoção de Gastos Compartilhados:** O módulo legado de Gastos Compartilhados foi descontinuado do frontend e a migration versionada `20260909103000_base3_database_cleanup.sql` define a remoção definitiva da tabela `public.gastos_compartilhados`, da coluna `gasto_compartilhado_id` e da FK correspondente.

---

## 3. Políticas Ativas (Estado Consolidado)

Existem exatamente **4 políticas ativas por tabela** (uma para cada operação CRUD: `SELECT`, `INSERT`, `UPDATE`, `DELETE`), todas restritas ao papel `authenticated` e otimizadas com `(SELECT auth.uid())`.

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

---

## 4. Índices Estratégicos (Base 3.0)

1. **`idx_transacoes_user_data` (`user_id, data DESC`):**
   Otimiza a consulta principal do dashboard (`loadDashboardData`), eliminando a necessidade de sequential scan e ordenação em memória, além de cobrir a Foreign Key `transacoes_user_id_fkey`.
2. **`idx_app_subcategorias_categoria_id` (`categoria_id`):**
   Cobre a integridade referencial da FK `app_subcategorias_categoria_id_fkey` para operações de restrição de exclusão (`ON DELETE RESTRICT`).
3. **Índices Únicos por Usuário:**
   Garantem a unicidade de nomes normalizados por conta em `app_categorias`, `app_subcategorias`, `app_cartoes`, `app_tags` e `metas`.

---

## 5. Migration Versionada (Base 3.0)

Arquivo: `supabase/migrations/20260909103000_base3_database_cleanup.sql`

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
3. **Integridade de `user_id NOT NULL`:**
   Garante a nível de banco que nenhum lançamento financeiro possa ser persistido sem vínculo a um usuário autenticado.
4. **Governança de Migrations:**
   A partir da Base 3.0, todas as alterações DDL são versionadas formalmente no diretório `supabase/migrations/`.
