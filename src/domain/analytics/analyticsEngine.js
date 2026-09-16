/**
 * Motor Puro de Médias Financeiras e Análise Comparativa — Fase 4.7-A
 * Módulo ES6 desacoplado de DOM, Supabase e Estado Global.
 */

import { normalizeCatalogName } from '../../core/textUtils.js';

/**
 * Determina o número de meses civis e dias de um período especificado.
 * O divisor mensal conta meses civis mesmo sem gastos (regra canônica).
 *
 * @param {string} periodVal - 'current_month', 'last_month', 'last_3_months', 'last_6_months', 'current_year', 'custom', 'all' ou 'YYYY-M'
 * @param {object} [options={}] - Parâmetros opcionais: dataInicioVal, dataFimVal, now, transactions
 * @returns {{ numMeses: number, numDias: number }}
 */
export function calculatePeriodDivisors(periodVal, options = {}) {
    const now = options.now instanceof Date ? options.now : new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth();
    const txs = Array.isArray(options.transactions) ? options.transactions : [];

    let numMeses = 1;
    let numDias = 30;

    if (periodVal === 'current_month') {
        numMeses = 1;
        numDias = Math.max(1, now.getDate());
    } else if (periodVal === 'last_month') {
        numMeses = 1;
        const lastMDate = new Date(currYear, currMonth, 0);
        numDias = Math.max(1, lastMDate.getDate());
    } else if (periodVal === 'last_3_months') {
        numMeses = 3;
        numDias = 90;
    } else if (periodVal === 'last_6_months') {
        numMeses = 6;
        numDias = 180;
    } else if (periodVal === 'current_year') {
        numMeses = currMonth + 1;
        const startOfYear = new Date(currYear, 0, 1);
        numDias = Math.max(1, Math.round((now - startOfYear) / (1000 * 60 * 60 * 24)) + 1);
    } else if (periodVal === 'custom') {
        const { dataInicioVal, dataFimVal } = options;
        if (dataInicioVal && dataFimVal) {
            const dStart = new Date(dataInicioVal + 'T12:00:00');
            const dEnd = new Date(dataFimVal + 'T12:00:00');
            if (!isNaN(dStart.getTime()) && !isNaN(dEnd.getTime()) && dEnd >= dStart) {
                const diffMonths = (dEnd.getFullYear() - dStart.getFullYear()) * 12 + (dEnd.getMonth() - dStart.getMonth()) + 1;
                numMeses = Math.max(1, diffMonths);
                const diffDays = Math.round((dEnd - dStart) / (1000 * 60 * 60 * 24)) + 1;
                numDias = Math.max(1, diffDays);
            }
        } else if (dataInicioVal) {
            const dStart = new Date(dataInicioVal + 'T12:00:00');
            if (!isNaN(dStart.getTime())) {
                const diffMonths = (currYear - dStart.getFullYear()) * 12 + (currMonth - dStart.getMonth()) + 1;
                numMeses = Math.max(1, diffMonths);
                const diffDays = Math.round((now - dStart) / (1000 * 60 * 60 * 24)) + 1;
                numDias = Math.max(1, diffDays);
            }
        } else {
            const uniqueYm = new Set(txs.map(d => `${d.year}-${d.month}`));
            numMeses = Math.max(1, uniqueYm.size);
        }
    } else if (periodVal === 'all') {
        if (txs.length > 0) {
            const uniqueYm = new Set(txs.map(d => `${d.year}-${d.month}`));
            numMeses = Math.max(1, uniqueYm.size);
            const validDates = txs.map(d => (d.date instanceof Date ? d.date.getTime() : new Date(d.rawDate + 'T12:00:00').getTime())).filter(t => !isNaN(t));
            if (validDates.length > 0) {
                const minTime = Math.min(...validDates);
                const maxTime = Math.max(...validDates);
                const diffDays = Math.round((maxTime - minTime) / (1000 * 60 * 60 * 24)) + 1;
                numDias = Math.max(1, diffDays);
            }
        }
    } else if (typeof periodVal === 'string' && periodVal.includes('-')) {
        numMeses = 1;
        const [y, m] = periodVal.split('-').map(Number);
        if (!isNaN(y) && !isNaN(m)) {
            numDias = new Date(y, m + 1, 0).getDate();
        }
    }

    return {
        numMeses: Math.max(1, numMeses),
        numDias: Math.max(1, numDias)
    };
}

/**
 * Calcula a média aritmética de um valor com base no modo ('mes', 'operacao', 'dia').
 */
export function calculateAverageValue(totalVal, count, modoMedia, numMeses = 1, numDias = 30) {
    const val = Number(totalVal) || 0;
    if (modoMedia === 'operacao') {
        return (count && count > 0) ? val / count : 0;
    } else if (modoMedia === 'dia') {
        return (numDias && numDias > 0) ? val / numDias : 0;
    }
    return (numMeses && numMeses > 0) ? val / numMeses : 0;
}

/**
 * Compara a média histórica do período com o gasto realizado no mês atual até hoje.
 */
export function compareWithCurrentMonth(mediaPeriodo, gastoMesAtual, tolerancePercent = 1) {
    const media = Number(mediaPeriodo) || 0;
    const atual = Number(gastoMesAtual) || 0;
    const diferenca = Math.round((atual - media) * 100) / 100;

    if (media === 0 && atual === 0) {
        return {
            diferenca: 0,
            percentual: 0,
            status: 'neutro',
            textoComparativo: '≈ na média',
            simbolo: '≈',
            badgeClass: 'tag-inactive'
        };
    }

    if (media === 0 && atual > 0) {
        return {
            diferenca: atual,
            percentual: null,
            status: 'sem_historico',
            textoComparativo: 'Sem média histórica para comparação',
            simbolo: '↑',
            badgeClass: 'tag-open'
        };
    }

    const rawPct = ((atual - media) / media) * 100;
    const absPct = Math.abs(rawPct);
    const roundedPct = Math.round(absPct * 10) / 10;

    if (absPct <= tolerancePercent) {
        return {
            diferenca,
            percentual: 0,
            status: 'na_media',
            textoComparativo: '≈ na média',
            simbolo: '≈',
            badgeClass: 'tag-inactive'
        };
    }

    if (diferenca > 0) {
        return {
            diferenca,
            percentual: roundedPct,
            status: 'acima',
            textoComparativo: `↑ ${roundedPct}% acima da média`,
            simbolo: '↑',
            badgeClass: 'tag-danger'
        };
    } else {
        return {
            diferenca,
            percentual: roundedPct,
            status: 'abaixo',
            textoComparativo: `↓ ${roundedPct}% abaixo da média`,
            simbolo: '↓',
            badgeClass: 'tag-done'
        };
    }
}

/**
 * Filtra transações correspondentes estritamente ao mês atual civil até hoje,
 * preservando todos os demais filtros compatíveis ativos.
 */
export function filterCurrentMonthRealized(transactions = [], activeFilters = {}, now = new Date()) {
    if (!Array.isArray(transactions)) return [];

    const currYear = now.getFullYear();
    const currMonth = now.getMonth();
    const currDay = now.getDate();

    const {
        tipoVal = 'all',
        catVal = 'all',
        subVal = 'all',
        tagVal = 'all',
        payVal = 'all',
        cardVal = 'all',
        custoVal = 'all',
        minVal,
        maxVal,
        searchTerm
    } = activeFilters;

    return transactions.filter(d => {
        if (!d) return false;

        // 1. Verificação estrita de Mês Civil Atual até hoje
        if (d.year !== currYear || d.month !== currMonth) return false;

        // PREVISTO != REALIZADO: Desconsidera previsões e agendamentos não realizados
        if (d.is_forecast || d.isForecast) return false;
        if (d.cancelled_at || d.deleted_at) return false;
        if (d.status) {
            const st = String(d.status).toUpperCase();
            if (st === 'PREVISTA' || st === 'PREVISTO' || st === 'CANCELADA' || st === 'PENDENTE') return false;
        }
        if (d.agendamento_id && d.status !== 'REALIZADA') return false;

        let dDay = null;
        if (d.date instanceof Date && !isNaN(d.date.getTime())) {
            dDay = d.date.getDate();
        } else if (d.rawDate && typeof d.rawDate === 'string') {
            const parts = d.rawDate.split('-');
            if (parts.length === 3) dDay = parseInt(parts[2], 10);
        }
        if (dDay !== null && dDay > currDay) return false;

        // 2. Filtros compatíveis
        if (tipoVal !== 'all' && d.type !== tipoVal) return false;
        if (catVal !== 'all' && normalizeCatalogName(d.category) !== normalizeCatalogName(catVal)) return false;
        if (subVal !== 'all' && normalizeCatalogName(d.subCat) !== normalizeCatalogName(subVal)) return false;
        if (tagVal !== 'all' && !(d.tags || []).some(t => normalizeCatalogName(t) === normalizeCatalogName(tagVal))) return false;
        if (payVal !== 'all' && d.pagamento !== payVal) return false;
        if (cardVal !== 'all' && d.cartao !== cardVal) return false;
        if (custoVal !== 'all' && d.custo !== custoVal) return false;
        if (minVal !== undefined && !isNaN(minVal) && d.value < minVal) return false;
        if (maxVal !== undefined && !isNaN(maxVal) && d.value > maxVal) return false;

        if (searchTerm) {
            const matchDesc = (d.desc || '').toLowerCase().includes(searchTerm);
            const matchCat = (d.category || '').toLowerCase().includes(searchTerm);
            const matchSub = (d.subCat || '').toLowerCase().includes(searchTerm);
            const matchPay = (d.pagamento || '').toLowerCase().includes(searchTerm);
            const matchCard = (d.cartao || '').toLowerCase().includes(searchTerm);
            const matchTags = (d.tags || []).some(t => t.toLowerCase().includes(searchTerm));
            if (!matchDesc && !matchCat && !matchSub && !matchPay && !matchCard && !matchTags) return false;
        }

        return true;
    });
}

