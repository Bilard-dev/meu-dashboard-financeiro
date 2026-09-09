/**
 * Motor Puro de Previsão Financeira 2.0 (Forecast Engine) — Base 3.0
 * Módulo ES6 desacoplado de DOM, Supabase e Estado Global.
 */

import { getExpensesByCompetence } from '../competence/competenceEngine.js';
import { MONTH_NAMES_BR } from '../../core/dateUtils.js';

/**
 * Calcula a previsão financeira e comprometimento orçamentário para um horizonte de meses.
 * Agrega despesas alocadas por competência (cartão, parcelas, recorrentes, outros),
 * breakdown por cartão e categoria, e receitas/aportes confirmados.
 *
 * @param {string} startYm - Mês inicial no formato 'YYYY-M' (base 0) ou 'all'/null para o mês atual
 * @param {number} horizonMonths - Quantidade de meses a projetar (padrão: 6)
 * @param {Array<object>} transactions - Lista de transações brutas
 * @returns {Array<object>} Lista estruturada de dados de projeção por mês
 */
export function calculateFinancialForecast(startYm, horizonMonths = 6, transactions = []) {
    const txs = Array.isArray(transactions) ? transactions : [];
    const horizon = typeof horizonMonths === 'number' && horizonMonths > 0 ? horizonMonths : 6;

    let startYear, startMonth;
    if (startYm && typeof startYm === 'string' && startYm !== 'all' && startYm.includes('-')) {
        const parts = startYm.split('-').map(Number);
        if (!isNaN(parts[0]) && !isNaN(parts[1])) {
            startYear = parts[0];
            startMonth = parts[1];
        } else {
            const now = new Date();
            startYear = now.getFullYear();
            startMonth = now.getMonth();
        }
    } else {
        const now = new Date();
        startYear = now.getFullYear();
        startMonth = now.getMonth();
    }

    const months = [];

    for (let i = 0; i < horizon; i++) {
        const d = new Date(startYear, startMonth + i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        const ymKey = `${y}-${m}`;

        // Reutilização do motor financeiro central de competência
        const items = getExpensesByCompetence(ymKey, txs);

        // Cálculo algébrico de total comprometido (estornos / valores negativos reduzem o total)
        const totalComprometido = items.reduce((acc, item) => acc + item.value, 0);

        const cartaoItems = items.filter(item => item.cartao || item.pagamento === 'Cartão de Crédito');
        const parcelasItems = items.filter(item => item.isParcelado);
        const recorrentesItems = items.filter(item => item.isRecorrente);
        const outrosItems = items.filter(item => !item.cartao && item.pagamento !== 'Cartão de Crédito' && !item.isParcelado && !item.isRecorrente);

        // Breakdown por cartão
        const byCard = {};
        cartaoItems.forEach(item => {
            const cardName = item.cartao || 'Cartão';
            byCard[cardName] = (byCard[cardName] || 0) + item.value;
        });

        // Breakdown por categoria
        const byCategory = {};
        items.forEach(item => {
            const catName = item.category || 'Outros';
            byCategory[catName] = (byCategory[catName] || 0) + item.value;
        });

        // Receitas e Investimentos futuros confirmados (explícitos no banco)
        const receitasConfirmadas = txs
            .filter(d => d && d.type === 'RECEITA' && `${d.year}-${d.month}` === ymKey)
            .reduce((acc, d) => acc + d.value, 0);

        const investimentosConfirmados = txs
            .filter(d => d && d.type === 'INVESTIMENTO' && `${d.year}-${d.month}` === ymKey)
            .reduce((acc, d) => acc + d.value, 0);

        months.push({
            index: i,
            isCurrentMonth: (i === 0),
            year: y,
            month: m,
            yearMonth: ymKey,
            label: `${MONTH_NAMES_BR[m]}/${y}`,
            shortLabel: `${MONTH_NAMES_BR[m].substring(0, 3).toUpperCase()}/${String(y).slice(-2)}`,
            totalComprometido,
            totalCartao: cartaoItems.reduce((acc, d) => acc + d.value, 0),
            totalParcelas: parcelasItems.reduce((acc, d) => acc + d.value, 0),
            totalRecorrentes: recorrentesItems.reduce((acc, d) => acc + d.value, 0),
            totalOutros: outrosItems.reduce((acc, d) => acc + d.value, 0),
            receitasConfirmadas,
            investimentosConfirmados,
            byCard,
            byCategory,
            items
        });
    }

    return months;
}
