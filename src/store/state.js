/**
 * Gerenciamento de Estado Centralizado — Base 3.0
 * Módulo ES6 desacoplado de dependências externas.
 */

// Estado interno encapsulado
const state = {
    ui: {
        isPrivacyMode: false,
        isRoutingSync: false,
        pendingRenameData: null,
        filteredExtratoData: []
    },
    catalogs: {
        customInvestmentCategoryNames: new Set()
    }
};

/* ==========================================================================
   Modo de Privacidade (UI)
   ========================================================================== */

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

/* ==========================================================================
   Sincronização de Roteamento SPA (UI)
   ========================================================================== */

/**
 * Obtém a flag de sincronização de rota.
 * @returns {boolean}
 */
export function getRoutingSync() {
    return state.ui.isRoutingSync;
}

/**
 * Define a flag de sincronização de rota.
 * @param {boolean} value
 */
export function setRoutingSync(value) {
    state.ui.isRoutingSync = Boolean(value);
}

/* ==========================================================================
   Renomeação com Histórico de Catálogos (UI)
   ========================================================================== */

/**
 * Obtém os dados pendentes de renomeação no modal.
 * @returns {object | null}
 */
export function getPendingRenameData() {
    return state.ui.pendingRenameData;
}

/**
 * Define os dados pendentes de renomeação no modal.
 * @param {object | null} data
 */
export function setPendingRenameData(data) {
    state.ui.pendingRenameData = data;
}

/**
 * Limpa os dados pendentes de renomeação.
 */
export function clearPendingRenameData() {
    state.ui.pendingRenameData = null;
}

/* ==========================================================================
   Filtro da Aba Extrato / Análise de Gastos (UI / View)
   ========================================================================== */

/**
 * Obtém o array atualmente filtrado na visualização do extrato.
 * @returns {object[]}
 */
export function getFilteredExtratoData() {
    return state.ui.filteredExtratoData;
}

/**
 * Define o array atualmente filtrado na visualização do extrato.
 * @param {object[]} data
 */
export function setFilteredExtratoData(data) {
    state.ui.filteredExtratoData = Array.isArray(data) ? data : [];
}

/* ==========================================================================
   Categorias de Investimento Personalizadas (Catálogos)
   ========================================================================== */

/**
 * Obtém o conjunto de categorias personalizadas de investimento.
 * @returns {Set<string>}
 */
export function getCustomInvestmentCategoryNames() {
    return state.catalogs.customInvestmentCategoryNames;
}

/**
 * Adiciona uma categoria personalizada ao conjunto de investimentos.
 * @param {string} normName - Nome normalizado da categoria
 */
export function addCustomInvestmentCategoryName(normName) {
    if (normName) {
        state.catalogs.customInvestmentCategoryNames.add(normName);
    }
}

/**
 * Verifica se uma categoria normalizada é de investimento customizado.
 * @param {string} normName - Nome normalizado da categoria
 * @returns {boolean}
 */
export function hasCustomInvestmentCategoryName(normName) {
    return state.catalogs.customInvestmentCategoryNames.has(normName);
}

/**
 * Reseta o conjunto de categorias de investimento personalizadas.
 */
export function resetCustomInvestmentCategoryNames() {
    state.catalogs.customInvestmentCategoryNames.clear();
}
