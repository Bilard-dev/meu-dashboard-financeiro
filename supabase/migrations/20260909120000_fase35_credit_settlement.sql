-- Migration: 20260909120000_fase35_credit_settlement.sql
-- Descrição: Fase 3.5 — Tabela de liquidações antecipadas de cartão de crédito, índices e RLS

BEGIN;

-- ============================================================================
-- 1. Criação da Tabela public.liquidacoes_credito
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.liquidacoes_credito (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transacao_id UUID NOT NULL REFERENCES public.transacoes(id) ON DELETE CASCADE,
    parcela_numero INTEGER NOT NULL DEFAULT 1 CHECK (parcela_numero >= 1),
    valor NUMERIC NOT NULL CHECK (valor > 0),
    data_liquidacao DATE NOT NULL,
    forma_liquidacao TEXT NOT NULL DEFAULT 'PIX',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_liquidacao_por_parcela UNIQUE (user_id, transacao_id, parcela_numero)
);

-- ============================================================================
-- 2. Índices de Alta Eficiência
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_liquidacoes_credito_user_transacao
ON public.liquidacoes_credito (user_id, transacao_id);

CREATE INDEX IF NOT EXISTS idx_liquidacoes_credito_user_data
ON public.liquidacoes_credito (user_id, data_liquidacao DESC);

-- ============================================================================
-- 3. Row Level Security (RLS)
-- ============================================================================
ALTER TABLE public.liquidacoes_credito ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "liquidacoes_credito_select_policy" ON public.liquidacoes_credito;
CREATE POLICY "liquidacoes_credito_select_policy"
ON public.liquidacoes_credito
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "liquidacoes_credito_insert_policy" ON public.liquidacoes_credito;
CREATE POLICY "liquidacoes_credito_insert_policy"
ON public.liquidacoes_credito
FOR INSERT
TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "liquidacoes_credito_update_policy" ON public.liquidacoes_credito;
CREATE POLICY "liquidacoes_credito_update_policy"
ON public.liquidacoes_credito
FOR UPDATE
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "liquidacoes_credito_delete_policy" ON public.liquidacoes_credito;
CREATE POLICY "liquidacoes_credito_delete_policy"
ON public.liquidacoes_credito
FOR DELETE
TO authenticated
USING (user_id = (SELECT auth.uid()));

COMMIT;
