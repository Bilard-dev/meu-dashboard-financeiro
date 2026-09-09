/**
 * Serviço de Liquidação Antecipada de Cartão de Crédito — Fase 3.5
 * Wrappers puros e desacoplados de acesso à tabela 'liquidacoes_credito' do Supabase.
 */

import { supabaseClient } from './supabaseClient.js';

/**
 * Busca todas as liquidações antecipadas do usuário autenticado.
 * @param {string} userId - ID do usuário autenticado
 * @returns {Promise<{ data: object[] | null, error: object | null }>}
 */
export async function fetchCreditSettlements(userId) {
    if (!userId) {
        return { data: [], error: null };
    }

    try {
        const { data, error } = await supabaseClient
            .from('liquidacoes_credito')
            .select('*')
            .eq('user_id', userId)
            .order('data_liquidacao', { ascending: false });

        if (error) {
            // Resiliência caso a tabela ainda não tenha sido criada no Supabase remoto
            if (error.code === '42P01' || error.message?.includes('does not exist')) {
                console.warn('[creditSettlementService] Tabela public.liquidacoes_credito não encontrada. Execute a migration 20260909120000_fase35_credit_settlement.sql');
                return { data: [], error: null };
            }
            return { data: null, error };
        }

        return { data: data || [], error: null };
    } catch (err) {
        console.error('[creditSettlementService] Exceção ao buscar liquidações:', err);
        return { data: [], error: err };
    }
}

/**
 * Insere uma nova liquidação antecipada.
 * @param {object} payload - Dados da liquidação { user_id, transacao_id, parcela_numero, valor, data_liquidacao, forma_liquidacao }
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export async function insertCreditSettlement(payload) {
    if (!payload || !payload.user_id || !payload.transacao_id) {
        return { data: null, error: new Error('Payload de liquidação inválido.') };
    }

    const item = {
        user_id: payload.user_id,
        transacao_id: payload.transacao_id,
        parcela_numero: Number(payload.parcela_numero) || 1,
        valor: Number(payload.valor) || 0,
        data_liquidacao: payload.data_liquidacao || new Date().toISOString().split('T')[0],
        forma_liquidacao: payload.forma_liquidacao || 'PIX'
    };

    return supabaseClient
        .from('liquidacoes_credito')
        .insert([item]);
}

/**
 * Exclui uma liquidação antecipada pelo ID.
 * @param {string} userId - ID do usuário autenticado
 * @param {string} id - UUID da liquidação
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export async function deleteCreditSettlement(userId, id) {
    if (!userId || !id) {
        return { data: null, error: new Error('ID ou usuário ausente.') };
    }

    return supabaseClient
        .from('liquidacoes_credito')
        .delete()
        .eq('user_id', userId)
        .eq('id', id);
}

/**
 * Exclui a liquidação de uma parcela específica de uma transação.
 * @param {string} userId - ID do usuário autenticado
 * @param {string} transacaoId - UUID da transação
 * @param {number} parcelaNumero - Número da parcela (padrão: 1)
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export async function deleteCreditSettlementByTransaction(userId, transacaoId, parcelaNumero = 1) {
    if (!userId || !transacaoId) {
        return { data: null, error: new Error('Parâmetros de reversão ausentes.') };
    }

    return supabaseClient
        .from('liquidacoes_credito')
        .delete()
        .eq('user_id', userId)
        .eq('transacao_id', transacaoId)
        .eq('parcela_numero', Number(parcelaNumero) || 1);
}

/**
 * Exclui todas as liquidações vinculadas a uma transação (ao excluir a transação).
 * @param {string} userId - ID do usuário autenticado
 * @param {string} transacaoId - UUID da transação
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export async function deleteCreditSettlementsByTransactionId(userId, transacaoId) {
    if (!userId || !transacaoId) {
        return { data: null, error: new Error('Parâmetros ausentes.') };
    }

    return supabaseClient
        .from('liquidacoes_credito')
        .delete()
        .eq('user_id', userId)
        .eq('transacao_id', transacaoId);
}
