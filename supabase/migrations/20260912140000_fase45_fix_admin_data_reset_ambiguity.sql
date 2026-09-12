-- ============================================================================
-- FASE 4.5-C5-I.1: HOTFIX DE AMBIGUIDADE EM admin_reset_user_data
-- ============================================================================
-- Data: 2026-09-12
-- Contexto: Elimina o erro PostgreSQL "column reference 'created_at' is ambiguous"
-- na instrução INSERT INTO public.user_data_resets ... RETURNING.
-- A cláusula RETURNING agora qualifica explicitamente os nomes das colunas da
-- tabela via alias "udr" (udr.id, udr.created_at, udr.expires_at) para evitar
-- qualquer colisão semântica com as variáveis de saída declaradas no RETURNS TABLE.
-- Todas as regras de segurança, validações, isolamento, ordem de exclusão,
-- snapshot e permissões permanecem 100% IDÊNTICAS à versão canônica.
-- ============================================================================

BEGIN;

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
    -- [C5-I.1 HOTFIX]: Alias explícito udr para qualificar univelmente o RETURNING
    INSERT INTO public.user_data_resets AS udr (
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
    RETURNING
        udr.id,
        udr.created_at,
        udr.expires_at
    INTO
        v_reset_id,
        v_created_at,
        v_expires_at;

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

REVOKE ALL ON FUNCTION public.admin_reset_user_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_data(UUID) TO authenticated;

COMMIT;
