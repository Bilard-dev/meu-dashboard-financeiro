/**
 * Calculador Puro de Saldo de Dinheiro Físico (Espécie) — Base 3.0
 * Módulo ES6 desacoplado de DOM, Supabase e Estado Global.
 */

/**
 * Calcula o saldo acumulado de dinheiro físico (espécie) a partir da lista de transações.
 * Regra contábil: Saldo Espécie = Total de Saques - Total de Despesas pagas em dinheiro físico.
 *
 * @param {Array<object>} transactions - Lista de transações
 * @returns {{ totalSaques: number, totalGastoEspecie: number, saldoDinheiroVivo: number }}
 */
export function calculateCashBalance(transactions) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return {
            totalSaques: 0,
            totalGastoEspecie: 0,
            saldoDinheiroVivo: 0
        };
    }

    let totalSaques = 0;
    let totalGastoEspecie = 0;

    for (let i = 0; i < transactions.length; i++) {
        const d = transactions[i];
        if (!d) continue;

        const rawType = d.type || d.tipo || '';
        const typeUpper = typeof rawType === 'string' ? rawType.toUpperCase() : '';
        const val = typeof d.value === 'number' ? d.value : (parseFloat(d.valor) || 0);
        const pagamento = d.pagamento || '';

        if (typeUpper === 'SAQUE') {
            totalSaques += val;
        } else if (typeUpper === 'DESPESA' && (pagamento === 'Dinheiro' || pagamento === 'Dinheiro Vivo (Espécie)')) {
            totalGastoEspecie += val;
        }
    }

    const saldoDinheiroVivo = totalSaques - totalGastoEspecie;

    return {
        totalSaques,
        totalGastoEspecie,
        saldoDinheiroVivo
    };
}
