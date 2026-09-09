/**
 * Motor Puro de Competência Financeira e Alocação de Faturas — Base 3.0
 * Módulo ES6 desacoplado de DOM, Supabase e Estado Global.
 */

import { groupCreditCardPurchases, projectCardExpensesForCompetence } from '../creditCard/invoiceCalculator.js';

/**
 * Obtém todas as despesas financeiras pertencentes a uma competência de fatura/mês.
 * Aloca despesas imediatas no mês da compra e despesas de cartão de crédito na fatura de destino.
 *
 * @param {string} selectedYm - Chave da competência 'YYYY-M' (base 0) ou 'all'
 * @param {Array<object>} transactions - Lista de transações
 * @returns {Array<object>} Lista de despesas pertencentes à competência informada
 */
export function getExpensesByCompetence(selectedYm, transactions) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return [];
    }

    if (selectedYm === 'all') {
        return transactions.filter(d => d && d.type === 'DESPESA');
    }

    if (!selectedYm || typeof selectedYm !== 'string' || !selectedYm.includes('-')) {
        return [];
    }

    const [targetYear, targetMonth] = selectedYm.split('-').map(Number);
    if (isNaN(targetYear) || isNaN(targetMonth)) {
        return [];
    }

    // 1. Despesas imediatas (não-cartão) que ocorreram no mês selecionado
    const immediate = transactions.filter(d =>
        d &&
        d.type === 'DESPESA' &&
        d.pagamento !== 'Cartão de Crédito' &&
        !d.cartao &&
        `${d.year}-${d.month}` === selectedYm
    );

    // 2. Despesas em cartão de crédito alocadas na competência
    const baseItemsToProject = groupCreditCardPurchases(transactions);
    const cardExpensesInMonth = projectCardExpensesForCompetence(targetYear, targetMonth, baseItemsToProject);

    return [...immediate, ...cardExpensesInMonth];
}
