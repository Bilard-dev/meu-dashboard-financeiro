# 🛡️ Política de Segurança e RLS do Banco de Dados (Supabase)

**Data da Implementação e Validação:** 17/08/2026  
**Status:** ✅ Concluído e Validado em Produção  
**Schema:** `public`  

---

## 1. Visão Geral
Este documento registra a arquitetura de segurança de dados em nível de linha (*Row Level Security* - RLS) aplicada às tabelas do sistema financeiro no Supabase.

O objetivo principal desta configuração é garantir o **isolamento estrito entre usuários**: nenhum usuário autenticado tem permissão para visualizar, inserir, modificar ou excluir registros financeiros pertencentes a outra conta.

---

## 2. Tabelas Protegidas com RLS
O Row Level Security (RLS) está explicitamente habilitado nas tabelas:
* `public.transacoes`
* `public.gastos_compartilhados`

---

## 3. Políticas Ativas (Estado Consolidado)

Existem exatamente **4 políticas ativas por tabela** (uma para cada operação CRUD: `SELECT`, `INSERT`, `UPDATE`, `DELETE`), todas restritas ao papel `authenticated`.

### 📋 Tabela `public.transacoes`

| Operação | Nome da Política | Condição `USING` | Condição `WITH CHECK` |
| :--- | :--- | :--- | :--- |
| **SELECT** | `transacoes_select_policy` | `(user_id = (SELECT auth.uid()))` | *(não se aplica)* |
| **INSERT** | `transacoes_insert_policy` | *(não se aplica)* | `(user_id = (SELECT auth.uid()))` |
| **UPDATE** | `transacoes_update_policy` | `(user_id = (SELECT auth.uid()))` | `(user_id = (SELECT auth.uid()))` |
| **DELETE** | `transacoes_delete_policy` | `(user_id = (SELECT auth.uid()))` | *(não se aplica)* |

### 📋 Tabela `public.gastos_compartilhados`

| Operação | Nome da Política | Condição `USING` | Condição `WITH CHECK` |
| :--- | :--- | :--- | :--- |
| **SELECT** | `gastos_compartilhados_select_policy` | `(created_by = (SELECT auth.uid()))` | *(não se aplica)* |
| **INSERT** | `gastos_compartilhados_insert_policy` | *(não se aplica)* | `(created_by = (SELECT auth.uid()))` |
| **UPDATE** | `gastos_compartilhados_update_policy` | `(created_by = (SELECT auth.uid()))` | `(created_by = (SELECT auth.uid()))` |
| **DELETE** | `gastos_compartilhados_delete_policy` | `(created_by = (SELECT auth.uid()))` | *(não se aplica)* |

---

## 4. Destaques de Segurança e Boas Práticas

1. **Uso de `USING` + `WITH CHECK` no `UPDATE`:**  
   Garante que o usuário só consiga editar suas próprias linhas (`USING`) e impede que ele tente alterar a coluna de propriedade (`user_id` ou `created_by`) para outro ID durante a edição (`WITH CHECK`).
2. **Otimização de Performance com `(SELECT auth.uid())`:**  
   O encapsulamento em subconsulta faz com que o Postgres avalie o ID do usuário apenas uma vez por consulta, em vez de reexecutar linha por linha.
3. **Remoção da Exceção Admin Fixa:**  
   A antiga política baseada em e-mail fixo (`tbilard@hotmail.com`) foi completamente removida em favor de um modelo de segurança 100% simétrico e baseado em `auth.uid()`.
4. **Remoção de Políticas Permissivas Abertas (`true`):**  
   As 16 políticas antigas foram removidas, incluindo todas as políticas permissivas que utilizavam condições abertas (`true`).

---

## 5. SQL de Referência para Recriação das Políticas

> [!IMPORTANT]
> **IMPORTANTE:** Este script altera políticas de segurança do banco e não deve ser executado automaticamente por agentes de IA. Antes de executá-lo, deve-se revisar o estado atual do banco e obter aprovação explícita.

```sql
-- 1. Habilitar RLS nas tabelas
ALTER TABLE public.transacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos_compartilhados ENABLE ROW LEVEL SECURITY;

-- 2. Limpar políticas legadas se existirem
DROP POLICY IF EXISTS "Delecao_Apenas_Dono" ON public.transacoes;
DROP POLICY IF EXISTS "Edicao_Apenas_Dono" ON public.transacoes;
DROP POLICY IF EXISTS "Insercao_Apenas_Dono" ON public.transacoes;
DROP POLICY IF EXISTS "Leitura_Apenas_Dono" ON public.transacoes;
DROP POLICY IF EXISTS "Permitir alteracao para autenticados" ON public.transacoes;
DROP POLICY IF EXISTS "Permitir exclusao para autenticados" ON public.transacoes;
DROP POLICY IF EXISTS "Política de Atualização" ON public.transacoes;
DROP POLICY IF EXISTS "Política de Exclusão" ON public.transacoes;
DROP POLICY IF EXISTS "Política de Inserção" ON public.transacoes;
DROP POLICY IF EXISTS "Política de Leitura com Admin" ON public.transacoes;
DROP POLICY IF EXISTS "Usuários podem inserir suas próprias transações" ON public.transacoes;
DROP POLICY IF EXISTS "Usuários podem ver apenas suas próprias transações" ON public.transacoes;
DROP POLICY IF EXISTS "transacoes_select_policy" ON public.transacoes;
DROP POLICY IF EXISTS "transacoes_insert_policy" ON public.transacoes;
DROP POLICY IF EXISTS "transacoes_update_policy" ON public.transacoes;
DROP POLICY IF EXISTS "transacoes_delete_policy" ON public.transacoes;

DROP POLICY IF EXISTS "Permitir atualização compartilhada" ON public.gastos_compartilhados;
DROP POLICY IF EXISTS "Permitir exclusão compartilhada" ON public.gastos_compartilhados;
DROP POLICY IF EXISTS "Permitir inserção compartilhada" ON public.gastos_compartilhados;
DROP POLICY IF EXISTS "Permitir leitura compartilhada" ON public.gastos_compartilhados;
DROP POLICY IF EXISTS "gastos_compartilhados_select_policy" ON public.gastos_compartilhados;
DROP POLICY IF EXISTS "gastos_compartilhados_insert_policy" ON public.gastos_compartilhados;
DROP POLICY IF EXISTS "gastos_compartilhados_update_policy" ON public.gastos_compartilhados;
DROP POLICY IF EXISTS "gastos_compartilhados_delete_policy" ON public.gastos_compartilhados;

-- 3. Criar Políticas para public.transacoes
CREATE POLICY "transacoes_select_policy" ON public.transacoes
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "transacoes_insert_policy" ON public.transacoes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "transacoes_update_policy" ON public.transacoes
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "transacoes_delete_policy" ON public.transacoes
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 4. Criar Políticas para public.gastos_compartilhados
CREATE POLICY "gastos_compartilhados_select_policy" ON public.gastos_compartilhados
  FOR SELECT TO authenticated
  USING (created_by = (SELECT auth.uid()));

CREATE POLICY "gastos_compartilhados_insert_policy" ON public.gastos_compartilhados
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY "gastos_compartilhados_update_policy" ON public.gastos_compartilhados
  FOR UPDATE TO authenticated
  USING (created_by = (SELECT auth.uid()))
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY "gastos_compartilhados_delete_policy" ON public.gastos_compartilhados
  FOR DELETE TO authenticated
  USING (created_by = (SELECT auth.uid()));
```

---

## 6. Resultado da Validação Oficial

* **Políticas Ativas:** Exatamente 4 em `transacoes` e 4 em `gastos_compartilhados`.
* **Políticas Abertas Perigosas:** Nenhuma (0 encontradas).
* **Linter de Múltiplas Políticas (`multiple_permissive_policies`):** Resolvido ✅
* **Linter de Inicialização de Autenticação (`auth_rls_initplan`):** Resolvido ✅
* **Testes Funcionais em Navegador:** Concluídos com sucesso (login, leitura, inclusão, edição e exclusão operando normalmente).

---

## 7. Pendências Futuras (A Serem Avaliadas)

As seguintes melhorias devem ser planejadas em fases posteriores:
1. **Restrição `NOT NULL` em `transacoes.user_id`:**  
   Garantir no schema que nenhuma transação possa ser gravada sem um usuário proprietário.
2. **Restrição `NOT NULL` em `gastos_compartilhados.created_by`:**  
   Garantir no schema que nenhuma conta compartilhada possa ser gravada sem um autor.
3. **Criação de Índices em `user_id` e `created_by`:**  
   Adicionar índices B-Tree nas chaves estrangeiras para otimizar o tempo de busca em bases com milhares de registros.
4. **Manutenção do MCP Supabase em Modo Read-Only:**  
   Manter as ferramentas automatizadas configuradas para auditoria somente-leitura, exigindo aprovação manual para mudanças estruturais no banco.
