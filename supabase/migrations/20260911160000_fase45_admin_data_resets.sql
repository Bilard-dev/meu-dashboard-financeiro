-- Migration: 20260911160000_fase45_admin_data_resets.sql
-- Descrição: Fase 4.5-C5-B / C5-B.1 — Reset Reversível (48h), Desfazer Reset, Purge Lógico e Auditoria Administrativa
-- Hardening C5-B.1:
--   - search_path endurecido: 'pg_catalog, public, auth' (elimina pg_temp, catalogo prioritário)
--   - Concorrência de Purge: FOR UPDATE SKIP LOCKED + verificação atômica sob lock
--   - Garantia de Purge Único: log de auditoria disparado estritamente se UPDATE encontrar a linha
--   - Purge interno sem botão de UI: acionado automaticamente em operações administrativas (ex: admin_get_user_reset_status)
--   - Imunidade de Restored: reset restaurado jamais vira purged
--   - Restauração Fail-Closed: valida expires_at > clock_timestamp() e ausência de novos dados nas 7 tabelas
--   - Metadata controlada: sem parâmetros externos de metadata, sem dados financeiros, sem credenciais
--   - Blindagem total de RLS: tabelas inacessíveis a SELECT direto de clientes comuns

BEGIN;

-- ============================================================================
-- 1. TABELA public.user_data_resets
-- ============================================================================
-- Armazena o snapshot transitório JSONB dos dados financeiros de usuários resetados.
-- Prazo rígido de recuperação de 48 horas (expires_at = created_at + 48h).
-- Totalmente inacessível via clientes diretos (RLS habilitado sem policies públicas).
CREATE TABLE IF NOT EXISTS public.user_data_resets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    snapshot JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'restored', 'purged')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours'),
    restored_at TIMESTAMPTZ,
    purged_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.user_data_resets IS 
'Armazena snapshots transitórios de dados para recuperação em até 48 horas após reset de aplicativo.';

-- Índices operacionais
CREATE INDEX IF NOT EXISTS idx_user_data_resets_user_id ON public.user_data_resets (user_id);
CREATE INDEX IF NOT EXISTS idx_user_data_resets_expires_at ON public.user_data_resets (expires_at) WHERE (status = 'active');

-- ÍNDICE PARCIAL UNIQUE CRÍTICO: Garante no banco que existe NO MÁXIMO UM reset 'active' por usuário
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_data_resets_one_active_per_user 
ON public.user_data_resets (user_id) 
WHERE (status = 'active');

-- RLS ativado (Fail-Closed: nenhum SELECT/INSERT/UPDATE/DELETE direto para clientes anon ou authenticated)
ALTER TABLE public.user_data_resets ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 2. TABELA public.admin_audit_logs
-- ============================================================================
-- Trilha de auditoria administrativa mínima e perene.
-- target_user_id não utiliza ON DELETE CASCADE para não perder o log se o usuário for excluído futuramente.
-- Não contém valores financeiros nem credenciais/tokens de segurança.
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    target_user_id UUID,
    target_email TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('USER_DATA_RESET', 'USER_DATA_RESTORED', 'USER_DATA_PURGED')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_audit_logs IS 
'Trilha de auditoria imutável de ações administrativas sensíveis no sistema.';

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_user ON public.admin_audit_logs (target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON public.admin_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs (created_at DESC);

-- RLS ativado
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 3. ROTINA INTERNA ADMINISTRATIVA public.admin_purge_expired_user_resets
-- ============================================================================
-- Elimina o conteúdo lógico recuperável de snapshots cujo expires_at <= clock_timestamp().
-- Destrói o payload (snapshot = {}), atualiza status para 'purged' e grava auditoria única.
-- Concorrência: utiliza FOR UPDATE SKIP LOCKED para evitar contenção e logs duplicados.
CREATE OR REPLACE FUNCTION public.admin_purge_expired_user_resets()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_admin_id UUID;
    v_purged_count INTEGER := 0;
    v_record RECORD;
BEGIN
    v_admin_id := auth.uid();

    -- 1. Verificação de autorização: apenas administradores confirmados
    IF v_admin_id IS NULL OR NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores podem executar esta operação.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Concorrência: FOR UPDATE SKIP LOCKED
    -- Ignora linhas já travadas por outros processos de restore ou de purge
    FOR v_record IN
        SELECT r.id, r.user_id, u.email::TEXT AS email
        FROM public.user_data_resets r
        LEFT JOIN auth.users u ON u.id = r.user_id
        WHERE r.status = 'active'
          AND r.expires_at <= clock_timestamp()
        FOR UPDATE OF r SKIP LOCKED
    LOOP
        -- Atualiza o registro sob lock garantindo atomicidade estrita
        UPDATE public.user_data_resets
        SET
            status = 'purged',
            snapshot = '{}'::jsonb,
            purged_at = clock_timestamp()
        WHERE id = v_record.id
          AND status = 'active'
          AND expires_at <= clock_timestamp();

        -- Grava auditoria EXATAMENTE uma vez por reset purgado com sucesso
        IF FOUND THEN
            INSERT INTO public.admin_audit_logs (
                admin_user_id,
                target_user_id,
                target_email,
                action,
                metadata
            ) VALUES (
                v_admin_id,
                v_record.user_id,
                COALESCE(v_record.email, 'unknown'),
                'USER_DATA_PURGED',
                jsonb_build_object(
                    'reset_id', v_record.id,
                    'purged_at', clock_timestamp()
                )
            );

            v_purged_count := v_purged_count + 1;
        END IF;
    END LOOP;

    RETURN v_purged_count;
END;
$$;

COMMENT ON FUNCTION public.admin_purge_expired_user_resets() IS 
'Rotina interna de manutenção: executa purge lógico definitivo de snapshots expirados, garantindo auditoria única e proteção concorrente.';


-- ============================================================================
-- 4. RPC public.admin_reset_user_data
-- ============================================================================
-- Captura o snapshot das 7 tabelas financeiras em JSONB e apaga os dados ativos
-- em ordem topológica segura na mesma transação atômica.
-- Protege administradores contra auto-reset ou reset de outras contas administrativas.
-- Retorna estritamente: reset_id, created_at, expires_at (NUNCA expõe o snapshot).
CREATE OR REPLACE FUNCTION public.admin_reset_user_data(
    p_target_user_id UUID
)
RETURNS TABLE (
    reset_id UUID,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_admin_id UUID;
    v_target_email TEXT;
    v_snapshot JSONB;
    v_item_count INTEGER;
    v_reset_id UUID;
    v_created_at TIMESTAMPTZ;
    v_expires_at TIMESTAMPTZ;
BEGIN
    v_admin_id := auth.uid();

    -- 1. Verificação rigorosa de autorização: apenas administradores confirmados
    IF v_admin_id IS NULL OR NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores podem executar esta operação.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validação do parâmetro obrigatório
    IF p_target_user_id IS NULL THEN
        RAISE EXCEPTION 'O identificador do usuário (p_target_user_id) é obrigatório.'
            USING ERRCODE = '23502';
    END IF;

    -- 3. Proteção estrita do próprio administrador (bloqueio de auto-reset)
    IF p_target_user_id = v_admin_id THEN
        RAISE EXCEPTION 'Operação não permitida sobre a própria conta de administrador.'
            USING ERRCODE = '42501';
    END IF;

    -- 4. Proteção estrita de qualquer conta em public.admin_users
    IF EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_target_user_id) THEN
        RAISE EXCEPTION 'Operação não permitida sobre contas de administração.'
            USING ERRCODE = '42501';
    END IF;

    -- 5. Manutenção lazy prévia de eventuais snapshots expirados
    PERFORM public.admin_purge_expired_user_resets();

    -- 6. Verificação de existência do usuário e captura de e-mail para auditoria
    SELECT u.email::TEXT
    INTO v_target_email
    FROM auth.users u
    WHERE u.id = p_target_user_id;

    IF v_target_email IS NULL THEN
        RAISE EXCEPTION 'Usuário não encontrado.'
            USING ERRCODE = 'P0002';
    END IF;

    -- 7. Concorrência: serializa invocações sobre o mesmo usuário via lock em user_profiles
    PERFORM 1
    FROM public.user_profiles
    WHERE user_id = p_target_user_id
    FOR UPDATE;

    -- 8. Garantia lógica de reset ativo único (reforçado pelo índice parcial UNIQUE no banco)
    IF EXISTS (
        SELECT 1
        FROM public.user_data_resets
        WHERE user_id = p_target_user_id
          AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Já existe um reset ativo para este usuário. Aguarde a expiração ou desfaça o reset anterior.'
            USING ERRCODE = '23505';
    END IF;

    -- 9. Captura integral do snapshot das 7 tabelas funcionais
    v_snapshot := jsonb_build_object(
        'liquidacoes_credito', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.liquidacoes_credito r WHERE r.user_id = p_target_user_id), '[]'::jsonb),
        'transacoes',          COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.transacoes r WHERE r.user_id = p_target_user_id), '[]'::jsonb),
        'metas',               COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.metas r WHERE r.user_id = p_target_user_id), '[]'::jsonb),
        'app_subcategorias',   COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.app_subcategorias r WHERE r.user_id = p_target_user_id), '[]'::jsonb),
        'app_categorias',      COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.app_categorias r WHERE r.user_id = p_target_user_id), '[]'::jsonb),
        'app_cartoes',         COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.app_cartoes r WHERE r.user_id = p_target_user_id), '[]'::jsonb),
        'app_tags',            COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.app_tags r WHERE r.user_id = p_target_user_id), '[]'::jsonb)
    );

    v_item_count := jsonb_array_length(v_snapshot->'liquidacoes_credito')
                  + jsonb_array_length(v_snapshot->'transacoes')
                  + jsonb_array_length(v_snapshot->'metas')
                  + jsonb_array_length(v_snapshot->'app_subcategorias')
                  + jsonb_array_length(v_snapshot->'app_categorias')
                  + jsonb_array_length(v_snapshot->'app_cartoes')
                  + jsonb_array_length(v_snapshot->'app_tags');

    -- 10. Persistência do snapshot na tabela controlada user_data_resets
    INSERT INTO public.user_data_resets (
        user_id,
        snapshot,
        status,
        created_at,
        expires_at,
        created_by
    ) VALUES (
        p_target_user_id,
        v_snapshot,
        'active',
        now(),
        now() + interval '48 hours',
        v_admin_id
    )
    RETURNING id, created_at, expires_at
    INTO v_reset_id, v_created_at, v_expires_at;

    -- 11. Limpeza dos dados ativos na ordem estrita de dependência (topologia reversa)
    -- 1: liquidacoes_credito (depende de transacoes)
    DELETE FROM public.liquidacoes_credito WHERE user_id = p_target_user_id;
    -- 2: transacoes
    DELETE FROM public.transacoes WHERE user_id = p_target_user_id;
    -- 3: metas
    DELETE FROM public.metas WHERE user_id = p_target_user_id;
    -- 4: app_subcategorias (possui FK RESTRICT para app_categorias)
    DELETE FROM public.app_subcategorias WHERE user_id = p_target_user_id;
    -- 5: app_categorias
    DELETE FROM public.app_categorias WHERE user_id = p_target_user_id;
    -- 6: app_cartoes
    DELETE FROM public.app_cartoes WHERE user_id = p_target_user_id;
    -- 7: app_tags
    DELETE FROM public.app_tags WHERE user_id = p_target_user_id;

    -- auth.users, user_profiles e admin_users permanecem 100% INTACTOS

    -- 12. Auditoria administrativa sem exposição de conteúdo financeiro
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
        'USER_DATA_RESET',
        jsonb_build_object(
            'reset_id', v_reset_id,
            'expires_at', v_expires_at,
            'records_snapshotted', v_item_count
        )
    );

    -- 13. Projeção controlada de retorno (proibido retornar o snapshot)
    RETURN QUERY
    SELECT v_reset_id, v_created_at, v_expires_at;
END;
$$;

COMMENT ON FUNCTION public.admin_reset_user_data(UUID) IS 
'Realiza snapshot atômico dos dados de aplicativo em 7 tabelas, armazena em user_data_resets por 48h e zera dados ativos. Protege contas admin.';


-- ============================================================================
-- 5. RPC public.admin_restore_user_data
-- ============================================================================
-- Restaura integralmente o snapshot JSONB respeitando a ordem topológica de FKs.
-- FAIL-CLOSED: Aborta com erro se houver qualquer novo dado criado após o reset.
-- Valida que status é active e expires_at > clock_timestamp().
CREATE OR REPLACE FUNCTION public.admin_restore_user_data(
    p_target_user_id UUID,
    p_reset_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_admin_id UUID;
    v_target_email TEXT;
    v_snapshot JSONB;
    v_status TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    v_admin_id := auth.uid();

    -- 1. Verificação de autorização: apenas administradores confirmados
    IF v_admin_id IS NULL OR NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores podem executar esta operação.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validação dos parâmetros obrigatórios
    IF p_target_user_id IS NULL OR p_reset_id IS NULL THEN
        RAISE EXCEPTION 'Os parâmetros p_target_user_id e p_reset_id são obrigatórios.'
            USING ERRCODE = '23502';
    END IF;

    -- 3. Proteção contra modificação de administradores
    IF EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_target_user_id) THEN
        RAISE EXCEPTION 'Operação não permitida sobre contas de administração.'
            USING ERRCODE = '42501';
    END IF;

    -- 4. Concorrência: bloqueia o perfil do usuário para serializar operações
    PERFORM 1
    FROM public.user_profiles
    WHERE user_id = p_target_user_id
    FOR UPDATE;

    -- 5. Localiza e bloqueia a linha de reset específica (garante que pertence ao target)
    SELECT
        r.snapshot,
        r.status,
        r.expires_at,
        u.email::TEXT
    INTO
        v_snapshot,
        v_status,
        v_expires_at,
        v_target_email
    FROM public.user_data_resets r
    JOIN auth.users u ON u.id = r.user_id
    WHERE r.id = p_reset_id
      AND r.user_id = p_target_user_id
    FOR UPDATE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Registro de reset não encontrado para o usuário informado.'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_status <> 'active' THEN
        RAISE EXCEPTION 'O reset informado não está ativo (status atual: %).', v_status
            USING ERRCODE = '22023';
    END IF;

    -- 6. Validação direta do prazo de 48h (independente de purge já ter rodado ou não)
    IF v_expires_at <= clock_timestamp() THEN
        RAISE EXCEPTION 'Prazo de 48 horas para restauração expirado.'
            USING ERRCODE = '22023';
    END IF;

    -- 7. Comportamento FAIL-CLOSED: se houver QUALQUER novo registro do usuário nas 7 tabelas, abortar imediatamente!
    IF EXISTS (SELECT 1 FROM public.liquidacoes_credito WHERE user_id = p_target_user_id) OR
       EXISTS (SELECT 1 FROM public.transacoes WHERE user_id = p_target_user_id) OR
       EXISTS (SELECT 1 FROM public.metas WHERE user_id = p_target_user_id) OR
       EXISTS (SELECT 1 FROM public.app_subcategorias WHERE user_id = p_target_user_id) OR
       EXISTS (SELECT 1 FROM public.app_categorias WHERE user_id = p_target_user_id) OR
       EXISTS (SELECT 1 FROM public.app_cartoes WHERE user_id = p_target_user_id) OR
       EXISTS (SELECT 1 FROM public.app_tags WHERE user_id = p_target_user_id) THEN
        RAISE EXCEPTION 'Usuário possui novos dados após o reset.'
            USING ERRCODE = '22000';
    END IF;

    -- 8. Restauração em ordem topológica segura (preservando UUIDs e relacionamentos originais)
    -- 1: app_tags
    IF v_snapshot ? 'app_tags' AND jsonb_typeof(v_snapshot->'app_tags') = 'array' AND jsonb_array_length(v_snapshot->'app_tags') > 0 THEN
        INSERT INTO public.app_tags
        SELECT * FROM jsonb_populate_recordset(null::public.app_tags, v_snapshot->'app_tags');
    END IF;

    -- 2: app_cartoes
    IF v_snapshot ? 'app_cartoes' AND jsonb_typeof(v_snapshot->'app_cartoes') = 'array' AND jsonb_array_length(v_snapshot->'app_cartoes') > 0 THEN
        INSERT INTO public.app_cartoes
        SELECT * FROM jsonb_populate_recordset(null::public.app_cartoes, v_snapshot->'app_cartoes');
    END IF;

    -- 3: app_categorias
    IF v_snapshot ? 'app_categorias' AND jsonb_typeof(v_snapshot->'app_categorias') = 'array' AND jsonb_array_length(v_snapshot->'app_categorias') > 0 THEN
        INSERT INTO public.app_categorias
        SELECT * FROM jsonb_populate_recordset(null::public.app_categorias, v_snapshot->'app_categorias');
    END IF;

    -- 4: app_subcategorias (FK RESTRICT para app_categorias agora satisfeita)
    IF v_snapshot ? 'app_subcategorias' AND jsonb_typeof(v_snapshot->'app_subcategorias') = 'array' AND jsonb_array_length(v_snapshot->'app_subcategorias') > 0 THEN
        INSERT INTO public.app_subcategorias
        SELECT * FROM jsonb_populate_recordset(null::public.app_subcategorias, v_snapshot->'app_subcategorias');
    END IF;

    -- 5: metas
    IF v_snapshot ? 'metas' AND jsonb_typeof(v_snapshot->'metas') = 'array' AND jsonb_array_length(v_snapshot->'metas') > 0 THEN
        INSERT INTO public.metas
        SELECT * FROM jsonb_populate_recordset(null::public.metas, v_snapshot->'metas');
    END IF;

    -- 6: transacoes
    IF v_snapshot ? 'transacoes' AND jsonb_typeof(v_snapshot->'transacoes') = 'array' AND jsonb_array_length(v_snapshot->'transacoes') > 0 THEN
        INSERT INTO public.transacoes
        SELECT * FROM jsonb_populate_recordset(null::public.transacoes, v_snapshot->'transacoes');
    END IF;

    -- 7: liquidacoes_credito (FK para transacoes agora satisfeita)
    IF v_snapshot ? 'liquidacoes_credito' AND jsonb_typeof(v_snapshot->'liquidacoes_credito') = 'array' AND jsonb_array_length(v_snapshot->'liquidacoes_credito') > 0 THEN
        INSERT INTO public.liquidacoes_credito
        SELECT * FROM jsonb_populate_recordset(null::public.liquidacoes_credito, v_snapshot->'liquidacoes_credito');
    END IF;

    -- 9. Atualiza status para restored (imuniza contra qualquer purge futuro)
    UPDATE public.user_data_resets
    SET
        status = 'restored',
        restored_at = clock_timestamp()
    WHERE id = p_reset_id
      AND status = 'active';

    -- 10. Registra auditoria administrativa
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
        'USER_DATA_RESTORED',
        jsonb_build_object(
            'reset_id', p_reset_id,
            'restored_at', clock_timestamp()
        )
    );

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_restore_user_data(UUID, UUID) IS 
'Restaura integralmente os dados do snapshot em 7 tabelas se dentro de 48h e se o usuário não possuir novos dados (fail-closed). Imuniza contra purge.';


-- ============================================================================
-- 6. RPC public.admin_get_user_reset_status
-- ============================================================================
-- Retorna o status de recuperação do usuário (se possui reset ativo e se ainda é recuperável).
-- Manutenção automática: executa purge silencioso de eventuais snapshots expirados.
-- NUNCA retorna o snapshot nem detalhes financeiros.
CREATE OR REPLACE FUNCTION public.admin_get_user_reset_status(
    p_target_user_id UUID
)
RETURNS TABLE (
    has_active_reset BOOLEAN,
    reset_id UUID,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_recoverable BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
    -- 1. Verificação de autorização: apenas administradores
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores podem executar esta operação.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validação de parâmetro
    IF p_target_user_id IS NULL THEN
        RAISE EXCEPTION 'O identificador do usuário (p_target_user_id) é obrigatório.'
            USING ERRCODE = '23502';
    END IF;

    -- 3. Manutenção silenciosa embutida: executa lazy purge de snapshots expirados
    -- Não depende de cron nem de ação manual do usuário/admin
    PERFORM public.admin_purge_expired_user_resets();

    -- 4. Retorno projetado restrito (sem jamais expor snapshot)
    RETURN QUERY
    SELECT
        (r.id IS NOT NULL) AS has_active_reset,
        r.id AS reset_id,
        r.created_at AS created_at,
        r.expires_at AS expires_at,
        (r.id IS NOT NULL AND r.expires_at > clock_timestamp()) AS is_recoverable
    FROM (SELECT p_target_user_id AS uid) u
    LEFT JOIN LATERAL (
        SELECT r_inner.id, r_inner.created_at, r_inner.expires_at
        FROM public.user_data_resets r_inner
        WHERE r_inner.user_id = p_target_user_id
          AND r_inner.status = 'active'
        ORDER BY r_inner.created_at DESC
        LIMIT 1
    ) r ON true;
END;
$$;

COMMENT ON FUNCTION public.admin_get_user_reset_status(UUID) IS 
'Consulta se existe reset ativo e recuperável para o usuário sem expor dados financeiros. Aciona purge de manutenção internamente.';


-- ============================================================================
-- 7. Governança de Privilégios (Princípio do Menor Privilégio)
-- ============================================================================
REVOKE ALL ON FUNCTION public.admin_reset_user_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_data(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_restore_user_data(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_user_data(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_purge_expired_user_resets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_expired_user_resets() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_get_user_reset_status(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_reset_status(UUID) TO authenticated;

COMMIT;
