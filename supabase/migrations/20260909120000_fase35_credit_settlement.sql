-- Migration: 20260909120000_fase35_credit_settlement.sql
-- Descrição: Fase 3.5 — Tabela de liquidações antecipadas de cartão de crédito, integridade referencial, soft reversal, RLS cross-user e trigger updated_at

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
-- 2. Índices de Alta Eficiência e Unicidade Parcial (Soft Reversal Auditável)
-- ============================================================================
-- Garante que exista no máximo UMA liquidação ATIVA por parcela/transação,
-- permitindo múltiplos registros históricos cancelados para a mesma obrigação.
CREATE UNIQUE INDEX IF NOT EXISTS unique_liquidacao_ativa_por_transacao
ON public.liquidacoes_credito (user_id, transacao_id, parcela_numero)
WHERE status = 'ATIVA';

-- Índice para busca rápida por transacao_id
CREATE INDEX IF NOT EXISTS idx_liquidacoes_credito_user_transacao
ON public.liquidacoes_credito (user_id, transacao_id);

-- Índice para busca rápida por grupo_parcela_id (Parcelamentos 2.0)
CREATE INDEX IF NOT EXISTS idx_liquidacoes_credito_user_grupo
ON public.liquidacoes_credito (user_id, grupo_parcela_id)
WHERE grupo_parcela_id IS NOT NULL;

-- Índice para ordenação temporal por data de liquidação
CREATE INDEX IF NOT EXISTS idx_liquidacoes_credito_user_data
ON public.liquidacoes_credito (user_id, data_liquidacao DESC);

-- ============================================================================
-- 3. Trigger Automático para updated_at
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
-- 4. Row Level Security (RLS) com Validação Estrita de Ownership Cross-User
-- ============================================================================
ALTER TABLE public.liquidacoes_credito ENABLE ROW LEVEL SECURITY;

-- SELECT: Usuário autenticado só lê seus próprios registros
DROP POLICY IF EXISTS "liquidacoes_credito_select_policy" ON public.liquidacoes_credito;
CREATE POLICY "liquidacoes_credito_select_policy"
ON public.liquidacoes_credito
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

-- INSERT: Garante que user_id seja auth.uid() E que a transacao_id referenciada pertença ao mesmo usuário
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
    )
);

-- UPDATE: Garante que user_id seja auth.uid() E que a transação pertença ao mesmo usuário
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
    )
);

-- DELETE: Usuário autenticado só pode deletar seus próprios registros
DROP POLICY IF EXISTS "liquidacoes_credito_delete_policy" ON public.liquidacoes_credito;
CREATE POLICY "liquidacoes_credito_delete_policy"
ON public.liquidacoes_credito
FOR DELETE
TO authenticated
USING (user_id = (SELECT auth.uid()));

COMMIT;
