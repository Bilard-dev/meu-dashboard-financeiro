/**
 * Serviço de Metas e Orçamentos — Base 3.0
 * Wrappers puros e desacoplados de acesso à tabela 'metas' do Supabase.
 */

import { supabaseClient } from './supabaseClient.js';

/**
 * Busca todas as metas cadastradas de um determinado usuário (sem ordenação explícita).
 * @param {string} userId - ID do usuário autenticado
 * @returns {Promise<{ data: object[] | null, error: object | null }>}
 */
export function fetchMetas(userId) {
    return supabaseClient
        .from('metas')
        .select('*')
        .eq('user_id', userId);
}

/**
 * Busca todas as metas cadastradas de um determinado usuário ordenadas alfabeticamente por categoria.
 * @param {string} userId - ID do usuário autenticado
 * @returns {Promise<{ data: object[] | null, error: object | null }>}
 */
export function fetchMetasOrdered(userId) {
    return supabaseClient
        .from('metas')
        .select('*')
        .eq('user_id', userId)
        .order('categoria', { ascending: true });
}

/**
 * Insere ou atualiza uma meta (upsert com resolução de conflito de categoria normalizada).
 * @param {object} payload - Dados da meta a serem salvos
 * @param {object} [options] - Opções do upsert (padrão: onConflict: 'user_id,categoria_normalizada')
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export function upsertMeta(payload, options = { onConflict: 'user_id,categoria_normalizada' }) {
    return supabaseClient
        .from('metas')
        .upsert(payload, options);
}

/**
 * Exclui uma meta existente pelo ID, garantindo isolamento pelo ID do usuário.
 * @param {string} id - ID da meta
 * @param {string} userId - ID do usuário autenticado
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export function deleteMeta(id, userId) {
    return supabaseClient
        .from('metas')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
}

/**
 * Insere múltiplas metas em lote (utilizado em migrações de dados locais).
 * @param {object[]} payloads - Array de objetos de metas
 * @returns {Promise<{ data: object[] | null, error: object | null }>}
 */
export function insertMetas(payloads) {
    return supabaseClient
        .from('metas')
        .insert(payloads);
}

/**
 * Atualiza o nome da categoria vinculada às metas do usuário (utilizado na propagação de rename de catálogo).
 * @param {string} userId - ID do usuário autenticado
 * @param {string} oldCategoryName - Nome antigo da categoria
 * @param {string} newCategoryName - Novo nome da categoria
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export function updateMetaCategory(userId, oldCategoryName, newCategoryName) {
    return supabaseClient
        .from('metas')
        .update({ categoria: newCategoryName })
        .eq('user_id', userId)
        .eq('categoria', oldCategoryName);
}
