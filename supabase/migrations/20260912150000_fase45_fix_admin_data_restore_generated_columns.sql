-- ============================================================================
-- FASE 4.5-C5-I.4: HOTFIX DE RESTORE COM COLUNAS GENERATED ALWAYS
-- ============================================================================
-- Data: 2026-09-12
-- Contexto: Elimina o erro PostgreSQL:
-- "cannot insert a non-DEFAULT value into column 'nome_normalizado'"
-- substituindo as cláusulas genéricas `INSERT INTO <table> SELECT * FROM jsonb_populate_recordset(...)`
-- por listas explícitas de colunas restauráveis em cada uma das 7 tabelas financeiras.
-- As colunas GENERATED ALWAYS (nome_normalizado em app_tags, app_cartoes, app_categorias,
-- app_subcategorias e categoria_normalizada em metas) são omitidas das listas de INSERT,
-- permitindo que o PostgreSQL as recalcule nativamente mantendo 100% de integridade.
-- Todos os IDs originais (UUIDs), relacionamentos de chave estrangeira, timestamps
-- e regras de segurança fail-closed permanecem 100% IDÊNTICOS à especificação canônica.
-- ============================================================================

BEGIN;

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
    -- [C5-I.4 HOTFIX]: Listas explícitas de colunas excluindo colunas GENERATED ALWAYS
    
    -- 1: app_tags
    IF v_snapshot ? 'app_tags' AND jsonb_typeof(v_snapshot->'app_tags') = 'array' AND jsonb_array_length(v_snapshot->'app_tags') > 0 THEN
        INSERT INTO public.app_tags (
            id,
            user_id,
            nome,
            cor,
            ativo,
            ordem,
            created_at,
            updated_at
        )
        SELECT
            id,
            user_id,
            nome,
            cor,
            ativo,
            ordem,
            created_at,
            updated_at
        FROM jsonb_populate_recordset(null::public.app_tags, v_snapshot->'app_tags');
    END IF;

    -- 2: app_cartoes
    IF v_snapshot ? 'app_cartoes' AND jsonb_typeof(v_snapshot->'app_cartoes') = 'array' AND jsonb_array_length(v_snapshot->'app_cartoes') > 0 THEN
        INSERT INTO public.app_cartoes (
            id,
            user_id,
            nome,
            ativo,
            dia_fechamento,
            dia_vencimento,
            cor,
            ordem,
            created_at,
            updated_at
        )
        SELECT
            id,
            user_id,
            nome,
            ativo,
            dia_fechamento,
            dia_vencimento,
            cor,
            ordem,
            created_at,
            updated_at
        FROM jsonb_populate_recordset(null::public.app_cartoes, v_snapshot->'app_cartoes');
    END IF;

    -- 3: app_categorias
    IF v_snapshot ? 'app_categorias' AND jsonb_typeof(v_snapshot->'app_categorias') = 'array' AND jsonb_array_length(v_snapshot->'app_categorias') > 0 THEN
        INSERT INTO public.app_categorias (
            id,
            user_id,
            nome,
            ativo,
            ordem,
            created_at,
            updated_at
        )
        SELECT
            id,
            user_id,
            nome,
            ativo,
            ordem,
            created_at,
            updated_at
        FROM jsonb_populate_recordset(null::public.app_categorias, v_snapshot->'app_categorias');
    END IF;

    -- 4: app_subcategorias (FK RESTRICT para app_categorias agora satisfeita)
    IF v_snapshot ? 'app_subcategorias' AND jsonb_typeof(v_snapshot->'app_subcategorias') = 'array' AND jsonb_array_length(v_snapshot->'app_subcategorias') > 0 THEN
        INSERT INTO public.app_subcategorias (
            id,
            user_id,
            categoria_id,
            nome,
            ativo,
            ordem,
            created_at,
            updated_at
        )
        SELECT
            id,
            user_id,
            categoria_id,
            nome,
            ativo,
            ordem,
            created_at,
            updated_at
        FROM jsonb_populate_recordset(null::public.app_subcategorias, v_snapshot->'app_subcategorias');
    END IF;

    -- 5: metas
    IF v_snapshot ? 'metas' AND jsonb_typeof(v_snapshot->'metas') = 'array' AND jsonb_array_length(v_snapshot->'metas') > 0 THEN
        INSERT INTO public.metas (
            id,
            user_id,
            categoria,
            valor_limite,
            created_at,
            updated_at
        )
        SELECT
            id,
            user_id,
            categoria,
            valor_limite,
            created_at,
            updated_at
        FROM jsonb_populate_recordset(null::public.metas, v_snapshot->'metas');
    END IF;

    -- 6: transacoes
    IF v_snapshot ? 'transacoes' AND jsonb_typeof(v_snapshot->'transacoes') = 'array' AND jsonb_array_length(v_snapshot->'transacoes') > 0 THEN
        INSERT INTO public.transacoes (
            id,
            user_id,
            tipo,
            data,
            descricao,
            custo,
            categoria,
            subcategoria,
            valor,
            pagamento,
            cartao,
            parcela,
            created_at,
            fatura_destino,
            grupo_parcela_id
        )
        SELECT
            id,
            user_id,
            tipo,
            data,
            descricao,
            custo,
            categoria,
            subcategoria,
            valor,
            pagamento,
            cartao,
            parcela,
            created_at,
            fatura_destino,
            grupo_parcela_id
        FROM jsonb_populate_recordset(null::public.transacoes, v_snapshot->'transacoes');
    END IF;

    -- 7: liquidacoes_credito (FK para transacoes agora satisfeita)
    IF v_snapshot ? 'liquidacoes_credito' AND jsonb_typeof(v_snapshot->'liquidacoes_credito') = 'array' AND jsonb_array_length(v_snapshot->'liquidacoes_credito') > 0 THEN
        INSERT INTO public.liquidacoes_credito (
            id,
            user_id,
            transacao_id,
            grupo_parcela_id,
            parcela_numero,
            valor,
            data_liquidacao,
            forma_liquidacao,
            status,
            cancelled_at,
            created_at,
            updated_at
        )
        SELECT
            id,
            user_id,
            transacao_id,
            grupo_parcela_id,
            parcela_numero,
            valor,
            data_liquidacao,
            forma_liquidacao,
            status,
            cancelled_at,
            created_at,
            updated_at
        FROM jsonb_populate_recordset(null::public.liquidacoes_credito, v_snapshot->'liquidacoes_credito');
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

REVOKE ALL ON FUNCTION public.admin_restore_user_data(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_user_data(UUID, UUID) TO authenticated;

COMMIT;
