/**
 * Serviço de Catálogos e Listas Gerenciadas — Base 3.0
 * Wrappers puros e desacoplados de acesso às tabelas 'app_categorias',
 * 'app_subcategorias', 'app_cartoes', 'app_tags' e RPCs de merge do Supabase.
 */

import { supabaseClient } from './supabaseClient.js';

/**
 * Busca todas as categorias do usuário ordenadas por ordem e nome.
 * @param {string} userId - ID do usuário autenticado
 * @returns {Promise<{ data: object[] | null, error: object | null }>}
 */
export function fetchCategoriasOrdered(userId) {
    return supabaseClient
        .from('app_categorias')
        .select('*')
        .eq('user_id', userId)
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true });
}

/**
 * Busca categorias do usuário sem ordenação explícita (usado em reconsultas de importação).
 * @param {string} userId - ID do usuário autenticado
 * @returns {Promise<{ data: object[] | null, error: object | null }>}
 */
export function fetchCategorias(userId) {
    return supabaseClient
        .from('app_categorias')
        .select('*')
        .eq('user_id', userId);
}

/**
 * Busca todas as subcategorias do usuário ordenadas por ordem e nome.
 * @param {string} userId - ID do usuário autenticado
 * @returns {Promise<{ data: object[] | null, error: object | null }>}
 */
export function fetchSubcategoriasOrdered(userId) {
    return supabaseClient
        .from('app_subcategorias')
        .select('*')
        .eq('user_id', userId)
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true });
}

/**
 * Busca todos os cartões do usuário ordenados por ordem e nome.
 * @param {string} userId - ID do usuário autenticado
 * @returns {Promise<{ data: object[] | null, error: object | null }>}
 */
export function fetchCartoesOrdered(userId) {
    return supabaseClient
        .from('app_cartoes')
        .select('*')
        .eq('user_id', userId)
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true });
}

/**
 * Busca todas as tags do usuário ordenadas por ordem e nome.
 * @param {string} userId - ID do usuário autenticado
 * @returns {Promise<{ data: object[] | null, error: object | null }>}
 */
export function fetchTagsOrdered(userId) {
    return supabaseClient
        .from('app_tags')
        .select('*')
        .eq('user_id', userId)
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true });
}

/**
 * Insere um único registro em tabela de catálogo e retorna o registro criado.
 * @param {string} tableName - Nome da tabela ('app_categorias', 'app_subcategorias', 'app_cartoes', 'app_tags')
 * @param {object} payload - Dados do item a ser criado
 * @returns {Promise<{ data: object[] | null, error: object | null }>}
 */
export function insertCatalogItem(tableName, payload) {
    return supabaseClient
        .from(tableName)
        .insert([payload])
        .select();
}

/**
 * Insere múltiplos registros em lote em tabela de catálogo (usado no assistente de importação).
 * @param {string} tableName - Nome da tabela de catálogo
 * @param {object[]} payloads - Array de objetos a serem inseridos
 * @returns {Promise<{ data: object[] | null, error: object | null }>}
 */
export function insertCatalogBatch(tableName, payloads) {
    return supabaseClient
        .from(tableName)
        .insert(payloads);
}

/**
 * Atualiza um registro de catálogo pelo ID.
 * @param {string} tableName - Nome da tabela de catálogo
 * @param {string} id - ID do registro
 * @param {object} payload - Campos a serem atualizados
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export function updateCatalogItem(tableName, id, payload) {
    return supabaseClient
        .from(tableName)
        .update(payload)
        .eq('id', id);
}

/**
 * Exclui fisicamente um registro de catálogo pelo ID.
 * @param {string} tableName - Nome da tabela de catálogo
 * @param {string} id - ID do registro
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export function deleteCatalogItem(tableName, id) {
    return supabaseClient
        .from(tableName)
        .delete()
        .eq('id', id);
}

/**
 * Executa uma Stored Procedure (RPC) do Supabase pertencente ao domínio de catálogos (merge).
 * @param {string} rpcName - Nome da função RPC
 * @param {object} rpcParams - Parâmetros da chamada RPC
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export function callCatalogRpc(rpcName, rpcParams) {
    return supabaseClient
        .rpc(rpcName, rpcParams);
}
