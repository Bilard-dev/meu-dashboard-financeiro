-- Migration: 20260916120000_fase5b_security_hardening.sql
-- Descrição: Fase 5-B — Security Hardening Final
--   - M-01: Fix de search_path fixo em triggers de liquidações de crédito
--   - M-02 / Etapa 1: Hardening de privilégios de execução em funções internas (admin_purge_expired_user_resets)
--   - Governança estrita: Preserva privilégios de RPCs autenticadas legítimas (Classe A e Classe B com is_admin server-side)

BEGIN;

-- ============================================================================
-- 1. CORREÇÃO DE SEARCH_PATH EM TRIGGERS (M-01)
-- ============================================================================

-- 1.1 Trigger de atualização de updated_at para liquidacoes_credito
CREATE OR REPLACE FUNCTION public.handle_liquidacoes_credito_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_liquidacoes_credito_updated_at() IS
'Trigger function para atualização automática de updated_at em liquidacoes_credito (search_path fixado para segurança).';

-- 1.2 Trigger de validação e sincronização de coerência transacao_id <-> grupo_parcela_id
CREATE OR REPLACE FUNCTION public.handle_liquidacoes_credito_validate_coherence()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_tx_user_id UUID;
    v_tx_grupo_id UUID;
BEGIN
    -- Busca os metadados da transação física vinculada
    SELECT user_id, grupo_parcela_id INTO v_tx_user_id, v_tx_grupo_id
    FROM public.transacoes
    WHERE id = NEW.transacao_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transação referenciada não existe: %', NEW.transacao_id;
    END IF;

    -- Validação de Ownership: a transação DEVE pertencer ao mesmo user_id
    IF v_tx_user_id <> NEW.user_id THEN
        RAISE EXCEPTION 'Inconsistência de propriedade: a transação % pertence a outro usuário.', NEW.transacao_id;
    END IF;

    -- Validação e Sincronização de Coerência de Grupo
    IF v_tx_grupo_id IS NOT NULL THEN
        -- Transação é parte de um parcelamento 2.0
        IF NEW.grupo_parcela_id IS NOT NULL AND NEW.grupo_parcela_id <> v_tx_grupo_id THEN
            RAISE EXCEPTION 'Incoerência de grupo: transação % pertence ao grupo %, mas a liquidação informou grupo %.',
                NEW.transacao_id, v_tx_grupo_id, NEW.grupo_parcela_id;
        END IF;
        -- Garante que grupo_parcela_id fique preenchido com a identidade canônica do grupo
        NEW.grupo_parcela_id := v_tx_grupo_id;
    ELSE
        -- Transação é compra à vista / avulsa (sem grupo)
        IF NEW.grupo_parcela_id IS NOT NULL THEN
            RAISE EXCEPTION 'Incoerência de grupo: transação % é à vista/avulsa (sem grupo), mas a liquidação informou grupo %.',
                NEW.transacao_id, NEW.grupo_parcela_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_liquidacoes_credito_validate_coherence() IS
'Validação estrita de coerência e integridade referencial para liquidações antecipadas (search_path fixado para segurança).';

-- ============================================================================
-- 2. HARDENING DE PRIVILÉGIOS DE EXECUÇÃO (M-02 / ETAPA 1 E 3)
-- ============================================================================
-- Classificação de Governança das 19 Funções SECURITY DEFINER:
-- - Classe A (RPCs Autenticadas de Usuário Comum): EXECUTE concedido a authenticated mantido
--   (cancelar_agendamento_ocorrencia, confirmar_agendamento_ocorrencia, complete_legacy_profile,
--    has_app_access, is_admin, merge_cards, merge_categories, merge_subcategories, merge_tags)
-- - Classe B (RPCs Autenticadas Administrativas): EXECUTE concedido a authenticated mantido,
--   com proteção server-side estrita via IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso negado'
--   (admin_get_activity_metrics, admin_get_activity_summary, admin_get_user_reset_status,
--    admin_list_users, admin_log_password_reset_request, admin_prepare_user_deletion,
--    admin_reset_user_data, admin_restore_user_data, admin_set_user_access)
-- - Classe C (Rotinas Internas de Manutenção / Não chamadas via Client API):
--   Revogação de EXECUTE de PUBLIC, anon e authenticated; restrição a postgres e service_role.
--   A invocação ocorre internamente a partir de RPCs SECURITY DEFINER autorizadas (ex: admin_reset_user_data).

REVOKE ALL ON FUNCTION public.admin_purge_expired_user_resets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_expired_user_resets() TO postgres, service_role;

COMMENT ON FUNCTION public.admin_purge_expired_user_resets() IS
'Rotina interna de manutenção de expiração de snapshots de reset. Acesso restrito a postgres/service_role; invocado internamente por RPCs administrativas.';

COMMIT;
