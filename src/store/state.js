/**
 * Gerenciamento de Estado Centralizado — Base 3.0
 * Módulo ES6 desacoplado de dependências externas.
 */

// Estado interno encapsulado
const state = {
    ui: {
        isPrivacyMode: false
    }
};

/**
 * Obtém o valor atual do modo de privacidade.
 * @returns {boolean}
 */
export function getPrivacyMode() {
    return state.ui.isPrivacyMode;
}

/**
 * Define o valor do modo de privacidade.
 * @param {boolean} value
 */
export function setPrivacyMode(value) {
    state.ui.isPrivacyMode = Boolean(value);
}

/**
 * Alterna o modo de privacidade e retorna o novo estado.
 * @returns {boolean}
 */
export function togglePrivacyMode() {
    state.ui.isPrivacyMode = !state.ui.isPrivacyMode;
    return state.ui.isPrivacyMode;
}
