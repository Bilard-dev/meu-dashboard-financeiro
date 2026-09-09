/**
 * Motor Puro de Competência Financeira e Alocação de Faturas — Base 3.0
 * Módulo ES6 desacoplado de DOM, Supabase e Estado Global.
 */

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

    // 2. Despesas em cartão de crédito (À vista, Parceladas, Recorrentes)
    const despesasCartao = transactions.filter(d =>
        d &&
        d.type === 'DESPESA' &&
        (d.cartao || d.pagamento === 'Cartão de Crédito')
    );

    const purchasesMap = new Map();
    const avistaItems = [];

    despesasCartao.forEach(item => {
        const pDate = new Date(item.rawDate + 'T12:00:00');
        const pYear = pDate.getFullYear();
        const pMonth = pDate.getMonth();

        let initAtual = 1, total = 1;
        let isParcelado = false;
        let isRecorrente = item.parcela === 'RECORRENTE';

        if (!isRecorrente && item.parcela && item.parcela.includes('/')) {
            const parts = item.parcela.split('/');
            initAtual = parseInt(parts[0]) || 1;
            total = parseInt(parts[1]) || 1;
            isParcelado = true;
        }

        if (isParcelado || isRecorrente) {
            const safeDesc = (item.desc || '').replace(/\[.*?\]/g, '').trim().toLowerCase().replace(/\s+/g, '');
            const safeCartao = (item.cartao || item.pagamento || '').trim().toLowerCase().replace(/\s+/g, '');
            const safeValue = Math.round(item.value);

            let key = '';
            if (item.grupo_parcela_id) {
                key = `GROUP_${item.grupo_parcela_id}`;
            } else if (isRecorrente) {
                key = `${safeDesc}_${safeCartao}_${safeValue}_REC`;
            } else {
                let faturaOffset = item.faturaDestino === 'PROXIMA' ? 1 : 0;
                if (item.faturaDestino && item.faturaDestino.includes('-')) {
                    const [absY, absM] = item.faturaDestino.split('-').map(Number);
                    faturaOffset = (absY * 12 + absM) - (pYear * 12 + pMonth);
                }

                let baseMonth = pMonth + faturaOffset;
                let baseYear = pYear;
                let originalMonth = baseMonth - (initAtual - 1);
                let originalYear = baseYear;
                while (originalMonth < 0) {
                    originalMonth += 12;
                    originalYear -= 1;
                }
                key = `${safeDesc}_${safeCartao}_${safeValue}_${total}_${originalYear}_${originalMonth}`;
            }

            if (!purchasesMap.has(key)) {
                purchasesMap.set(key, { ...item, initAtual, total, isParcelado, isRecorrente, seedDate: pDate });
            } else {
                const existing = purchasesMap.get(key);
                if (pDate < existing.seedDate) {
                    purchasesMap.set(key, { ...item, initAtual, total, isParcelado, isRecorrente, seedDate: pDate });
                }
            }
        } else {
            avistaItems.push({ ...item, initAtual, total, isParcelado, isRecorrente, seedDate: pDate });
        }
    });

    const baseItemsToProject = [...Array.from(purchasesMap.values()), ...avistaItems];
    const cardExpensesInMonth = [];

    baseItemsToProject.forEach(item => {
        const pDate = new Date(item.rawDate + 'T12:00:00');
        const pYear = pDate.getFullYear();
        let pMonth = pDate.getMonth();

        let faturaOffset = item.faturaDestino === 'PROXIMA' ? 1 : 0;
        if (item.faturaDestino && item.faturaDestino.includes('-')) {
            const [absY, absM] = item.faturaDestino.split('-').map(Number);
            faturaOffset = (absY * 12 + absM) - (pYear * 12 + pMonth);
        }

        pMonth += faturaOffset;

        const deltaTarget = (targetYear * 12 + targetMonth) - (pYear * 12 + pMonth);
        const parcelaNoMesTarget = item.initAtual + deltaTarget;

        const pertenceNoMesTarget = item.isRecorrente
            ? (deltaTarget >= 0)
            : (item.isParcelado ? (parcelaNoMesTarget >= 1 && parcelaNoMesTarget <= item.total) : (deltaTarget === 0));

        if (pertenceNoMesTarget) {
            cardExpensesInMonth.push({
                ...item,
                parcelaExibida: item.isRecorrente ? '🔄 Recorrente' : (item.isParcelado ? `${parcelaNoMesTarget}/${item.total}` : 'À vista'),
                parcelaNoMes: parcelaNoMesTarget
            });
        }
    });

    return [...immediate, ...cardExpensesInMonth];
}
