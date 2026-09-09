/**
 * Motor Puro de Liquidação Antecipada do Crédito (Settlement Engine) — Fase 3.5
 * Módulo ES6 desacoplado de DOM, Supabase e Estado Global.
 */

/**
 * Constrói uma chave única determinística para identificar a liquidação de uma parcela de transação.
 * @param {string} transacaoId - UUID da transação original
 * @param {number} [parcelaNumero=1] - Número da parcela (1 para à vista)
 * @returns {string} Chave única composta
 */
export function buildSettlementKey(transacaoId, parcelaNumero = 1) {
    if (!transacaoId) return '';
    return `${transacaoId}_${Number(parcelaNumero) || 1}`;
}

/**
 * Constrói um Mapa de busca indexado em O(1) a partir da lista de liquidações.
 * @param {Array<object>} settlements - Lista de liquidações do banco de dados
 * @returns {Map<string, object>} Mapa indexado por buildSettlementKey
 */
export function createSettlementMap(settlements) {
    const map = new Map();
    if (!Array.isArray(settlements) || settlements.length === 0) {
        return map;
    }

    settlements.forEach(s => {
        if (!s || !s.transacao_id) return;
        const key = buildSettlementKey(s.transacao_id, s.parcela_numero);
        if (key && !map.has(key)) {
            map.set(key, s);
        }
    });

    return map;
}

/**
 * Verifica se uma parcela ou compra à vista específica está liquidada antecipadamente.
 * @param {Map<string, object>|Array<object>} settlementMapOrList - Mapa ou Array de liquidações
 * @param {string} transacaoId - UUID da transação
 * @param {number} [parcelaNumero=1] - Número da parcela
 * @returns {object|null} Objeto da liquidação se quitada, ou null se pendente
 */
export function isInstallmentSettled(settlementMapOrList, transacaoId, parcelaNumero = 1) {
    if (!transacaoId) return null;

    if (settlementMapOrList instanceof Map) {
        const key = buildSettlementKey(transacaoId, parcelaNumero);
        return settlementMapOrList.get(key) || null;
    }

    if (Array.isArray(settlementMapOrList)) {
        const num = Number(parcelaNumero) || 1;
        const found = settlementMapOrList.find(s =>
            s &&
            s.transacao_id === transacaoId &&
            (Number(s.parcela_numero) || 1) === num
        );
        return found || null;
    }

    return null;
}

/**
 * Enriquece uma lista de itens projetados de cartão com o status de liquidação.
 * @param {Array<object>} items - Lista de itens projetados
 * @param {Map<string, object>|Array<object>} settlements - Mapa ou lista de liquidações
 * @returns {Array<object>} Lista de itens enriquecidos
 */
export function enrichItemsWithSettlement(items, settlements) {
    if (!Array.isArray(items) || items.length === 0) {
        return [];
    }

    const settleMap = settlements instanceof Map ? settlements : createSettlementMap(settlements);

    return items.map(item => {
        const pNum = item.parcelaNoMes || item.initAtual || 1;
        const settlement = isInstallmentSettled(settleMap, item.id, pNum);

        return {
            ...item,
            isLiquidado: Boolean(settlement),
            liquidacao: settlement || null
        };
    });
}
