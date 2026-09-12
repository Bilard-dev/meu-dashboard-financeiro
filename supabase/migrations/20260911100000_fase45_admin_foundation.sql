-- Migration: 20260911100000_fase45_admin_foundation.sql
-- Descrição: Fase 4.5-B / 4.5-B2 / 4.5-B3 / 4.5-B4 / 4.5-B5 — Fundação segura de autorização administrativa e governança de perfis de usuário
-- Inclui: public.admin_users, public.user_profiles, trigger estrito de signup, RPC complete_legacy_profile, public.is_admin() e public.has_app_access()

BEGIN;

-- ============================================================================
-- 1. Criação da Tabela public.admin_users
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_users IS 'Tabela de governança restrita que lista os UUIDs autorizados como administradores.';
COMMENT ON COLUMN public.admin_users.user_id IS 'Chave primária e referência para auth.users(id).';
COMMENT ON COLUMN public.admin_users.created_at IS 'Data/hora de concessão do perfil administrativo.';

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Deny-all explícito: Nenhum cliente via API/PostgREST pode ler ou escrever diretamente em admin_users
DROP POLICY IF EXISTS admin_users_deny_all_select ON public.admin_users;
CREATE POLICY admin_users_deny_all_select
    ON public.admin_users
    FOR SELECT
    TO authenticated, anon
    USING (false);

DROP POLICY IF EXISTS admin_users_deny_all_insert ON public.admin_users;
CREATE POLICY admin_users_deny_all_insert
    ON public.admin_users
    FOR INSERT
    TO authenticated, anon
    WITH CHECK (false);

DROP POLICY IF EXISTS admin_users_deny_all_update ON public.admin_users;
CREATE POLICY admin_users_deny_all_update
    ON public.admin_users
    FOR UPDATE
    TO authenticated, anon
    USING (false)
    WITH CHECK (false);

DROP POLICY IF EXISTS admin_users_deny_all_delete ON public.admin_users;
CREATE POLICY admin_users_deny_all_delete
    ON public.admin_users
    FOR DELETE
    TO authenticated, anon
    USING (false);

-- ============================================================================
-- 2. Criação da Tabela public.user_profiles
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    access_status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at TIMESTAMPTZ NULL,
    approved_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT chk_user_profiles_status CHECK (access_status IN ('pending', 'approved', 'rejected', 'suspended')),
    CONSTRAINT chk_user_profiles_display_name CHECK (length(trim(display_name)) BETWEEN 2 AND 80)
);

COMMENT ON TABLE public.user_profiles IS 'Perfis de usuários do sistema com estado de aprovação administrativa.';
COMMENT ON COLUMN public.user_profiles.display_name IS 'Nome para identificação do usuário (ex: Thiago Bilard). Obrigatório de 2 a 80 caracteres.';
COMMENT ON COLUMN public.user_profiles.access_status IS 'Estado de acesso: pending (padrão), approved, rejected ou suspended.';

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS de user_profiles:
-- O usuário autenticado comum pode consultar SOMENTE seu próprio perfil.
-- O administrador NÃO possui leitura direta irrestrita (evita vazamento via PostgREST).
-- A Central Administrativa utilizará RPCs restritas e auditadas.
DROP POLICY IF EXISTS user_profiles_select_own ON public.user_profiles;
CREATE POLICY user_profiles_select_own
ON public.user_profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Deny-all explícito para escrita direta de clientes via PostgREST em user_profiles:
DROP POLICY IF EXISTS user_profiles_deny_client_insert ON public.user_profiles;
CREATE POLICY user_profiles_deny_client_insert
    ON public.user_profiles
    FOR INSERT
    TO authenticated, anon
    WITH CHECK (false);

DROP POLICY IF EXISTS user_profiles_deny_client_update ON public.user_profiles;
CREATE POLICY user_profiles_deny_client_update
    ON public.user_profiles
    FOR UPDATE
    TO authenticated, anon
    USING (false)
    WITH CHECK (false);

DROP POLICY IF EXISTS user_profiles_deny_client_delete ON public.user_profiles;
CREATE POLICY user_profiles_deny_client_delete
    ON public.user_profiles
    FOR DELETE
    TO authenticated, anon
    USING (false);

-- ============================================================================
-- 3. Trigger Automático e Estrito para Criação de Perfil no Signup (auth.users)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_raw_name TEXT;
    v_clean_name TEXT;
BEGIN
    -- Extrai EXCLUSIVAMENTE o display_name da metadata de cadastro.
    -- Sem fallback para name, full_name, e-mail ou 'Usuário'.
    v_raw_name := COALESCE(NEW.raw_user_meta_data->>'display_name', '');
    v_clean_name := trim(regexp_replace(v_raw_name, '\s+', ' ', 'g'));

    -- REGRA ESTRITA:
    -- display_name é OBRIGATÓRIO (2 a 80 caracteres).
    -- Se o nome não for fornecido adequadamente, aborta a transação de cadastro no banco.
    IF length(v_clean_name) < 2 THEN
        RAISE EXCEPTION 'O nome para identificação do usuário é obrigatório e deve ter no mínimo 2 caracteres.'
            USING ERRCODE = '22023';
    END IF;

    IF length(v_clean_name) > 80 THEN
        RAISE EXCEPTION 'O nome para identificação do usuário deve ter no máximo 80 caracteres.'
            USING ERRCODE = '22023';
    END IF;

    -- CRÍTICO: access_status SEMPRE nasce como 'pending', independente do que o cliente enviou.
    -- approved_at e approved_by SEMPRE nascem como NULL.
    INSERT INTO public.user_profiles (
        user_id,
        display_name,
        access_status,
        created_at,
        approved_at,
        approved_by
    ) VALUES (
        NEW.id,
        v_clean_name,
        'pending',
        now(),
        NULL,
        NULL
    )
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user_profile() IS 'Trigger de governança que valida o nome do usuário e provisiona perfil pendente no signup.';

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_profile();

-- ============================================================================
-- 4. RPC para Usuários Legados: public.complete_legacy_profile()
-- ============================================================================
-- Permite que usuários antigos (cadastrados antes da migration) informem
-- pessoalmente seu nome para identificação e entrem no fluxo de aprovação.
-- Requisitos de Segurança Estritos:
-- - SECURITY DEFINER: insere na tabela restrita sem expor INSERT direto em user_profiles ao cliente.
-- - Executa exclusivamente para auth.uid() (o usuário não pode informar user_id de terceiros).
-- - access_status é FORÇADO para 'pending' (imune a autoaprovação).
-- - Falha se o usuário já possuir registro em user_profiles (não permite sobrescrita).
CREATE OR REPLACE FUNCTION public.complete_legacy_profile(p_display_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_uid UUID;
    v_clean_name TEXT;
BEGIN
    v_uid := auth.uid();

    -- Exige usuário autenticado
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Operação não permitida. Usuário não autenticado.' USING ERRCODE = '28000';
    END IF;

    -- Validação estrita de tamanho após trim e colapso de espaços
    v_clean_name := trim(regexp_replace(COALESCE(p_display_name, ''), '\s+', ' ', 'g'));
    IF length(v_clean_name) < 2 THEN
        RAISE EXCEPTION 'O nome para identificação do usuário deve ter no mínimo 2 caracteres.' USING ERRCODE = '22023';
    END IF;

    IF length(v_clean_name) > 80 THEN
        RAISE EXCEPTION 'O nome para identificação do usuário deve ter no máximo 80 caracteres.' USING ERRCODE = '22023';
    END IF;

    -- Verifica se o usuário já possui perfil cadastrado
    IF EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = v_uid) THEN
        RAISE EXCEPTION 'O perfil deste usuário já foi preenchido anteriormente.' USING ERRCODE = '23505';
    END IF;

    -- Insere o perfil com status PENDING forçado
    INSERT INTO public.user_profiles (
        user_id,
        display_name,
        access_status,
        created_at,
        approved_at,
        approved_by
    ) VALUES (
        v_uid,
        v_clean_name,
        'pending',
        now(),
        NULL,
        NULL
    );

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.complete_legacy_profile(TEXT) IS 'Permite que usuários legados autenticados preencham seu nome para identificação, provisionando perfil pendente.';

-- ============================================================================
-- 5. Função Canônica public.is_admin()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_users
        WHERE user_id = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.is_admin() IS 'Verifica se o usuário atual autenticado possui privilégio de administrador.';

-- ============================================================================
-- 6. Função Canônica public.has_app_access()
-- ============================================================================
-- Retorna TRUE se:
-- A) auth.uid() pertence a public.admin_users (is_admin())
-- OU
-- B) o próprio perfil do usuário em public.user_profiles possui access_status = 'approved'
-- Retorna FALSE em qualquer outro caso (não autenticado, pending, rejected, suspended).
CREATE OR REPLACE FUNCTION public.has_app_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
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

COMMENT ON FUNCTION public.has_app_access() IS 'Determina se o usuário da requisição possui autorização ativa para usar o sistema (admin ou approved).';

-- ============================================================================
-- 7. Governança de Privilégios (Princípio do Menor Privilégio)
-- ============================================================================
-- Revoga todos os privilégios públicos padrão na tabela e na função
REVOKE ALL ON TABLE public.admin_users FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated;

-- Concede SELECT de leitura do próprio perfil apenas a autenticados (filtrado estritamente por RLS: user_id = auth.uid())
GRANT SELECT ON TABLE public.user_profiles TO authenticated;

-- Funções internas de trigger: não devem ser executadas diretamente por clientes
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;

-- Permissões de execução de funções públicas para autenticados
REVOKE ALL ON FUNCTION public.complete_legacy_profile(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_legacy_profile(TEXT) TO authenticated;

-- Funções canônicas de autorização
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.has_app_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_app_access() TO authenticated;

COMMIT;
