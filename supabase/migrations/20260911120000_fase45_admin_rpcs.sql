-- Migration: 20260911120000_fase45_admin_rpcs.sql
-- Descrição: Fase 4.5-C3 / 4.5-C3.1 — RPCs Administrativas Seguras para a Central Administrativa
-- Inclui: public.admin_list_users e public.admin_set_user_access

BEGIN;

-- ============================================================================
-- 1. RPC public.admin_list_users
-- ============================================================================
-- Permite que administradores listem usuários de forma controlada e auditada,
-- sem expor credenciais, tokens, senhas ou dados financeiros.
-- Retorna 'needs_profile' para usuários legados que ainda não possuem perfil preenchido.
CREATE OR REPLACE FUNCTION public.admin_list_users(
    p_search TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    user_id UUID,
    display_name TEXT,
    email TEXT,
    signup_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ,
    access_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
DECLARE
    v_clean_search TEXT;
    v_clean_status TEXT;
    v_safe_limit INTEGER;
    v_safe_offset INTEGER;
BEGIN
    -- 1. Verificação rigorosa de autorização: apenas administradores ativos
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores podem executar esta operação.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Sanitização e validação estrita de parâmetros
    v_clean_search := NULLIF(trim(p_search), '');
    v_clean_status := NULLIF(trim(p_status), '');

    IF v_clean_status IS NOT NULL AND v_clean_status NOT IN ('needs_profile', 'pending', 'approved', 'rejected', 'suspended') THEN
        RAISE EXCEPTION 'Status de filtro inválido (%). Valores permitidos: needs_profile, pending, approved, rejected, suspended.', v_clean_status
            USING ERRCODE = '22023';
    END IF;

    v_safe_limit   := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
    v_safe_offset  := GREATEST(COALESCE(p_offset, 0), 0);

    -- 3. Retorno projetado com junção segura entre auth.users e public.user_profiles
    RETURN QUERY
    SELECT
        u.id AS user_id,
        p.display_name AS display_name,
        u.email::TEXT AS email,
        u.created_at AS signup_at,
        u.last_sign_in_at AS last_sign_in_at,
        COALESCE(p.access_status, 'needs_profile') AS access_status
    FROM auth.users u
    LEFT JOIN public.user_profiles p ON u.id = p.user_id
    WHERE
        -- Filtro de busca textual (display_name ou email)
        (
            v_clean_search IS NULL
            OR (p.display_name ILIKE ('%' || v_clean_search || '%'))
            OR (u.email ILIKE ('%' || v_clean_search || '%'))
        )
        AND
        -- Filtro por status de acesso
        (
            v_clean_status IS NULL
            OR (v_clean_status = 'needs_profile' AND p.user_id IS NULL)
            OR (v_clean_status <> 'needs_profile' AND p.access_status = v_clean_status)
        )
    ORDER BY u.created_at DESC
    LIMIT v_safe_limit
    OFFSET v_safe_offset;
END;
$$;

COMMENT ON FUNCTION public.admin_list_users(TEXT, TEXT, INTEGER, INTEGER) IS 
'Lista usuários com projeção restrita de auditoria para administradores. Retorna needs_profile para legados sem perfil.';

-- ============================================================================
-- 2. RPC public.admin_set_user_access
-- ============================================================================
-- Permite que administradores aprovem, rejeitem ou suspendam o acesso de um usuário.
-- Regras de Segurança:
-- - Alvo não pode ser administrador em public.admin_users (protege contas de governança).
-- - Alvo deve existir em auth.users.
-- - Alvo deve possuir registro em public.user_profiles (usuário legado deve informar nome antes).
-- - Auditoria gravada automaticamente via auth.uid() e now().
CREATE OR REPLACE FUNCTION public.admin_set_user_access(
    p_user_id UUID,
    p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_clean_status TEXT;
    v_target_has_profile BOOLEAN;
BEGIN
    v_admin_id := auth.uid();

    -- 1. Verificação de autenticação e papel de administrador
    IF v_admin_id IS NULL OR NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores podem executar esta operação.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validação dos parâmetros obrigatórios
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'O identificador do usuário (p_user_id) é obrigatório.'
            USING ERRCODE = '23502';
    END IF;

    v_clean_status := trim(COALESCE(p_new_status, ''));
    IF v_clean_status NOT IN ('approved', 'rejected', 'suspended') THEN
        RAISE EXCEPTION 'Status de acesso inválido (%). Valores permitidos: approved, rejected, suspended.'
            , v_clean_status
            USING ERRCODE = '22023';
    END IF;

    -- 3. Proteção contra modificação de contas de administradores
    IF EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_user_id) THEN
        RAISE EXCEPTION 'Operação não permitida. O status de administradores não pode ser alterado por esta via.'
            USING ERRCODE = '42501';
    END IF;

    -- 4. Verificação de existência em auth.users
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'Usuário não encontrado.'
            USING ERRCODE = 'P0002';
    END IF;

    -- 5. Verificação de existência em public.user_profiles
    SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = p_user_id)
    INTO v_target_has_profile;

    IF NOT v_target_has_profile THEN
        RAISE EXCEPTION 'Usuário legado não possui perfil cadastrado. O usuário deve informar seu nome antes de ter o status alterado.'
            USING ERRCODE = '55000';
    END IF;

    -- 6. Aplicação da transição de status com auditoria
    IF v_clean_status = 'approved' THEN
        UPDATE public.user_profiles
        SET
            access_status = 'approved',
            approved_at   = now(),
            approved_by   = v_admin_id
        WHERE user_id = p_user_id;

    ELSIF v_clean_status = 'rejected' THEN
        UPDATE public.user_profiles
        SET
            access_status = 'rejected',
            approved_at   = NULL,
            approved_by   = NULL
        WHERE user_id = p_user_id;

    ELSIF v_clean_status = 'suspended' THEN
        -- Ao suspender, preservamos approved_at e approved_by como histórico da aprovação anterior
        UPDATE public.user_profiles
        SET
            access_status = 'suspended'
        WHERE user_id = p_user_id;
    END IF;

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_set_user_access(UUID, TEXT) IS 
'Altera o status de acesso de um usuário (approved, rejected, suspended) com auditoria. Protege contas admin.';

-- ============================================================================
-- 3. Governança de Privilégios (Princípio do Menor Privilégio)
-- ============================================================================
REVOKE ALL ON FUNCTION public.admin_list_users(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_user_access(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_access(UUID, TEXT) TO authenticated;

COMMIT;
