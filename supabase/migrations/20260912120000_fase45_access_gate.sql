-- Migration: 20260912120000_fase45_access_gate.sql
-- Descrição: Fase 4.5-C5-F — Gate Definitivo de Acesso RLS nas Tabelas Financeiras & Legado
-- ATENÇÃO: NÃO APLICAR REMOTAMENTE AINDA (Criada apenas localmente para governança e revisão posterior)

BEGIN;

-- ============================================================================
-- 0. HARDENING DA FUNÇÃO public.has_app_access() (Fase 4.5-C5-F.1)
-- ============================================================================
-- Atualiza o search_path para 'pg_catalog, public, auth' eliminando pg_temp e
-- garantindo a resolução estrita e segura de operadores e tipos internos.
-- Preserva com 100% de exatidão a regra de autorização:
-- (1) auth.uid() não nulo;
-- (2) Administrador => true (sem autolock);
-- (3) Usuário comum => true somente se access_status = 'approved';
-- (4) Pendente / rejeitado / suspenso / legado sem perfil => false.
CREATE OR REPLACE FUNCTION public.has_app_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
    SELECT (
        COALESCE(auth.uid() IS NOT NULL, false)
        AND (
            public.is_admin()
            OR EXISTS (
                SELECT 1
                FROM public.user_profiles
                WHERE user_id = auth.uid()
                  AND access_status = 'approved'
            )
        )
    );
$$;

COMMENT ON FUNCTION public.has_app_access() IS
'Verifica se o usuário possui acesso ativo ao sistema (admin ou status approved). Hardened search_path = pg_catalog, public, auth.';

REVOKE ALL ON FUNCTION public.has_app_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_app_access() TO authenticated;

-- ============================================================================
-- 1. TABELA public.transacoes
-- ============================================================================
-- Aplica o gate public.has_app_access() em conjunto com o isolamento tenant estrito.
-- Administradores possuem has_app_access() = true, mas NÃO recebem bypass para
-- acessar transações de outros usuários (auth.uid() = user_id continua obrigatório).

DROP POLICY IF EXISTS "transacoes_select_policy" ON public.transacoes;
DROP POLICY IF EXISTS "transacoes_insert_policy" ON public.transacoes;
DROP POLICY IF EXISTS "transacoes_update_policy" ON public.transacoes;
DROP POLICY IF EXISTS "transacoes_delete_policy" ON public.transacoes;

CREATE POLICY "transacoes_select_policy" ON public.transacoes
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "transacoes_insert_policy" ON public.transacoes
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "transacoes_update_policy" ON public.transacoes
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access())
    WITH CHECK (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "transacoes_delete_policy" ON public.transacoes
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access());

-- ============================================================================
-- 2. TABELA public.liquidacoes_credito
-- ============================================================================
-- Preserva validações relacionais estritas de transacao_id e grupo_parcela_id,
-- adicionando o gate public.has_app_access() no SELECT, INSERT e UPDATE.

DROP POLICY IF EXISTS "liquidacoes_credito_select_policy" ON public.liquidacoes_credito;
DROP POLICY IF EXISTS "liquidacoes_credito_insert_policy" ON public.liquidacoes_credito;
DROP POLICY IF EXISTS "liquidacoes_credito_update_policy" ON public.liquidacoes_credito;

CREATE POLICY "liquidacoes_credito_select_policy" ON public.liquidacoes_credito
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "liquidacoes_credito_insert_policy" ON public.liquidacoes_credito
    FOR INSERT TO authenticated
    WITH CHECK (
        (user_id = auth.uid())
        AND public.has_app_access()
        AND (EXISTS (
            SELECT 1 FROM public.transacoes t
            WHERE t.id = liquidacoes_credito.transacao_id
              AND t.user_id = auth.uid()
              AND (
                  liquidacoes_credito.grupo_parcela_id IS NULL
                  OR (liquidacoes_credito.grupo_parcela_id IS NOT NULL AND t.grupo_parcela_id = liquidacoes_credito.grupo_parcela_id)
              )
        ))
    );

CREATE POLICY "liquidacoes_credito_update_policy" ON public.liquidacoes_credito
    FOR UPDATE TO authenticated
    USING (
        (user_id = auth.uid())
        AND public.has_app_access()
        AND (EXISTS (
            SELECT 1 FROM public.transacoes t
            WHERE t.id = liquidacoes_credito.transacao_id
              AND t.user_id = auth.uid()
        ))
    )
    WITH CHECK (
        (user_id = auth.uid())
        AND public.has_app_access()
        AND (EXISTS (
            SELECT 1 FROM public.transacoes t
            WHERE t.id = liquidacoes_credito.transacao_id
              AND t.user_id = auth.uid()
              AND (
                  (liquidacoes_credito.grupo_parcela_id IS NULL AND t.grupo_parcela_id IS NULL)
                  OR (liquidacoes_credito.grupo_parcela_id IS NOT NULL AND t.grupo_parcela_id = liquidacoes_credito.grupo_parcela_id)
              )
        ))
    );

-- ============================================================================
-- 3. TABELA public.app_categorias
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own categories" ON public.app_categorias;
DROP POLICY IF EXISTS "Users can insert their own categories" ON public.app_categorias;
DROP POLICY IF EXISTS "Users can update their own categories" ON public.app_categorias;
DROP POLICY IF EXISTS "Users can delete their own categories" ON public.app_categorias;

CREATE POLICY "Users can view their own categories" ON public.app_categorias
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "Users can insert their own categories" ON public.app_categorias
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "Users can update their own categories" ON public.app_categorias
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access())
    WITH CHECK (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "Users can delete their own categories" ON public.app_categorias
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access());

-- ============================================================================
-- 4. TABELA public.app_subcategorias
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own subcategories" ON public.app_subcategorias;
DROP POLICY IF EXISTS "Users can insert their own subcategories" ON public.app_subcategorias;
DROP POLICY IF EXISTS "Users can update their own subcategories" ON public.app_subcategorias;
DROP POLICY IF EXISTS "Users can delete their own subcategories" ON public.app_subcategorias;

CREATE POLICY "Users can view their own subcategories" ON public.app_subcategorias
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "Users can insert their own subcategories" ON public.app_subcategorias
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "Users can update their own subcategories" ON public.app_subcategorias
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access())
    WITH CHECK (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "Users can delete their own subcategories" ON public.app_subcategorias
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access());

-- ============================================================================
-- 5. TABELA public.app_cartoes
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own cards" ON public.app_cartoes;
DROP POLICY IF EXISTS "Users can insert their own cards" ON public.app_cartoes;
DROP POLICY IF EXISTS "Users can update their own cards" ON public.app_cartoes;
DROP POLICY IF EXISTS "Users can delete their own cards" ON public.app_cartoes;

CREATE POLICY "Users can view their own cards" ON public.app_cartoes
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "Users can insert their own cards" ON public.app_cartoes
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "Users can update their own cards" ON public.app_cartoes
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access())
    WITH CHECK (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "Users can delete their own cards" ON public.app_cartoes
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access());

-- ============================================================================
-- 6. TABELA public.app_tags
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own tags" ON public.app_tags;
DROP POLICY IF EXISTS "Users can insert their own tags" ON public.app_tags;
DROP POLICY IF EXISTS "Users can update their own tags" ON public.app_tags;
DROP POLICY IF EXISTS "Users can delete their own tags" ON public.app_tags;

CREATE POLICY "Users can view their own tags" ON public.app_tags
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "Users can insert their own tags" ON public.app_tags
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "Users can update their own tags" ON public.app_tags
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access())
    WITH CHECK (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "Users can delete their own tags" ON public.app_tags
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access());

-- ============================================================================
-- 7. TABELA public.metas
-- ============================================================================

DROP POLICY IF EXISTS "metas_select_policy" ON public.metas;
DROP POLICY IF EXISTS "metas_insert_policy" ON public.metas;
DROP POLICY IF EXISTS "metas_update_policy" ON public.metas;
DROP POLICY IF EXISTS "metas_delete_policy" ON public.metas;

CREATE POLICY "metas_select_policy" ON public.metas
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "metas_insert_policy" ON public.metas
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "metas_update_policy" ON public.metas
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access())
    WITH CHECK (user_id = auth.uid() AND public.has_app_access());

CREATE POLICY "metas_delete_policy" ON public.metas
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access());

COMMIT;
