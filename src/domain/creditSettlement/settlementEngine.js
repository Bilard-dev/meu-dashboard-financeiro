/**
 * Motor Puro de Liquidação Antecipada do Crédito (Settlement Engine) — Fase 3.5
 * Módulo ES6 desacoplado de DOM, Supabase e Estado Global.
 */

import { getExpensesByCompetence } from '../competence/competenceEngine.js';

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

/**
 * Calcula a distribuição efetiva de saídas financeiras e obrigações por meio de pagamento
 * para uma competência, considerando despesas imediatas, compras em cartão e liquidações ativas.
 *
 * Garante a regra canônica:
 * Despesa Econômica (não duplica) != Saída Financeira Efetiva != Obrigação Residual do Cartão.
 *
 * @param {string} selectedYm - Competência no formato 'YYYY-M' (base 0) ou 'all'
 * @param {Array<object>} transactions - Lista de transações
 * @param {Array<object>|Map<string, object>} [settlements=[]] - Lista ou mapa de liquidações
 * @returns {{
 *   totalDespesaEconomica: number,
 *   totalSaidaFinanceira: number,
 *   obrigacaoCartaoTotal: number,
 *   byPaymentMethod: Record<string, number>,
 *   byCard: Record<string, number>
 * }}
 */
export function calculateEffectivePaymentOutflows(selectedYm, transactions = [], settlements = []) {
    const txs = Array.isArray(transactions) ? transactions : [];
    const setts = Array.isArray(settlements) ? settlements : (settlements instanceof Map ? Array.from(settlements.values()) : []);
    const settleMap = settlements instanceof Map ? settlements : createSettlementMap(setts);

    const expensesInMonth = getExpensesByCompetence(selectedYm, txs);
    const totalDespesaEconomica = expensesInMonth.reduce((acc, d) => acc + d.value, 0);

    const byPaymentMethod = {};
    const byCard = {};

    // 1. Processa as despesas da competência
    expensesInMonth.forEach(d => {
        const isCard = Boolean(d.cartao || d.pagamento === 'Cartão de Crédito');
        if (!isCard) {
            const meio = d.pagamento && d.pagamento.trim() !== '' ? d.pagamento : 'Não Informado';
            byPaymentMethod[meio] = (byPaymentMethod[meio] || 0) + d.value;
            return;
        }

        const pNum = d.parcelaNoMes || d.initAtual || 1;
        const settlement = (!d.isRecorrente) ? isInstallmentSettled(settleMap, d, pNum) : null;

        if (!settlement) {
            // Parcela NÃO liquidada: compõe obrigação aberta no cartão
            byPaymentMethod['Cartão de Crédito'] = (byPaymentMethod['Cartão de Crédito'] || 0) + d.value;
            const nomeCartao = d.cartao || 'Cartão';
            byCard[nomeCartao] = (byCard[nomeCartao] || 0) + d.value;
        } else {
            // Parcela LIQUIDADA: obrigação residual no cartão é R$ 0.
            const formaLiq = settlement.forma_liquidacao || 'PIX';
            if (selectedYm === 'all') {
                byPaymentMethod[formaLiq] = (byPaymentMethod[formaLiq] || 0) + d.value;
            } else {
                const liqDateStr = settlement.data_liquidacao;
                let liqYm = '';
                if (liqDateStr) {
                    if (typeof liqDateStr === 'string') {
                        const parts = liqDateStr.split(/[-/T ]/);
                        if (parts.length >= 2) {
                            const ly = parseInt(parts[0], 10);
                            const lm = parseInt(parts[1], 10);
                            if (!isNaN(ly) && !isNaN(lm)) {
                                liqYm = `${ly}-${lm - 1}`;
                            }
                        }
                    } else if (liqDateStr instanceof Date && !isNaN(liqDateStr.getTime())) {
                        liqYm = `${liqDateStr.getFullYear()}-${liqDateStr.getMonth()}`;
                    }
                }
                if (liqYm === selectedYm) {
                    byPaymentMethod[formaLiq] = (byPaymentMethod[formaLiq] || 0) + d.value;
                }
            }
        }
    });

    // 2. Se selectedYm for um mês específico, agrega liquidações ocorridas neste mês
    // que quitaram parcelas cuja competência de fatura era DIFERENTE deste mês
    if (selectedYm !== 'all') {
        setts.forEach(s => {
            if (!s) return;
            const isActive = (!s.status || s.status === 'ATIVA') && !s.cancelled_at;
            if (!isActive) return;

            const liqDateStr = s.data_liquidacao;
            if (!liqDateStr) return;

            let liqYm = '';
            if (typeof liqDateStr === 'string') {
                const parts = liqDateStr.split(/[-/T ]/);
                if (parts.length >= 2) {
                    const ly = parseInt(parts[0], 10);
                    const lm = parseInt(parts[1], 10);
                    if (!isNaN(ly) && !isNaN(lm)) {
                        liqYm = `${ly}-${lm - 1}`;
                    }
                }
            } else if (liqDateStr instanceof Date && !isNaN(liqDateStr.getTime())) {
                liqYm = `${liqDateStr.getFullYear()}-${liqDateStr.getMonth()}`;
            }

            if (liqYm === selectedYm) {
                const sNum = Number(s.parcela_numero) || 1;
                const alreadyComputed = expensesInMonth.some(d => {
                    const isCard = Boolean(d.cartao || d.pagamento === 'Cartão de Crédito');
                    if (!isCard || d.isRecorrente) return false;
                    const pNum = d.parcelaNoMes || d.initAtual || 1;
                    const matchTx = (s.transacao_id && d.id === s.transacao_id);
                    const matchGroup = (s.grupo_parcela_id && d.grupo_parcela_id === s.grupo_parcela_id);
                    return (matchTx || matchGroup) && sNum === pNum;
                });

                if (!alreadyComputed) {
                    const formaLiq = s.forma_liquidacao || 'PIX';
                    const val = Number(s.valor || s.value) || 0;
                    byPaymentMethod[formaLiq] = (byPaymentMethod[formaLiq] || 0) + val;
                }
            }
        });
    }

    const totalSaidaFinanceira = Object.values(byPaymentMethod).reduce((a, b) => a + b, 0);
    const obrigacaoCartaoTotal = byPaymentMethod['Cartão de Crédito'] || 0;

    return {
        totalDespesaEconomica,
        totalSaidaFinanceira,
        obrigacaoCartaoTotal,
        byPaymentMethod,
        byCard
    };
}

/**
 * Constrói a lista projetada de eventos financeiros combinando transações e liquidações ativas de crédito.
 * Para cada liquidação ativa, projeta um evento de saída financeira derivado na data_liquidacao,
 * permitindo que a movimentação real de caixa (ex: PIX) seja visualizada e filtrada no extrato/histórico
 * sem duplicar a despesa econômica original e sem inserir linhas sintéticas no banco de dados.
 *
 * @param {Array<object>} transactions - Lista de transações (globalData)
 * @param {Array<object>|Map<string, object>} settlements - Lista ou mapa de liquidações (globalCreditSettlements)
 * @param {object} [options={}] - Opções de filtro { selectedYm, typeFilter, searchText, startDate, endDate }
 * @returns {Array<object>} Lista ordenada e filtrada de eventos financeiros
 */
export function buildFinancialEvents(transactions = [], settlements = [], options = {}) {
    const txs = Array.isArray(transactions) ? transactions : [];
    const setts = Array.isArray(settlements) ? settlements : (settlements instanceof Map ? Array.from(settlements.values()) : []);
    const settleMap = settlements instanceof Map ? settlements : createSettlementMap(setts);

    const {
        selectedYm = 'all',
        typeFilter = 'ALL',
        searchText = '',
        startDate = null,
        endDate = null
    } = options;

    const events = [];

    // 1. Processa as transações normais
    txs.forEach(t => {
        const isCard = Boolean(t.cartao || t.pagamento === 'Cartão de Crédito');
        const pNum = t.parcelaNoMes || t.initAtual || 1;
        const settlement = (!t.isRecorrente) ? isInstallmentSettled(settleMap, t, pNum) : null;

        events.push({
            ...t,
            isSettlementEvent: false,
            isLiquidado: Boolean(settlement),
            liquidacao: settlement || null
        });
    });

    // 2. Projeta eventos financeiros derivados para liquidações ativas
    setts.forEach(s => {
        if (!s) return;
        const isActive = (!s.status || s.status === 'ATIVA') && !s.cancelled_at;
        if (!isActive) return;

        const liqDateStr = s.data_liquidacao || s.data || s.created_at;
        if (!liqDateStr) return;

        let parsedDate;
        let rawDate = '';
        let year = 0;
        let month = 0;

        if (typeof liqDateStr === 'string') {
            rawDate = liqDateStr.split('T')[0];
            const parts = rawDate.split(/[-/]/).map(Number);
            if (parts.length >= 3) {
                year = parts[0];
                month = parts[1] - 1;
                parsedDate = new Date(year, month, parts[2], 12, 0, 0);
            } else {
                parsedDate = new Date(liqDateStr);
                year = parsedDate.getFullYear();
                month = parsedDate.getMonth();
                rawDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;
            }
        } else if (liqDateStr instanceof Date) {
            parsedDate = liqDateStr;
            year = parsedDate.getFullYear();
            month = parsedDate.getMonth();
            rawDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;
        } else {
            return;
        }

        // Localiza a transação original correspondente para enriquecer metadados
        const sNum = Number(s.parcela_numero) || 1;
        const matchedTx = txs.find(t => {
            const matchTx = (s.transacao_id && t.id === s.transacao_id);
            const matchGroup = (s.grupo_parcela_id && t.grupo_parcela_id === s.grupo_parcela_id);
            return matchTx || matchGroup;
        });

        const val = Number(s.valor || s.value || (matchedTx ? matchedTx.value : 0)) || 0;
        const formaLiq = s.forma_liquidacao || 'PIX';
        const cardName = matchedTx ? (matchedTx.cartao || '') : '';
        const totalParcelas = matchedTx?.parcela && matchedTx.parcela.includes('/') ? matchedTx.parcela.split('/')[1] : '1';
        const parcelaStr = `${sNum}/${totalParcelas}`;

        const baseDesc = matchedTx ? (matchedTx.desc || matchedTx.descricao || '') : 'Cartão de Crédito';
        const desc = `Liquidação de Cartão • ${cardName ? cardName + ' ' : ''}(${parcelaStr}): ${baseDesc}`;

        events.push({
            id: `settlement_${s.id || (s.transacao_id + '_' + sNum)}`,
            settlement_id: s.id || null,
            transacao_id: s.transacao_id,
            grupo_parcela_id: s.grupo_parcela_id || null,
            isSettlementEvent: true,
            isLiquidado: true,
            type: 'DESPESA',
            rawTipo: 'Despesa',
            date: parsedDate,
            rawDate: rawDate,
            year: year,
            month: month,
            value: val,
            pagamento: formaLiq,
            cartao: cardName,
            parcela: parcelaStr,
            category: matchedTx ? (matchedTx.category || matchedTx.categoria || 'Cartão de Crédito') : 'Cartão de Crédito',
            subCat: matchedTx ? (matchedTx.subCat || matchedTx.subcategoria || 'Liquidação Antecipada') : 'Liquidação Antecipada',
            tags: matchedTx ? (matchedTx.tags || []) : ['Liquidação'],
            desc: desc,
            faturaDestino: null,
            status: s.status || 'ATIVA'
        });
    });

    // 3. Aplica filtros
    let filtered = events;

    // Filtro por Mês / Competência
    if (selectedYm && selectedYm !== 'all') {
        filtered = filtered.filter(e => `${e.year}-${e.month}` === selectedYm);
    }

    // Filtro por Intervalo de Datas
    if (startDate) {
        filtered = filtered.filter(e => e.rawDate >= startDate);
    }
    if (endDate) {
        filtered = filtered.filter(e => e.rawDate <= endDate);
    }

    // Filtro por Tipo (DESPESA, RECEITA, etc.)
    if (typeFilter && typeFilter !== 'ALL') {
        filtered = filtered.filter(e => e.type === typeFilter);
    }

    // Filtro textual
    if (searchText) {
        const norm = searchText.toLowerCase().trim();
        filtered = filtered.filter(e =>
            (e.desc || '').toLowerCase().includes(norm) ||
            (e.category || '').toLowerCase().includes(norm) ||
            (e.subCat || '').toLowerCase().includes(norm) ||
            (e.pagamento || '').toLowerCase().includes(norm) ||
            (e.cartao || '').toLowerCase().includes(norm) ||
            (e.tags || []).some(t => t.toLowerCase().includes(norm))
        );
    }

    // Ordenação padrão cronológica decrescente
    return filtered.sort((a, b) => b.date - a.date);
}
