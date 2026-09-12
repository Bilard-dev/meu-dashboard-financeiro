-- Migration: 20260912100000_fase45_admin_account_deletion.sql
-- Descrição: Fase 4.5-C5-E.1 — Correção de Consistência e Atomicidade na Exclusão Permanente de Conta
-- ATENÇÃO: NÃO APLICAR REMOTAMENTE AINDA (Criada apenas localmente para governança e sincronização posterior)

BEGIN;

-- ============================================================================
-- 1. Atualização do CHECK constraint em public.admin_audit_logs
-- ============================================================================
-- Permite registrar a ação imutável 'USER_ACCOUNT_DELETED' na trilha de auditoria administrativa
ALTER TABLE public.admin_audit_logs 
DROP CONSTRAINT IF EXISTS admin_audit_logs_action_check;

ALTER TABLE public.admin_audit_logs 
ADD CONSTRAINT admin_audit_logs_action_check 
CHECK (action IN (
    'USER_DATA_RESET', 
    'USER_DATA_RESTORED', 
    'USER_DATA_PURGED', 
    'PASSWORD_RESET_REQUESTED', 
    'USER_ACCOUNT_DELETED'
));

-- ============================================================================
-- 2. Atualização Estrutural da FK app_subcategorias -> app_categorias
-- ============================================================================
-- MOTIVAÇÃO ARQUITETURAL (Fase 4.5-C5-E.1):
-- Anteriormente, app_subcategorias.categoria_id possuía ON DELETE RESTRICT, enquanto ambas
-- as tabelas possuíam user_id REFERENCES auth.users(id) ON DELETE CASCADE.
-- Em deleções diretas a partir de auth.users, o PostgreSQL dispara triggers em ordem interna;
-- se app_categorias fosse processada antes de app_subcategorias, o RESTRICT abortava a deleção.
-- Com ON DELETE CASCADE na relação categoria_id, a exclusão canônica direta em auth.users
-- propaga原子icamente e de forma limpa por todas as tabelas dependentes, eliminando a
-- necessidade de apagar previamente dados via RPC e prevenindo estados inconsistentes parciais.
ALTER TABLE public.app_subcategorias
DROP CONSTRAINT IF EXISTS app_subcategorias_categoria_id_fkey;

ALTER TABLE public.app_subcategorias
ADD CONSTRAINT app_subcategorias_categoria_id_fkey
FOREIGN KEY (categoria_id) REFERENCES public.app_categorias(id)
ON DELETE CASCADE;

-- ============================================================================
-- 3. RPC administrativa de PREPARAÇÃO e VALIDAÇÃO (Somente Leitura / Não Destrutiva)
-- ============================================================================
-- Realiza a validação prévia de autorização, bloqueia auto-exclusão e contas de admin,
-- e recupera a identidade mínima confiável (target_user_id, target_email, display_name)
-- DIRETAMENTE no banco de dados, SEM APAGAR DADOS e SEM REGISTRAR AUDITORIA PREMATURA.
-- A exclusão canônica é postergada para o Auth Admin deleteUser na Edge Function.
CREATE OR REPLACE FUNCTION public.admin_prepare_user_deletion(
    p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_admin_id UUID;
    v_target_email TEXT;
    v_target_display_name TEXT;
BEGIN
    v_admin_id := auth.uid();

    -- 1. Validação estrita de privilégios de administrador
    IF v_admin_id IS NULL OR NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores podem executar esta operação.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validação de parâmetro obrigatório
    IF p_target_user_id IS NULL THEN
        RAISE EXCEPTION 'Identificador do usuário é obrigatório.'
            USING ERRCODE = '23502';
    END IF;

    -- 3. Bloqueio estrito de auto-exclusão do próprio administrador
    IF p_target_user_id = v_admin_id THEN
        RAISE EXCEPTION 'Operação não permitida sobre a própria conta de administrador.'
            USING ERRCODE = '42501';
    END IF;

    -- 4. Bloqueio estrito de exclusão de outras contas de administração
    IF EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_target_user_id) THEN
        RAISE EXCEPTION 'Operação não permitida sobre contas de administração.'
            USING ERRCODE = '42501';
    END IF;

    -- 5. Busca e validação dos dados identificadores reais no banco de dados
    SELECT u.email::TEXT INTO v_target_email 
    FROM auth.users u 
    WHERE u.id = p_target_user_id;

    SELECT p.display_name INTO v_target_display_name
    FROM public.user_profiles p
    WHERE p.user_id = p_target_user_id;

    IF v_target_email IS NULL AND v_target_display_name IS NULL THEN
        RAISE EXCEPTION 'Usuário não encontrado na base de dados.'
            USING ERRCODE = 'P0002';
    END IF;

    -- REGRA DE OURO (Fase 4.5-C5-E.1):
    -- NENHUM dado financeiro ou perfil é excluído nesta etapa.
    -- NENHUM registro de USER_ACCOUNT_DELETED é inserido antes da confirmação do Auth Admin.
    -- Os dados são preservados para que, caso a exclusão Auth falhe, nenhum dado seja perdido.

    RETURN jsonb_build_object(
        'target_user_id', p_target_user_id,
        'target_email', COALESCE(v_target_email, 'sem-email@removido.local'),
        'display_name', v_target_display_name
    );
END;
$$;

COMMENT ON FUNCTION public.admin_prepare_user_deletion(UUID) IS 
'Valida autorização, impede auto-exclusão e alvos admin, e extrai identidade mínima do usuário para exclusão canônica sem apagar dados antecipadamente.';

REVOKE ALL ON FUNCTION public.admin_prepare_user_deletion(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prepare_user_deletion(UUID) TO authenticated;

COMMIT;
