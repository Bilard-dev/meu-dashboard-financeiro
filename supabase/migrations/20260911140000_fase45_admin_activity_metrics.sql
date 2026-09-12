-- Migration: 20260911140000_fase45_admin_activity_metrics.sql
-- Descrição: Fase 4.5-C4.1-B — Métricas Administrativas de Atividade com Rigorosa Preservação de Privacidade
-- Inclui: public.admin_get_activity_metrics e public.admin_get_activity_summary

BEGIN;

-- ============================================================================
-- 1. RPC public.admin_get_activity_metrics
-- ============================================================================
-- Retorna métricas de atividade e engajamento por usuário.
-- PRIVACIDADE E SEGURANÇA:
-- - Proibido expor valores, descrições, categorias, contas, saldos ou linhas financeiras.
-- - Utiliza internamente apenas COUNT, MAX e EXISTS.
-- - operations_30d_band retorna faixas agregadas ('0', '1-5', '6-20', '20+').
-- - activity_level classifica contas approved ('ACTIVE', 'LOW_ACTIVITY', 'INACTIVE', 'NEVER').
CREATE OR REPLACE FUNCTION public.admin_get_activity_metrics()
RETURNS TABLE (
    user_id UUID,
    last_activity_at TIMESTAMPTZ,
    operations_30d_band TEXT,
    activity_level TEXT,
    uses_transactions BOOLEAN,
    uses_cards BOOLEAN,
    uses_investments BOOLEAN,
    uses_settlements BOOLEAN,
    uses_metas BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
BEGIN
    -- 1. Verificação rigorosa de autorização: apenas administradores confirmados
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores podem executar esta operação.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Retorno agregado seguro com subconsultas/CTEs
    RETURN QUERY
    WITH user_candidates AS (
        SELECT
            u.id AS uid,
            u.last_sign_in_at,
            p.access_status
        FROM auth.users u
        LEFT JOIN public.user_profiles p ON u.id = p.user_id
    ),
    raw_metrics AS (
        SELECT
            uc.uid,
            uc.access_status,
            -- Cálculo seguro de última atividade operacional (não contábil)
            GREATEST(
                uc.last_sign_in_at,
                (SELECT MAX(t.created_at) FROM public.transacoes t WHERE t.user_id = uc.uid),
                (SELECT GREATEST(MAX(l.created_at), MAX(l.updated_at)) FROM public.liquidacoes_credito l WHERE l.user_id = uc.uid),
                (SELECT GREATEST(MAX(m.created_at), MAX(m.updated_at)) FROM public.metas m WHERE m.user_id = uc.uid),
                (SELECT GREATEST(MAX(c.created_at), MAX(c.updated_at)) FROM public.app_cartoes c WHERE c.user_id = uc.uid)
            ) AS calc_last_activity_at,

            -- Contagem interna para cálculo de faixa nos últimos 30 dias
            (
                SELECT COUNT(*)::INTEGER
                FROM public.transacoes t
                WHERE t.user_id = uc.uid
                  AND t.created_at >= (now() - interval '30 days')
            ) AS calc_ops_30d,

            -- Flags booleanas usando SOMENTE EXISTS
            EXISTS (
                SELECT 1
                FROM public.transacoes t
                WHERE t.user_id = uc.uid
                  AND (t.tipo IS NULL OR t.tipo <> 'Investimento')
            ) AS calc_uses_transactions,

            (
                EXISTS (
                    SELECT 1
                    FROM public.transacoes t
                    WHERE t.user_id = uc.uid
                      AND (t.pagamento = 'Cartão de Crédito' OR (t.cartao IS NOT NULL AND t.cartao <> ''))
                )
                OR
                EXISTS (
                    SELECT 1
                    FROM public.app_cartoes c
                    WHERE c.user_id = uc.uid
                )
            ) AS calc_uses_cards,

            EXISTS (
                SELECT 1
                FROM public.transacoes t
                WHERE t.user_id = uc.uid
                  AND t.tipo = 'Investimento'
            ) AS calc_uses_investments,

            EXISTS (
                SELECT 1
                FROM public.liquidacoes_credito l
                WHERE l.user_id = uc.uid
            ) AS calc_uses_settlements,

            EXISTS (
                SELECT 1
                FROM public.metas m
                WHERE m.user_id = uc.uid
            ) AS calc_uses_metas
        FROM user_candidates uc
    )
    SELECT
        rm.uid AS user_id,
        rm.calc_last_activity_at AS last_activity_at,
        CASE
            WHEN rm.calc_ops_30d = 0 THEN '0'
            WHEN rm.calc_ops_30d BETWEEN 1 AND 5 THEN '1-5'
            WHEN rm.calc_ops_30d BETWEEN 6 AND 20 THEN '6-20'
            ELSE '20+'
        END AS operations_30d_band,
        CASE
            WHEN rm.calc_last_activity_at IS NULL THEN 'NEVER'
            WHEN rm.calc_last_activity_at >= (now() - interval '7 days') THEN 'ACTIVE'
            WHEN rm.calc_last_activity_at >= (now() - interval '30 days') THEN 'LOW_ACTIVITY'
            ELSE 'INACTIVE'
        END AS activity_level,
        rm.calc_uses_transactions AS uses_transactions,
        rm.calc_uses_cards AS uses_cards,
        rm.calc_uses_investments AS uses_investments,
        rm.calc_uses_settlements AS uses_settlements,
        rm.calc_uses_metas AS uses_metas
    FROM raw_metrics rm
    ORDER BY rm.uid ASC;
END;
$$;

COMMENT ON FUNCTION public.admin_get_activity_metrics() IS
'Retorna métricas agregadas de engajamento e atividade técnica por usuário para administradores, preservando estrita privacidade financeira.';

-- ============================================================================
-- 2. RPC public.admin_get_activity_summary
-- ============================================================================
-- Retorna os totais globais de uso e recursos do sistema.
-- Contagens agregadas de governança sem exposição individual.
CREATE OR REPLACE FUNCTION public.admin_get_activity_summary()
RETURNS TABLE (
    total_users BIGINT,
    active_7d BIGINT,
    active_30d BIGINT,
    inactive_30d BIGINT,
    pending_users BIGINT,
    approved_users BIGINT,
    suspended_users BIGINT,
    rejected_users BIGINT,
    users_using_transactions BIGINT,
    users_using_cards BIGINT,
    users_using_investments BIGINT,
    users_using_settlements BIGINT,
    users_using_metas BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
BEGIN
    -- 1. Verificação rigorosa de autorização: apenas administradores confirmados
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores podem executar esta operação.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Retorno com contagens globais exatas
    RETURN QUERY
    WITH user_status AS (
        SELECT
            u.id AS uid,
            u.last_sign_in_at,
            COALESCE(p.access_status, 'needs_profile') AS access_status
        FROM auth.users u
        LEFT JOIN public.user_profiles p ON u.id = p.user_id
    ),
    user_activity AS (
        SELECT
            us.uid,
            us.access_status,
            GREATEST(
                us.last_sign_in_at,
                (SELECT MAX(t.created_at) FROM public.transacoes t WHERE t.user_id = us.uid),
                (SELECT GREATEST(MAX(l.created_at), MAX(l.updated_at)) FROM public.liquidacoes_credito l WHERE l.user_id = us.uid),
                (SELECT GREATEST(MAX(m.created_at), MAX(m.updated_at)) FROM public.metas m WHERE m.user_id = us.uid),
                (SELECT GREATEST(MAX(c.created_at), MAX(c.updated_at)) FROM public.app_cartoes c WHERE c.user_id = us.uid)
            ) AS user_last_act,
            EXISTS (
                SELECT 1
                FROM public.transacoes t
                WHERE t.user_id = us.uid
                  AND (t.tipo IS NULL OR t.tipo <> 'Investimento')
            ) AS has_trans,
            (
                EXISTS (
                    SELECT 1
                    FROM public.transacoes t
                    WHERE t.user_id = us.uid
                      AND (t.pagamento = 'Cartão de Crédito' OR (t.cartao IS NOT NULL AND t.cartao <> ''))
                )
                OR
                EXISTS (
                    SELECT 1
                    FROM public.app_cartoes c
                    WHERE c.user_id = us.uid
                )
            ) AS has_cards,
            EXISTS (
                SELECT 1
                FROM public.transacoes t
                WHERE t.user_id = us.uid
                  AND t.tipo = 'Investimento'
            ) AS has_invest,
            EXISTS (
                SELECT 1
                FROM public.liquidacoes_credito l
                WHERE l.user_id = us.uid
            ) AS has_settle,
            EXISTS (
                SELECT 1
                FROM public.metas m
                WHERE m.user_id = us.uid
            ) AS has_meta
        FROM user_status us
    )
    SELECT
        COUNT(*)::BIGINT AS total_users,
        COUNT(*) FILTER (WHERE ua.user_last_act >= (now() - interval '7 days'))::BIGINT AS active_7d,
        COUNT(*) FILTER (WHERE ua.user_last_act >= (now() - interval '30 days'))::BIGINT AS active_30d,
        COUNT(*) FILTER (WHERE ua.user_last_act < (now() - interval '30 days'))::BIGINT AS inactive_30d,
        COUNT(*) FILTER (WHERE ua.access_status = 'pending')::BIGINT AS pending_users,
        COUNT(*) FILTER (WHERE ua.access_status = 'approved')::BIGINT AS approved_users,
        COUNT(*) FILTER (WHERE ua.access_status = 'suspended')::BIGINT AS suspended_users,
        COUNT(*) FILTER (WHERE ua.access_status = 'rejected')::BIGINT AS rejected_users,
        COUNT(*) FILTER (WHERE ua.has_trans)::BIGINT AS users_using_transactions,
        COUNT(*) FILTER (WHERE ua.has_cards)::BIGINT AS users_using_cards,
        COUNT(*) FILTER (WHERE ua.has_invest)::BIGINT AS users_using_investments,
        COUNT(*) FILTER (WHERE ua.has_settle)::BIGINT AS users_using_settlements,
        COUNT(*) FILTER (WHERE ua.has_meta)::BIGINT AS users_using_metas
    FROM user_activity ua;
END;
$$;

COMMENT ON FUNCTION public.admin_get_activity_summary() IS
'Retorna o resumo global de engajamento, status e adoção de funcionalidades para administradores.';

-- ============================================================================
-- 3. Governança de Privilégios (Princípio do Menor Privilégio)
-- ============================================================================
REVOKE ALL ON FUNCTION public.admin_get_activity_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_activity_metrics() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_get_activity_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_activity_summary() TO authenticated;

COMMIT;
