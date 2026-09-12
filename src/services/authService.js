/**
 * Serviço de Autenticação — Base 3.0
 * Wrappers puros e desacoplados do Supabase Auth.
 */

import { supabaseClient } from './supabaseClient.js';

/**
 * Obtém a sessão ativa atual do usuário.
 * @returns {Promise<{ data: { session: object | null }, error: object | null }>}
 */
export function getSession() {
    return supabaseClient.auth.getSession();
}

/**
 * Autentica o usuário com email e senha.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ data: object, error: object | null }>}
 */
export function signIn(email, password) {
    return supabaseClient.auth.signInWithPassword({ email, password });
}

/**
 * Cadastra um novo usuário com email e senha.
 * @param {string} email
 * @param {string} password
 * @param {object} [options]
 * @returns {Promise<{ data: object, error: object | null }>}
 */
export function signUp(email, password, options) {
    return supabaseClient.auth.signUp({
        email,
        password,
        ...(options ? { options } : {})
    });
}

/**
 * Encerra a sessão ativa do usuário.
 * @returns {Promise<{ error: object | null }>}
 */
export function signOut() {
    return supabaseClient.auth.signOut();
}

/**
 * Atualiza a senha do usuário atualmente autenticado.
 * @param {string} password
 * @returns {Promise<{ data: object, error: object | null }>}
 */
export function updatePassword(password) {
    return supabaseClient.auth.updateUser({ password });
}

/**
 * Solicita redefinição de senha para o email informado.
 * @param {string} email
 * @param {object} [options]
 * @returns {Promise<{ data: object, error: object | null }>}
 */
export function requestPasswordReset(email, options) {
    return supabaseClient.auth.resetPasswordForEmail(email, options);
}

/**
 * Registra um callback para mudanças de estado de autenticação (ex: PASSWORD_RECOVERY, SIGNED_IN).
 * @param {(event: string, session: object | null) => void} callback
 * @returns {{ data: { subscription: object } }}
 */
export function onAuthStateChange(callback) {
    return supabaseClient.auth.onAuthStateChange(callback);
}
