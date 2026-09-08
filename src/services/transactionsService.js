/**
 * Serviço de Transações Financeiras — Base 3.0
 * Wrappers puros e desacoplados de acesso à tabela 'transacoes' do Supabase.
 */

import { supabaseClient } from './supabaseClient.js';

/**
 * Busca todas as transações cadastradas ordenadas por data decrescente.
 * @returns {Promise<{ data: object[] | null, error: object | null }>}
 */
export function fetchTransactions() {
    return supabaseClient
        .from('transacoes')
        .select('*')
        .order('data', { ascending: false });
}

/**
 * Insere uma ou mais transações no banco.
 * @param {object[]} payloads - Array de transações a serem inseridas
 * @returns {Promise<{ data: object[] | null, error: object | null }>}
 */
export function insertTransactions(payloads) {
    return supabaseClient
        .from('transacoes')
        .insert(payloads);
}

/**
 * Atualiza os campos de uma transação existente pelo ID.
 * @param {string} id - ID da transação
 * @param {object} payload - Campos a serem atualizados
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export function updateTransaction(id, payload) {
    return supabaseClient
        .from('transacoes')
        .update(payload)
        .eq('id', id);
}

/**
 * Exclui uma transação individual pelo ID, garantindo isolamento pelo ID do usuário.
 * @param {string} userId - ID do usuário autenticado
 * @param {string} id - ID da transação
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export function deleteTransaction(userId, id) {
    return supabaseClient
        .from('transacoes')
        .delete()
        .eq('user_id', userId)
        .eq('id', id);
}

/**
 * Exclui todas as parcelas de um parcelamento pelo identificador de grupo e ID do usuário.
 * @param {string} userId - ID do usuário autenticado
 * @param {string} grupoParcelaId - UUID do grupo de parcelas
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export function deleteTransactionsByGroup(userId, grupoParcelaId) {
    return supabaseClient
        .from('transacoes')
        .delete()
        .eq('user_id', userId)
        .eq('grupo_parcela_id', grupoParcelaId);
}

/**
 * Atualiza a categoria de transações do usuário (propagação de renomeação de catálogo).
 * @param {string} userId - ID do usuário autenticado
 * @param {string} oldCategoryName - Nome antigo da categoria
 * @param {string} newCategoryName - Novo nome da categoria
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export function updateTransactionCategory(userId, oldCategoryName, newCategoryName) {
    return supabaseClient
        .from('transacoes')
        .update({ categoria: newCategoryName })
        .eq('user_id', userId)
        .eq('categoria', oldCategoryName);
}

/**
 * Atualiza a subcategoria de transações do usuário sob uma categoria pai (propagação de rename).
 * @param {string} userId - ID do usuário autenticado
 * @param {string} parentCategoryName - Nome da categoria pai
 * @param {string} oldSubcategoryName - Nome antigo da subcategoria
 * @param {string} newSubcategoryName - Novo nome da subcategoria
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export function updateTransactionSubcategory(userId, parentCategoryName, oldSubcategoryName, newSubcategoryName) {
    return supabaseClient
        .from('transacoes')
        .update({ subcategoria: newSubcategoryName })
        .eq('user_id', userId)
        .eq('categoria', parentCategoryName)
        .eq('subcategoria', oldSubcategoryName);
}

/**
 * Atualiza o nome do cartão em transações do usuário (propagação de rename).
 * @param {string} userId - ID do usuário autenticado
 * @param {string} oldCardName - Nome antigo do cartão
 * @param {string} newCardName - Novo nome do cartão
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export function updateTransactionCard(userId, oldCardName, newCardName) {
    return supabaseClient
        .from('transacoes')
        .update({ cartao: newCardName })
        .eq('user_id', userId)
        .eq('cartao', oldCardName);
}

/**
 * Atualiza a descrição de uma transação pelo ID (propagação de renomeação de tag).
 * @param {string} id - ID da transação
 * @param {string} newDescription - Nova descrição formatada com tags
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export function updateTransactionDescription(id, newDescription) {
    return supabaseClient
        .from('transacoes')
        .update({ descricao: newDescription })
        .eq('id', id);
}
