-- Migration: 20260909120000_fase35_credit_settlement.sql
-- Descrição: Fase 3.5 — Tabela de liquidações antecipadas de cartão de crédito, integridade canônica por grupo/transação, validação de coerência no banco, soft reversal, RLS cross-user e trigger updated_at

BEGIN;

-- ============================================================================
-- 1. Criação da Tabela public.liquidacoes_credito
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.liquidacoes_credito (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transacao_id UUID NOT NULL REFERENCES public.transacoes(id) ON DELETE CASCADE,
    grupo_parcela_id UUID,
    parcela_numero INTEGER NOT NULL DEFAULT 1 CHECK (parcela_numero >= 1),
    valor NUMERIC NOT NULL CHECK (valor > 0),
    data_liquidacao DATE NOT NULL,
    forma_liquidacao TEXT NOT NULL DEFAULT 'PIX' CHECK (forma_liquidacao IN ('PIX', 'Transferência Bancária', 'Saldo em Conta')),
    status TEXT NOT NULL DEFAULT 'ATIVA' CHECK (status IN ('ATIVA', 'CANCELADA')),
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. Índices de Unicidade Canônica Parcial (Garantia Estrutural de Unicidade Ativa)
-- ============================================================================

-- 2.1 Garantia Canônica para Parcelamento 2.0 (grupo_parcela_id):
-- Impede duas liquidações ATIVAS para a mesma parcela do grupo, mesmo que
-- enviadas com transacao_id diferente pertencente ao mesmo grupo.
CREATE UNIQUE INDEX IF NOT EXISTS unique_liquidacao_ativa_por_grupo
ON public.liquidacoes_credito (user_id, grupo_parcela_id, parcela_numero)
WHERE status = 'ATIVA' AND grupo_parcela_id IS NOT NULL;

-- 2.2 Garantia Canônica para Compras À Vista / Sem Grupo (transacao_id):
-- Impede duas liquidações ATIVAS para a mesma compra à vista/avulsa.
CREATE UNIQUE INDEX IF NOT EXISTS unique_liquidacao_ativa_por_transacao_avulsa
ON public.liquidacoes_credito (user_id, transacao_id, parcela_numero)
WHERE status = 'ATIVA' AND grupo_parcela_id IS NULL;

-- ============================================================================
-- 3. Índices de Alta Eficiência para Consultas e Ordenação
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_liquidacoes_credito_user_transacao
ON public.liquidacoes_credito (user_id, transacao_id);

CREATE INDEX IF NOT EXISTS idx_liquidacoes_credito_user_grupo
ON public.liquidacoes_credito (user_id, grupo_parcela_id)
WHERE grupo_parcela_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_liquidacoes_credito_user_data
ON public.liquidacoes_credito (user_id, data_liquidacao DESC);

-- ============================================================================
-- 4. Trigger Automático para updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_liquidacoes_credito_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_liquidacoes_credito_updated_at ON public.liquidacoes_credito;
CREATE TRIGGER trg_liquidacoes_credito_updated_at
BEFORE UPDATE ON public.liquidacoes_credito
FOR EACH ROW
EXECUTE FUNCTION public.handle_liquidacoes_credito_updated_at();

-- ============================================================================
-- 5. Trigger de Validação Estrita de Coerência (transacao_id ↔ grupo_parcela_id)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_liquidacoes_credito_validate_coherence()
RETURNS TRIGGER AS $$
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

    -- 5.1 Validação de Ownership: a transação DEVE pertencer ao mesmo user_id
    IF v_tx_user_id <> NEW.user_id THEN
        RAISE EXCEPTION 'Inconsistência de propriedade: a transação % pertence a outro usuário.', NEW.transacao_id;
    END IF;

    -- 5.2 Validação e Sincronização de Coerência de Grupo
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_liquidacoes_credito_validate_coherence ON public.liquidacoes_credito;
CREATE TRIGGER trg_liquidacoes_credito_validate_coherence
BEFORE INSERT OR UPDATE ON public.liquidacoes_credito
FOR EACH ROW
EXECUTE FUNCTION public.handle_liquidacoes_credito_validate_coherence();

-- ============================================================================
-- 6. Row Level Security (RLS) com Validação de Ownership Cross-User
-- ============================================================================
ALTER TABLE public.liquidacoes_credito ENABLE ROW LEVEL SECURITY;

-- 6.1 SELECT: Usuário autenticado só lê seus próprios registros
DROP POLICY IF EXISTS "liquidacoes_credito_select_policy" ON public.liquidacoes_credito;
CREATE POLICY "liquidacoes_credito_select_policy"
ON public.liquidacoes_credito
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

-- 6.2 INSERT: Usuário autenticado só insere com user_id = auth.uid() e transação própria coerente
DROP POLICY IF EXISTS "liquidacoes_credito_insert_policy" ON public.liquidacoes_credito;
CREATE POLICY "liquidacoes_credito_insert_policy"
ON public.liquidacoes_credito
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.transacoes t
        WHERE t.id = liquidacoes_credito.transacao_id
          AND t.user_id = (SELECT auth.uid())
          AND (
              (liquidacoes_credito.grupo_parcela_id IS NULL)
              OR
              (liquidacoes_credito.grupo_parcela_id IS NOT NULL AND t.grupo_parcela_id = liquidacoes_credito.grupo_parcela_id)
          )
    )
);

-- 6.3 UPDATE: Usuário autenticado só atualiza registros próprios mantendo integridade
DROP POLICY IF EXISTS "liquidacoes_credito_update_policy" ON public.liquidacoes_credito;
CREATE POLICY "liquidacoes_credito_update_policy"
ON public.liquidacoes_credito
FOR UPDATE
TO authenticated
USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.transacoes t
        WHERE t.id = liquidacoes_credito.transacao_id
          AND t.user_id = (SELECT auth.uid())
    )
)
WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.transacoes t
        WHERE t.id = liquidacoes_credito.transacao_id
          AND t.user_id = (SELECT auth.uid())
          AND (
              (liquidacoes_credito.grupo_parcela_id IS NULL AND t.grupo_parcela_id IS NULL)
              OR
              (liquidacoes_credito.grupo_parcela_id IS NOT NULL AND t.grupo_parcela_id = liquidacoes_credito.grupo_parcela_id)
          )
    )
);

-- 6.4 DELETE: Usuário autenticado só pode deletar seus próprios registros.
-- (Aviso: O fluxo normal de reversão na aplicação é Soft Reversal via status = 'CANCELADA'.
-- Esta policy DELETE é mantida estritamente para suporte a ON DELETE CASCADE ao excluir a compra
-- e conformidade LGPD/GDPR de expurgo de dados do usuário).
DROP POLICY IF EXISTS "liquidacoes_credito_delete_policy" ON public.liquidacoes_credito;
CREATE POLICY "liquidacoes_credito_delete_policy"
ON public.liquidacoes_credito
FOR DELETE
TO authenticated
USING (user_id = (SELECT auth.uid()));

COMMIT;
