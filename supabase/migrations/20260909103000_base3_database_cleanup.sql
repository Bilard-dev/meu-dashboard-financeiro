-- Migration: 20260909103000_base3_database_cleanup.sql
-- Descrição: Base 3.0 — Otimização de índices, remoção do backend legado de Gastos Compartilhados e reforço NOT NULL em user_id

BEGIN;

-- ============================================================================
-- BLOCO A: Criação de Índices de Alta Eficiência
-- ============================================================================

-- 1. Índice composto para acelerar o carregamento do dashboard e cobrir FK transacoes_user_id_fkey
CREATE INDEX IF NOT EXISTS idx_transacoes_user_data
ON public.transacoes (user_id, data DESC);

-- 2. Índice para cobrir a FK app_subcategorias_categoria_id_fkey
CREATE INDEX IF NOT EXISTS idx_app_subcategorias_categoria_id
ON public.app_subcategorias (categoria_id);

-- ============================================================================
-- BLOCO B: Remoção Definitiva do Backend Legado de Gastos Compartilhados
-- ============================================================================

-- 1. Remover foreign key de relacionamento entre transacoes e gastos_compartilhados
ALTER TABLE public.transacoes
DROP CONSTRAINT IF EXISTS fk_transacoes_gasto_compartilhado_owner;

-- 2. Remover índice único parcial legado
DROP INDEX IF EXISTS public.unique_transacao_por_gasto_compartilhado;

-- 3. Remover coluna legada em transacoes
ALTER TABLE public.transacoes
DROP COLUMN IF EXISTS gasto_compartilhado_id;

-- 4. Remover tabela legada gastos_compartilhados (sem CASCADE para validar integridade)
DROP TABLE IF EXISTS public.gastos_compartilhados;

-- ============================================================================
-- BLOCO C: Reforço de Integridade no Schema
-- ============================================================================

-- Garantir que transacoes.user_id seja obrigatoriamente preenchido
ALTER TABLE public.transacoes
ALTER COLUMN user_id SET NOT NULL;

COMMIT;
