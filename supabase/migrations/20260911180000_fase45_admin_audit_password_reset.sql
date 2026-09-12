-- Migration: 20260911180000_fase45_admin_audit_password_reset.sql
-- Descrição: Fase 4.5-C5-C — Adição da ação PASSWORD_RESET_REQUESTED na auditoria administrativa
-- ATENÇÃO: NÃO APLICAR REMOTAMENTE AINDA (Criada apenas localmente para governança)

BEGIN;

-- 1. Atualização do CHECK constraint em public.admin_audit_logs para aceitar PASSWORD_RESET_REQUESTED
ALTER TABLE public.admin_audit_logs 
DROP CONSTRAINT IF EXISTS admin_audit_logs_action_check;

ALTER TABLE public.admin_audit_logs 
ADD CONSTRAINT admin_audit_logs_action_check 
CHECK (action IN ('USER_DATA_RESET', 'USER_DATA_RESTORED', 'USER_DATA_PURGED', 'PASSWORD_RESET_REQUESTED'));

-- 2. RPC administrativa para registrar auditoria de redefinição de senha com segurança
CREATE OR REPLACE FUNCTION public.admin_log_password_reset_request(
    p_target_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_admin_id UUID;
    v_target_email TEXT;
BEGIN
    v_admin_id := auth.uid();

    -- Validação de autorização de admin
    IF v_admin_id IS NULL OR NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores podem executar esta operação.'
            USING ERRCODE = '42501';
    END IF;

    -- Validação de parâmetros obrigatórios
    IF p_target_user_id IS NULL THEN
        RAISE EXCEPTION 'Identificador do usuário é obrigatório.'
            USING ERRCODE = '23502';
    END IF;

    -- Bloqueio contra auto-registro ou contas administrativas
    IF p_target_user_id = v_admin_id THEN
        RAISE EXCEPTION 'Operação não permitida sobre a própria conta de administrador.'
            USING ERRCODE = '42501';
    END IF;

    IF EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_target_user_id) THEN
        RAISE EXCEPTION 'Operação não permitida sobre contas de administração.'
            USING ERRCODE = '42501';
    END IF;

    -- Busca o e-mail real do usuário diretamente na tabela auth.users
    SELECT email INTO v_target_email 
    FROM auth.users 
    WHERE id = p_target_user_id;

    IF v_target_email IS NULL THEN
        RAISE EXCEPTION 'Usuário não encontrado na base de autenticação.'
            USING ERRCODE = '22023';
    END IF;

    -- Inserção de auditoria sem valores financeiros ou credenciais
    INSERT INTO public.admin_audit_logs (
        admin_user_id,
        target_user_id,
        target_email,
        action,
        metadata
    ) VALUES (
        v_admin_id,
        p_target_user_id,
        v_target_email,
        'PASSWORD_RESET_REQUESTED',
        jsonb_build_object(
            'requested_at', clock_timestamp()
        )
    );

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_log_password_reset_request(UUID) IS 
'Registra a solicitação de envio de link de recuperação de senha disparada pelo administrador com proteção contra auto-reset e admin targets, obtendo o e-mail real de auth.users.';

REVOKE ALL ON FUNCTION public.admin_log_password_reset_request(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_log_password_reset_request(UUID) TO authenticated;

COMMIT;
