/**
 * Calculadora Pura de Faturas e Parcelamentos de Cartão de Crédito — Base 3.0
 * Módulo ES6 desacoplado de DOM, Supabase e Estado Global.
 */

/**
 * Agrupa compras de cartão de crédito identificando sementes de parcelamentos,
 * assinaturas recorrentes e itens à vista.
 *
 * @param {Array<object>} transactions - Lista de transações brutas
 * @returns {Array<object>} Lista de itens-base agrupados prontos para projeção
 */
export function groupCreditCardPurchases(transactions) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return [];
    }

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
            initAtual = parseInt(parts[0], 10) || 1;
            total = parseInt(parts[1], 10) || 1;
            isParcelado = true;
        }

        if (isParcelado || isRecorrente) {
            const safeDesc = (item.desc || '').replace(/\[.*?\]/g, '').trim().toLowerCase().replace(/\s+/g, '');
            const safeCartao = (item.cartao || item.pagamento || '').trim().toLowerCase().replace(/\s+/g, '');
            const safeValue = Math.round(item.value);

            let key = '';
            if (item.grupo_parcela_id) {
                // Parcelamentos 2.0: Agrupamento exato por UUID
                key = `GROUP_${item.grupo_parcela_id}`;
            } else if (isRecorrente) {
                key = `${safeDesc}_${safeCartao}_${safeValue}_REC`;
            } else {
                // Legado: fallback para agrupamento heurístico por chave composta
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

    return [...Array.from(purchasesMap.values()), ...avistaItems];
}

/**
 * Projeta os lançamentos de cartão de crédito que pertencem a uma competência específica (targetYear, targetMonth).
 *
 * @param {number} targetYear - Ano da competência
 * @param {number} targetMonth - Mês da competência (base 0)
 * @param {Array<object>} baseItemsToProject - Itens agrupados por groupCreditCardPurchases
 * @returns {Array<object>} Lista de despesas pertencentes à competência alvo
 */
export function projectCardExpensesForCompetence(targetYear, targetMonth, baseItemsToProject) {
    if (!Array.isArray(baseItemsToProject) || baseItemsToProject.length === 0) {
        return [];
    }

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

    return cardExpensesInMonth;
}

/**
 * Calcula o resumo consolidado da fatura de cartão de crédito para uma competência informada.
 * Calcula totais da fatura selecionada, fatura seguinte, saldo devedor restante futuro,
 * itens da fatura com metadados e participação por cartão.
 *
 * @param {string} selectedYm - Competência no formato 'YYYY-M' (base 0)
 * @param {Array<object>} transactions - Lista de transações brutas
 * @returns {object} Resumo financeiro puro da fatura
 */
export function calculateInvoiceSummary(selectedYm, transactions) {
    if (!selectedYm || typeof selectedYm !== 'string' || !selectedYm.includes('-')) {
        return {
            targetYear: 0,
            targetMonth: 0,
            nextYear: 0,
            nextMonth: 0,
            totalFaturaSelecionada: 0,
            totalFaturaSeguinte: 0,
            totalRestanteFuturo: 0,
            itemsNoMes: [],
            cartoesMap: {}
        };
    }

    const [targetYear, targetMonth] = selectedYm.split('-').map(Number);
    if (isNaN(targetYear) || isNaN(targetMonth)) {
        return {
            targetYear: 0,
            targetMonth: 0,
            nextYear: 0,
            nextMonth: 0,
            totalFaturaSelecionada: 0,
            totalFaturaSeguinte: 0,
            totalRestanteFuturo: 0,
            itemsNoMes: [],
            cartoesMap: {}
        };
    }

    const nextMonthDate = new Date(targetYear, targetMonth + 1, 1);
    const nextYear = nextMonthDate.getFullYear();
    const nextMonth = nextMonthDate.getMonth();

    const baseItemsToProject = groupCreditCardPurchases(transactions);

    let totalFaturaSelecionada = 0;
    let totalFaturaSeguinte = 0;
    let totalRestanteFuturo = 0;
    const itemsNoMes = [];

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
        const deltaNext = (nextYear * 12 + nextMonth) - (pYear * 12 + pMonth);

        const parcelaNoMesTarget = item.initAtual + deltaTarget;
        const parcelaNoMesNext = item.initAtual + deltaNext;

        const pertenceNoMesTarget = item.isRecorrente
            ? (deltaTarget >= 0)
            : (item.isParcelado ? (parcelaNoMesTarget >= 1 && parcelaNoMesTarget <= item.total) : (deltaTarget === 0));

        const pertenceNoMesNext = item.isRecorrente
            ? (deltaNext >= 0)
            : (item.isParcelado ? (parcelaNoMesNext >= 1 && parcelaNoMesNext <= item.total) : (deltaNext === 0));

        if (pertenceNoMesTarget) {
            totalFaturaSelecionada += item.value;
            itemsNoMes.push({
                ...item,
                parcelaExibida: item.isRecorrente ? '🔄 Recorrente' : (item.isParcelado ? `${parcelaNoMesTarget}/${item.total}` : 'À vista'),
                parcelaNoMes: parcelaNoMesTarget,
                restanteAposEsteMes: item.isRecorrente ? 0 : Math.max(0, item.total - parcelaNoMesTarget) * item.value
            });
        }

        if (pertenceNoMesNext) {
            totalFaturaSeguinte += item.value;
        }

        if (!item.isRecorrente) {
            let parcelasAposEsteMes = 0;
            if (deltaTarget < 0) {
                parcelasAposEsteMes = item.total;
            } else if (parcelaNoMesTarget <= item.total) {
                parcelasAposEsteMes = Math.max(0, item.total - parcelaNoMesTarget);
            }
            totalRestanteFuturo += (parcelasAposEsteMes * item.value);
        }
    });

    const cartoesMap = {};
    itemsNoMes.forEach(item => {
        const nomeCartao = item.cartao || 'Cartão';
        cartoesMap[nomeCartao] = (cartoesMap[nomeCartao] || 0) + item.value;
    });

    return {
        targetYear,
        targetMonth,
        nextYear,
        nextMonth,
        totalFaturaSelecionada,
        totalFaturaSeguinte,
        totalRestanteFuturo,
        itemsNoMes,
        cartoesMap
    };
}
