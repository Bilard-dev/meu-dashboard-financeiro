-- ============================================================================
-- FASE 4.6: ASSINATURAS + PAGAMENTOS AGENDADOS (PREVISTO ≠ REALIZADO)
-- ============================================================================
-- Data: 2026-09-12
-- Tabelas: public.agendamentos_financeiros, public.agendamento_ocorrencias
-- RPCs: public.confirmar_agendamento_ocorrencia, public.cancelar_agendamento_ocorrencia
-- Segurança: RLS estrito por user_id + has_app_access()
-- ============================================================================

BEGIN;

-- 1. TABELA DE REGRAS DE AGENDAMENTOS E ASSINATURAS
CREATE TABLE IF NOT EXISTS public.agendamentos_financeiros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('assinatura_cartao', 'pix_agendado')),
    descricao TEXT NOT NULL,
    valor_previsto NUMERIC(14, 2) NOT NULL CHECK (valor_previsto > 0),
    categoria TEXT NOT NULL,
    subcategoria TEXT,
    cartao TEXT,
    dia_vencimento INTEGER CHECK (dia_vencimento BETWEEN 1 AND 31),
    data_inicio DATE NOT NULL,
    recorrencia TEXT NOT NULL DEFAULT 'mensal' CHECK (recorrencia IN ('mensal', 'unica')),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.agendamentos_financeiros IS
'Regras persistentes de agendamentos financeiros (Assinaturas no Cartão e PIX Agendado).';

-- 2. TABELA DE OCORRÊNCIAS PREVISTAS
CREATE TABLE IF NOT EXISTS public.agendamento_ocorrencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agendamento_id UUID NOT NULL REFERENCES public.agendamentos_financeiros(id) ON DELETE CASCADE,
    data_prevista DATE NOT NULL,
    valor_previsto NUMERIC(14, 2) NOT NULL CHECK (valor_previsto > 0),
    status TEXT NOT NULL DEFAULT 'PREVISTA' CHECK (status IN ('PREVISTA', 'REALIZADA', 'CANCELADA')),
    transacao_id UUID REFERENCES public.transacoes(id) ON DELETE SET NULL,
    valor_realizado NUMERIC(14, 2) CHECK (valor_realizado IS NULL OR valor_realizado > 0),
    realizado_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT agendamento_ocorrencias_unique_prevista UNIQUE (agendamento_id, data_prevista)
);

COMMENT ON TABLE public.agendamento_ocorrencias IS
'Ocorrências mensais/pontuais geradas a partir das regras de agendamento. PREVISTO != REALIZADO.';

-- 3. ÍNDICES DE PERFORMANCE E INTEGRIDADE
CREATE INDEX IF NOT EXISTS idx_agendamentos_user_ativo
    ON public.agendamentos_financeiros(user_id, ativo);

CREATE INDEX IF NOT EXISTS idx_ocorrencias_user_status_data
    ON public.agendamento_ocorrencias(user_id, status, data_prevista);

CREATE INDEX IF NOT EXISTS idx_ocorrencias_agendamento
    ON public.agendamento_ocorrencias(agendamento_id);

CREATE INDEX IF NOT EXISTS idx_ocorrencias_transacao
    ON public.agendamento_ocorrencias(transacao_id);

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.agendamentos_financeiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamento_ocorrencias ENABLE ROW LEVEL SECURITY;

-- Políticas para public.agendamentos_financeiros
DROP POLICY IF EXISTS "agendamentos_select_policy" ON public.agendamentos_financeiros;
CREATE POLICY "agendamentos_select_policy" ON public.agendamentos_financeiros
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access());

DROP POLICY IF EXISTS "agendamentos_insert_policy" ON public.agendamentos_financeiros;
CREATE POLICY "agendamentos_insert_policy" ON public.agendamentos_financeiros
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND public.has_app_access());

DROP POLICY IF EXISTS "agendamentos_update_policy" ON public.agendamentos_financeiros;
CREATE POLICY "agendamentos_update_policy" ON public.agendamentos_financeiros
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access())
    WITH CHECK (user_id = auth.uid() AND public.has_app_access());

DROP POLICY IF EXISTS "agendamentos_delete_policy" ON public.agendamentos_financeiros;
CREATE POLICY "agendamentos_delete_policy" ON public.agendamentos_financeiros
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access());

-- Políticas para public.agendamento_ocorrencias
DROP POLICY IF EXISTS "ocorrencias_select_policy" ON public.agendamento_ocorrencias;
CREATE POLICY "ocorrencias_select_policy" ON public.agendamento_ocorrencias
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access());

DROP POLICY IF EXISTS "ocorrencias_insert_policy" ON public.agendamento_ocorrencias;
CREATE POLICY "ocorrencias_insert_policy" ON public.agendamento_ocorrencias
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND public.has_app_access());

DROP POLICY IF EXISTS "ocorrencias_update_policy" ON public.agendamento_ocorrencias;
CREATE POLICY "ocorrencias_update_policy" ON public.agendamento_ocorrencias
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access())
    WITH CHECK (user_id = auth.uid() AND public.has_app_access());

DROP POLICY IF EXISTS "ocorrencias_delete_policy" ON public.agendamento_ocorrencias;
CREATE POLICY "ocorrencias_delete_policy" ON public.agendamento_ocorrencias
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() AND public.has_app_access());

-- 5. RPC ATÔMICA DE CONFIRMAÇÃO DE OCORRÊNCIA (TRANSFORMAÇÃO PREVISTA -> REALIZADA)
CREATE OR REPLACE FUNCTION public.confirmar_agendamento_ocorrencia(
    p_ocorrencia_id UUID,
    p_valor_realizado NUMERIC,
    p_data_realizada DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_ocorrencia RECORD;
    v_regra RECORD;
    v_transacao_id UUID;
    v_data_final DATE;
    v_pagamento TEXT;
    v_cartao TEXT;
BEGIN
    v_user_id := auth.uid();

    -- 1. Validação de Autorização
    IF v_user_id IS NULL OR NOT public.has_app_access() THEN
        RAISE EXCEPTION 'Acesso negado. Usuário não autenticado ou sem permissão.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validação de Parâmetros
    IF p_ocorrencia_id IS NULL THEN
        RAISE EXCEPTION 'Identificador da ocorrência é obrigatório.'
            USING ERRCODE = '23502';
    END IF;

    IF p_valor_realizado IS NULL OR p_valor_realizado <= 0 THEN
        RAISE EXCEPTION 'O valor realizado deve ser maior que zero.'
            USING ERRCODE = '22023';
    END IF;

    -- 3. Localiza e bloqueia a ocorrência garantindo ownership
    SELECT * INTO v_ocorrencia
    FROM public.agendamento_ocorrencias
    WHERE id = p_ocorrencia_id
      AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ocorrência não encontrada ou não pertence ao usuário.'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_ocorrencia.status <> 'PREVISTA' THEN
        RAISE EXCEPTION 'Apenas ocorrências com status PREVISTA podem ser confirmadas (status atual: %).', v_ocorrencia.status
            USING ERRCODE = '22023';
    END IF;

    -- 4. Localiza a regra mãe
    SELECT * INTO v_regra
    FROM public.agendamentos_financeiros
    WHERE id = v_ocorrencia.agendamento_id
      AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Regra de agendamento vinculada não encontrada.'
            USING ERRCODE = 'P0002';
    END IF;

    -- 5. Define data e forma de pagamento correspondente
    v_data_final := COALESCE(p_data_realizada, v_ocorrencia.data_prevista);
    v_transacao_id := gen_random_uuid();

    IF v_regra.tipo = 'assinatura_cartao' THEN
        v_pagamento := 'Cartão de Crédito';
        v_cartao := v_regra.cartao;
    ELSE
        v_pagamento := 'PIX';
        v_cartao := NULL;
    END IF;

    -- 6. Criação atômica da transação real em public.transacoes
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
        fatura_destino,
        created_at
    ) VALUES (
        v_transacao_id,
        v_user_id,
        'Despesa',
        v_data_final,
        v_regra.descricao,
        'Fixo',
        v_regra.categoria,
        v_regra.subcategoria,
        p_valor_realizado,
        v_pagamento,
        v_cartao,
        '1/1',
        'ATUAL',
        clock_timestamp()
    );

    -- 7. Atualização do status da ocorrência para REALIZADA vinculada à transação criada
    UPDATE public.agendamento_ocorrencias
    SET
        status = 'REALIZADA',
        transacao_id = v_transacao_id,
        valor_realizado = p_valor_realizado,
        realizado_em = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE id = p_ocorrencia_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'ocorrencia_id', p_ocorrencia_id,
        'transacao_id', v_transacao_id,
        'valor_realizado', p_valor_realizado,
        'data_realizada', v_data_final
    );
END;
$$;

COMMENT ON FUNCTION public.confirmar_agendamento_ocorrencia(UUID, NUMERIC, DATE) IS
'Confirma atômica e seguramente uma ocorrência agendada, inserindo a transação real correspondente e atualizando a ocorrência para REALIZADA.';

REVOKE ALL ON FUNCTION public.confirmar_agendamento_ocorrencia(UUID, NUMERIC, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_agendamento_ocorrencia(UUID, NUMERIC, DATE) TO authenticated;

-- 6. RPC DE CANCELAMENTO DE OCORRÊNCIA FUTURA
CREATE OR REPLACE FUNCTION public.cancelar_agendamento_ocorrencia(
    p_ocorrencia_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_ocorrencia RECORD;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL OR NOT public.has_app_access() THEN
        RAISE EXCEPTION 'Acesso negado.'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_ocorrencia
    FROM public.agendamento_ocorrencias
    WHERE id = p_ocorrencia_id
      AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ocorrência não encontrada.'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_ocorrencia.status <> 'PREVISTA' THEN
        RAISE EXCEPTION 'Apenas ocorrências com status PREVISTA podem ser canceladas.'
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.agendamento_ocorrencias
    SET
        status = 'CANCELADA',
        updated_at = clock_timestamp()
    WHERE id = p_ocorrencia_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'ocorrencia_id', p_ocorrencia_id,
        'status', 'CANCELADA'
    );
END;
$$;

COMMENT ON FUNCTION public.cancelar_agendamento_ocorrencia(UUID) IS
'Cancela uma ocorrência prevista futura de forma controlada sem apagar histórico.';

REVOKE ALL ON FUNCTION public.cancelar_agendamento_ocorrencia(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_agendamento_ocorrencia(UUID) TO authenticated;

COMMIT;
