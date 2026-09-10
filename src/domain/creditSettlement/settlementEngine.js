/**
 * Motor Puro de Liquidação Antecipada do Crédito (Settlement Engine) — Fase 3.5
 * Módulo ES6 desacoplado de DOM, Supabase e Estado Global.
 */

/**
 * Constrói uma chave única determinística para identificar a liquidação de uma parcela de transação.
 * @param {string} idOrGroupId - UUID da transação ou do grupo_parcela_id
 * @param {number} [parcelaNumero=1] - Número da parcela (1 para à vista)
 * @returns {string} Chave única composta
 */
export function buildSettlementKey(idOrGroupId, parcelaNumero = 1) {
    if (!idOrGroupId) return '';
    return `${idOrGroupId}_${Number(parcelaNumero) || 1}`;
}

/**
 * Constrói um Mapa de busca indexado em O(1) a partir da lista de liquidações ativas.
 * Indexa tanto por transacao_id quanto por grupo_parcela_id (se houver) para garantir
 * resolução canônica independente da semente do parcelamento.
 * Ignora liquidações canceladas (soft reversal).
 *
 * @param {Array<object>} settlements - Lista de liquidações do banco de dados
 * @returns {Map<string, object>} Mapa indexado por buildSettlementKey
 */
export function createSettlementMap(settlements) {
    const map = new Map();
    if (!Array.isArray(settlements) || settlements.length === 0) {
        return map;
    }

    settlements.forEach(s => {
        if (!s) return;
        // Filtra apenas liquidações ativas (não canceladas)
        if (s.status && s.status !== 'ATIVA') return;
        if (s.cancelled_at) return;

        const pNum = Number(s.parcela_numero) || 1;

        // 1. Indexação por transacao_id
        if (s.transacao_id) {
            const keyTx = buildSettlementKey(s.transacao_id, pNum);
            if (keyTx && !map.has(keyTx)) {
                map.set(keyTx, s);
            }
        }

        // 2. Indexação canônica por grupo_parcela_id (se presente)
        if (s.grupo_parcela_id) {
            const keyGroup = buildSettlementKey(s.grupo_parcela_id, pNum);
            if (keyGroup && !map.has(keyGroup)) {
                map.set(keyGroup, s);
            }
        }
    });

    return map;
}

/**
 * Verifica se uma parcela ou compra à vista específica está liquidada antecipadamente.
 * Recorrentes (RECORRENTE) nunca são liquidadas sem identidade mensal finita.
 *
 * @param {Map<string, object>|Array<object>} settlementMapOrList - Mapa ou Array de liquidações
 * @param {object|string} itemOrId - Objeto do item ou UUID da transação / grupo
 * @param {number} [parcelaNumero=1] - Número da parcela
 * @returns {object|null} Objeto da liquidação se quitada, ou null se pendente
 */
export function isInstallmentSettled(settlementMapOrList, itemOrId, parcelaNumero = 1) {
    if (!itemOrId) return null;

    // Se for objeto de item e for assinatura recorrente, não permite liquidação
    if (typeof itemOrId === 'object' && itemOrId.isRecorrente) {
        return null;
    }

    const pNum = Number(parcelaNumero) || 1;
    const transacaoId = typeof itemOrId === 'object' ? itemOrId.id : itemOrId;
    const grupoId = (typeof itemOrId === 'object' && itemOrId.grupo_parcela_id) ? itemOrId.grupo_parcela_id : null;

    if (settlementMapOrList instanceof Map) {
        // Prioridade 1: grupo_parcela_id
        if (grupoId) {
            const groupKey = buildSettlementKey(grupoId, pNum);
            const foundByGroup = settlementMapOrList.get(groupKey);
            if (foundByGroup) return foundByGroup;
        }

        // Prioridade 2: transacao_id
        if (transacaoId) {
            const txKey = buildSettlementKey(transacaoId, pNum);
            return settlementMapOrList.get(txKey) || null;
        }

        return null;
    }

    if (Array.isArray(settlementMapOrList)) {
        return settlementMapOrList.find(s => {
            if (!s) return false;
            if (s.status && s.status !== 'ATIVA') return false;
            if (s.cancelled_at) return false;

            const sNum = Number(s.parcela_numero) || 1;
            if (sNum !== pNum) return false;

            if (grupoId && s.grupo_parcela_id && s.grupo_parcela_id === grupoId) {
                return true;
            }

            return s.transacao_id && s.transacao_id === transacaoId;
        }) || null;
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
        const settlement = isInstallmentSettled(settleMap, item, pNum);

        return {
            ...item,
            isLiquidado: Boolean(settlement),
            liquidacao: settlement || null
        };
    });
}

/**
 * Valida o payload de uma liquidação contra o item projetado original.
 * Garante quitação integral exata, bloqueia valores negativos/divergentes e métodos inválidos.
 *
 * @param {object} payload - Payload enviado para inserção/atualização
 * @param {object} item - Item original projetado
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateSettlementPayload(payload, item) {
    if (!payload || !item) {
        return { valid: false, error: 'Dados da liquidação ou do lançamento ausentes.' };
    }

    if (item.isRecorrente) {
        return { valid: false, error: 'Despesas recorrentes não possuem identidade finita para liquidação antecipada.' };
    }

    const val = Number(payload.valor);
    if (!val || isNaN(val) || val <= 0) {
        return { valid: false, error: 'O valor da liquidação deve ser positivo maior que zero.' };
    }

    const expectedVal = Math.round(Number(item.value) * 100) / 100;
    const roundedVal = Math.round(val * 100) / 100;
    if (Math.abs(roundedVal - expectedVal) > 0.01) {
        return {
            valid: false,
            error: `Quitação integral obrigatória: o valor informado (R$ ${roundedVal.toFixed(2)}) diverge do valor da parcela (R$ ${expectedVal.toFixed(2)}).`
        };
    }

    const pNum = (payload.parcela_numero !== undefined && payload.parcela_numero !== null) ? Number(payload.parcela_numero) : 1;
    const maxP = Number(item.total) || 1;
    if (isNaN(pNum) || pNum < 1 || pNum > maxP) {
        return { valid: false, error: `Número da parcela (${pNum}) inválido para este parcelamento (total: ${maxP}).` };
    }

    const formasValidas = ['PIX', 'Transferência Bancária', 'Saldo em Conta'];
    if (!payload.forma_liquidacao || !formasValidas.includes(payload.forma_liquidacao)) {
        return { valid: false, error: `Forma de liquidação inválida: "${payload.forma_liquidacao}". Opções permitidas: ${formasValidas.join(', ')}.` };
    }

    return { valid: true };
}
