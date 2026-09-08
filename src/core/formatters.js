/**
 * Utilitários Puros de Formatação — Base 3.0
 * Módulo ES6 desacoplado de DOM, Supabase e Estado Global.
 */

import { MONTH_NAMES_BR, parseLocalDate, addMonths } from './dateUtils.js';

/**
 * Formata um valor numérico para o padrão de moeda brasileira (BRL).
 * Suporta modo de privacidade para mascarar valores.
 * @param {number} val 
 * @param {boolean} [isPrivacy=false] 
 * @returns {string}
 */
export function formatCurrency(val, isPrivacy = false) {
    if (isPrivacy) return 'R$ ****,**';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata o badge visual da fatura de destino de um lançamento de cartão.
 * Exemplo: 'Fatura Agosto/2026'
 * @param {object} item Objeto do lançamento com { pagamento, cartao, rawDate, faturaDestino }
 * @returns {string}
 */
export function formatFaturaBadge(item) {
    if (!item || (item.pagamento !== 'Cartão de Crédito' && !item.cartao)) return '';
    const rawDate = item.rawDate || (typeof item.data === 'string' ? item.data : '');
    if (!rawDate) return '';

    const pDate = parseLocalDate(rawDate) || new Date();
    const pYear = pDate.getFullYear();
    const pMonth = pDate.getMonth();

    let faturaOffset = item.faturaDestino === 'PROXIMA' ? 1 : 0;
    if (item.faturaDestino && item.faturaDestino.includes('-')) {
        const [absY, absM] = item.faturaDestino.split('-').map(Number);
        faturaOffset = (absY * 12 + absM) - (pYear * 12 + pMonth);
    }

    const { year: fYear, month: fMonth } = addMonths(pYear, pMonth, faturaOffset);
    return `Fatura ${MONTH_NAMES_BR[fMonth]}/${fYear}`;
}
