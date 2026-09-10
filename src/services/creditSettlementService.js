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
            // Resiliência observável caso a tabela ainda não tenha sido criada no Supabase remoto
            if (error.code === '42P01' || error.code === 'PGRST204' || error.message?.includes('does not exist')) {
                console.warn('[creditSettlementService] Tabela public.liquidacoes_credito não encontrada. Execute a migration 20260909120000_fase35_credit_settlement.sql');
                return { data: [], error: { isTableMissing: true, message: 'Tabela public.liquidacoes_credito não encontrada no Supabase.' } };
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
 * Insere ou reativa uma liquidação antecipada.
 * @param {object} payload - Dados da liquidação { user_id, transacao_id, grupo_parcela_id, parcela_numero, valor, data_liquidacao, forma_liquidacao }
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export async function insertCreditSettlement(payload) {
    if (!payload || !payload.user_id || !payload.transacao_id) {
        return { data: null, error: new Error('Payload de liquidação inválido.') };
    }

    const item = {
        user_id: payload.user_id,
        transacao_id: payload.transacao_id,
        grupo_parcela_id: payload.grupo_parcela_id || null,
        parcela_numero: Number(payload.parcela_numero) || 1,
        valor: Number(payload.valor) || 0,
        data_liquidacao: payload.data_liquidacao || new Date().toISOString().split('T')[0],
        forma_liquidacao: payload.forma_liquidacao || 'PIX',
        status: payload.status || 'ATIVA',
        cancelled_at: null
    };

    return supabaseClient
        .from('liquidacoes_credito')
        .insert([item]);
}

/**
 * Realiza a reversão segura (soft reversal) de uma liquidação, marcando-a como CANCELADA.
 * Preserva o histórico financeiro e audita a data do cancelamento.
 *
 * @param {string} userId - ID do usuário autenticado
 * @param {string} transacaoId - UUID da transação
 * @param {number} parcelaNumero - Número da parcela
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export async function cancelCreditSettlement(userId, transacaoId, parcelaNumero = 1) {
    if (!userId || !transacaoId) {
        return { data: null, error: new Error('Parâmetros de cancelamento ausentes.') };
    }

    return supabaseClient
        .from('liquidacoes_credito')
        .update({
            status: 'CANCELADA',
            cancelled_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('transacao_id', transacaoId)
        .eq('parcela_numero', Number(parcelaNumero) || 1)
        .eq('status', 'ATIVA');
}

/**
 * Reativa uma liquidação anteriormente cancelada.
 * @param {string} userId - ID do usuário autenticado
 * @param {string} transacaoId - UUID da transação
 * @param {number} parcelaNumero - Número da parcela
 * @param {object} [updateData={}] - Dados adicionais para atualização
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export async function reactivateCreditSettlement(userId, transacaoId, parcelaNumero = 1, updateData = {}) {
    if (!userId || !transacaoId) {
        return { data: null, error: new Error('Parâmetros de reativação ausentes.') };
    }

    return supabaseClient
        .from('liquidacoes_credito')
        .update({
            status: 'ATIVA',
            cancelled_at: null,
            ...updateData
        })
        .eq('user_id', userId)
        .eq('transacao_id', transacaoId)
        .eq('parcela_numero', Number(parcelaNumero) || 1);
}

/**
 * Exclui fisicamente uma liquidação antecipada pelo ID (uso administrativo/testes).
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
 * Exclui fisicamente a liquidação de uma parcela específica de uma transação.
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
