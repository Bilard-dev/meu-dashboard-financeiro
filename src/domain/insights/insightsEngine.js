// @ts-check
import { formatCurrency } from '../../core/formatters.js';

/**
 * @typedef {Object} SmartInsight
 * @property {string} id - Identificador único do insight
 * @property {'warning' | 'success' | 'info' | 'neutral'} type - Nível semântico do insight
 * @property {string} icon - Emoji representativo
 * @property {string} title - Título curto e chamativo
 * @property {string} message - Texto descritivo e contextualizado
 * @property {string} badge - Etiqueta do insight (ex: "Alerta de Padrão", "Economia", "Controle")
 * @property {number} priority - Prioridade de exibição (menor número = maior relevância)
 */

/**
 * Calcula a competência anterior (YYYY-M) a partir de uma competência fornecida.
 * @param {number} year 
 * @param {number} monthIndex (0 a 11)
 * @param {number} offsetMonths 
 * @returns {{ year: number, month: number, key: string }}
 */
function getOffsetMonth(year, monthIndex, offsetMonths) {
    const d = new Date(year, monthIndex - offsetMonths, 1);
    return {
        year: d.getFullYear(),
        month: d.getMonth(),
        key: `${d.getFullYear()}-${d.getMonth()}`
    };
}

/**
 * Motor puro de geração de Insights Financeiros Automáticos.
 * Analisa histórico de transações, identifica desvios de consumo em categorias,
 * comparações de competência e oportunidades de economia.
 * 
 * @param {Array<object>} transactions - Lista de transações do usuário
 * @param {string} selectedYm - Competência analisada (ex: '2026-10' ou 'all')
 * @param {object} [options] - Parâmetros customizáveis
 * @param {Date} [options.currentDate] - Data de referência do sistema
 * @returns {Array<SmartInsight>} Lista de insights ordenados por relevância
 */
export function generateSmartInsights(transactions, selectedYm, options = {}) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return [
            {
                id: 'insight-empty',
                type: 'info',
                icon: '💡',
                title: 'Comece a registrar suas finanças',
                message: 'Cadastre suas primeiras receitas e despesas para liberar análises comparativas e insights automáticos.',
                badge: 'Dica do Assistente',
                priority: 10
            }
        ];
    }

    const refDate = options.currentDate || new Date();
    const isPrivacy = Boolean(options.isPrivacy);
    let targetYear;
    let targetMonth;

    if (selectedYm && selectedYm !== 'all' && selectedYm.includes('-')) {
        const parts = selectedYm.split('-').map(Number);
        targetYear = parts[0];
        targetMonth = parts[1];
    } else {
        // Se 'all' ou não fornecido, adota o mês mais recente com transações ou o mês atual
        const monthsWithData = transactions
            .filter(t => t.data || t.rawDate)
            .map(t => {
                const raw = t.rawDate || t.data;
                const p = String(raw).slice(0, 7).split('-').map(Number);
                return { y: p[0], m: p[1] - 1, key: `${p[0]}-${p[1] - 1}` };
            })
            .sort((a, b) => (b.y * 12 + b.m) - (a.y * 12 + a.m));

        if (monthsWithData.length > 0) {
            targetYear = monthsWithData[0].y;
            targetMonth = monthsWithData[0].m;
        } else {
            targetYear = refDate.getFullYear();
            targetMonth = refDate.getMonth();
        }
    }

    const currentKey = `${targetYear}-${targetMonth}`;
    const prevKey = getOffsetMonth(targetYear, targetMonth, 1).key;
    const past3Keys = [
        getOffsetMonth(targetYear, targetMonth, 1).key,
        getOffsetMonth(targetYear, targetMonth, 2).key,
        getOffsetMonth(targetYear, targetMonth, 3).key
    ];

    // Separa transações por competência
    /**
     * @param {object} t
     * @returns {string} chave YYYY-M
     */
    const getTxYm = (t) => {
        if (t.year !== undefined && t.month !== undefined) {
            return `${t.year}-${t.month}`;
        }
        const raw = t.rawDate || t.data || '';
        const p = String(raw).slice(0, 7).split('-').map(Number);
        if (p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1])) {
            return `${p[0]}-${p[1] - 1}`;
        }
        return '';
    };

    /**
     * @param {object} t
     * @returns {string} tipo normalizado
     */
    const getTxType = (t) => {
        const raw = (t.type || t.tipo || '').toUpperCase();
        if (raw === 'RECEITA') return 'RECEITA';
        if (raw === 'INVESTIMENTO') return 'INVESTIMENTO';
        if (raw === 'SAQUE') return 'SAQUE';
        return 'DESPESA';
    };

    const currentTxs = transactions.filter(t => getTxYm(t) === currentKey);
    const prevTxs = transactions.filter(t => getTxYm(t) === prevKey);

    const currentDespesas = currentTxs.filter(t => getTxType(t) === 'DESPESA');
    const prevDespesas = prevTxs.filter(t => getTxType(t) === 'DESPESA');

    const currentReceitas = currentTxs.filter(t => getTxType(t) === 'RECEITA');

    const totalDespesasAtual = currentDespesas.reduce((acc, t) => acc + (Number(t.valor || t.value) || 0), 0);
    const totalDespesasAnt = prevDespesas.reduce((acc, t) => acc + (Number(t.valor || t.value) || 0), 0);
    const totalReceitasAtual = currentReceitas.reduce((acc, t) => acc + (Number(t.valor || t.value) || 0), 0);

    const insights = [];

    // ==========================================================
    // 1. INSIGHT: ECONOMIA OU AUMENTO VS MÊS ANTERIOR
    // ==========================================================
    if (totalDespesasAnt > 0 && totalDespesasAtual > 0) {
        const diff = totalDespesasAnt - totalDespesasAtual;
        const diffPct = (diff / totalDespesasAnt) * 100;

        if (diff > 0) {
            // Economia
            insights.push({
                id: 'insight-month-savings',
                type: 'success',
                icon: '🎉',
                title: 'Parabéns pela Economia!',
                message: `Você já economizou ${formatCurrency(diff, isPrivacy)} neste mês em relação ao mês anterior (-${diffPct.toFixed(0)}%).`,
                badge: 'Economia no Mês',
                priority: 1
            });
        } else if (diff < 0) {
            // Aumento de gastos
            const aumentoVal = Math.abs(diff);
            const aumentoPct = Math.abs(diffPct);
            if (aumentoPct >= 5) {
                insights.push({
                    id: 'insight-month-increase',
                    type: 'warning',
                    icon: '⚠️',
                    title: 'Atenção aos Gastos do Mês',
                    message: `Seus gastos totais estão ${formatCurrency(aumentoVal, isPrivacy)} acima do mês anterior (+${aumentoPct.toFixed(0)}%).`,
                    badge: 'Ritmo Elevado',
                    priority: 2
                });
            }
        }
    }

    // ==========================================================
    // 2. INSIGHT: DESVIO EM CATEGORIAS VS MÉDIA DOS ÚLTIMOS 3 MESES
    // ==========================================================
    // Calcula gastos por categoria no mês atual
    const currentCatMap = {};
    currentDespesas.forEach(t => {
        const cat = (t.categoria || t.category || 'Outros').trim();
        const val = Number(t.valor || t.value) || 0;
        currentCatMap[cat] = (currentCatMap[cat] || 0) + val;
    });

    // Calcula histórico dos últimos 3 meses por categoria
    const past3Despesas = transactions.filter(t => getTxType(t) === 'DESPESA' && past3Keys.includes(getTxYm(t)));
    const past3CatTotals = {};
    const past3CatMonths = {};

    past3Despesas.forEach(t => {
        const cat = (t.categoria || t.category || 'Outros').trim();
        const val = Number(t.valor || t.value) || 0;
        const ym = getTxYm(t);

        past3CatTotals[cat] = (past3CatTotals[cat] || 0) + val;
        if (!past3CatMonths[cat]) past3CatMonths[cat] = new Set();
        past3CatMonths[cat].add(ym);
    });

    // Analisa desvios significativos em categorias
    const categoryInsights = [];

    Object.entries(currentCatMap).forEach(([cat, valAtual]) => {
        const totalPast = past3CatTotals[cat] || 0;
        const monthsCount = past3CatMonths[cat] ? past3CatMonths[cat].size : 0;

        if (monthsCount > 0 && totalPast > 0) {
            const media3m = totalPast / Math.max(1, Math.min(3, monthsCount));
            if (media3m >= 30) { // Relevância mínima de valor
                const diffPct = ((valAtual - media3m) / media3m) * 100;

                if (diffPct >= 15) {
                    categoryInsights.push({
                        cat,
                        diffPct,
                        valAtual,
                        media3m,
                        type: 'warning',
                        isSpike: true
                    });
                } else if (diffPct <= -20 && valAtual < media3m) {
                    categoryInsights.push({
                        cat,
                        diffPct,
                        valAtual,
                        media3m,
                        type: 'success',
                        isSpike: false
                    });
                }
            }
        }
    });

    // Ordena pela maior variação percentual absoluta
    categoryInsights.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));

    if (categoryInsights.length > 0) {
        const topCat = categoryInsights[0];
        if (topCat.isSpike) {
            insights.push({
                id: `insight-cat-spike-${topCat.cat}`,
                type: 'warning',
                icon: '📈',
                title: `Atenção aos gastos com ${topCat.cat}`,
                message: `Seus gastos com ${topCat.cat} este mês subiram ${topCat.diffPct.toFixed(0)}% em relação à sua média dos últimos 3 meses.`,
                badge: 'Alerta de Categoria',
                priority: 1
            });
        } else {
            insights.push({
                id: `insight-cat-drop-${topCat.cat}`,
                type: 'success',
                icon: '📉',
                title: `Boa redução em ${topCat.cat}`,
                message: `Gastos com ${topCat.cat} caíram ${Math.abs(topCat.diffPct).toFixed(0)}% em relação à sua média recente.`,
                badge: 'Controle de Gastos',
                priority: 3
            });
        }
    }

    // ==========================================================
    // 3. INSIGHT: TAXA DE SOBRA / POUPANÇA DA RENDA
    // ==========================================================
    if (totalReceitasAtual > 0 && totalDespesasAtual > 0) {
        const sobra = totalReceitasAtual - totalDespesasAtual;
        const taxaPoupanca = (sobra / totalReceitasAtual) * 100;

        if (taxaPoupanca >= 20) {
            insights.push({
                id: 'insight-savings-rate',
                type: 'success',
                icon: '💰',
                title: 'Excelente Taxa de Sobra',
                message: `Você está retendo ${taxaPoupanca.toFixed(0)}% da sua receita neste mês (${formatCurrency(sobra, isPrivacy)} livres).`,
                badge: 'Poupança Ativa',
                priority: 4
            });
        } else if (taxaPoupanca < 0) {
            const deficit = Math.abs(sobra);
            insights.push({
                id: 'insight-deficit-rate',
                type: 'warning',
                icon: '🚨',
                title: 'Déficit no Mês',
                message: `Suas saídas superaram as entradas em ${formatCurrency(deficit, isPrivacy)}. Avalie postergar compras não essenciais.`,
                badge: 'Alerta de Caixa',
                priority: 1
            });
        }
    }

    // ==========================================================
    // 4. INSIGHT: COMPROMISSO DE CARTÃO NO PRÓXIMO MÊS
    // ==========================================================
    const nextMonthObj = getOffsetMonth(targetYear, targetMonth, -1);
    const nextKey = nextMonthObj.key;

    // Busca parcelas que vencem no próximo mês
    let comprometidoProximaFatura = 0;
    transactions.forEach(t => {
        if (getTxType(t) === 'DESPESA' && (t.cartao || t.pagamento === 'Cartão de Crédito')) {
            const ym = getTxYm(t);
            // Se já tem fatura ou vencimento expressamente no próximo mês
            if (ym === nextKey || t.faturaDestino === 'PROXIMA') {
                comprometidoProximaFatura += (Number(t.valor || t.value) || 0);
            }
        }
    });

    if (comprometidoProximaFatura > 300) {
        insights.push({
            id: 'insight-next-invoice',
            type: 'info',
            icon: '💳',
            title: 'Compromissos na Próxima Fatura',
            message: `A fatura do próximo mês já possui ${formatCurrency(comprometidoProximaFatura, isPrivacy)} previstos em parcelas e compras no crédito.`,
            badge: 'Previsão de Fatura',
            priority: 5
        });
    }

    // ==========================================================
    // 5. INSIGHT: PROJEÇÃO DE FECHAMENTO DO MÊS (BURN RATE)
    // ==========================================================
    const isCurrentCalendarMonth = (targetYear === refDate.getFullYear() && targetMonth === refDate.getMonth());
    if (isCurrentCalendarMonth && totalDespesasAtual > 0) {
        const totalDaysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        const currentDay = Math.min(refDate.getDate(), totalDaysInMonth);

        // Requer pelo menos 2 dias de histórico no mês
        if (currentDay >= 2) {
            const dailyRate = totalDespesasAtual / currentDay;
            const projectedTotal = Math.round(dailyRate * totalDaysInMonth);

            // Média de despesas dos últimos 3 meses
            const past3MonthsDespesas = past3Keys.map(k => {
                return transactions
                    .filter(t => getTxType(t) === 'DESPESA' && getTxYm(t) === k)
                    .reduce((sum, t) => sum + (Number(t.valor || t.value) || 0), 0);
            }).filter(v => v > 0);

            const mediaPastTotal = past3MonthsDespesas.length > 0
                ? past3MonthsDespesas.reduce((a, b) => a + b, 0) / past3MonthsDespesas.length
                : 0;

            if (mediaPastTotal > 0) {
                if (projectedTotal > mediaPastTotal * 1.15) {
                    insights.push({
                        id: 'insight-burn-rate',
                        type: 'warning',
                        icon: '🔥',
                        title: 'Alerta de Ritmo de Gastos (Burn Rate)',
                        message: `No ritmo atual de ${formatCurrency(dailyRate, isPrivacy)}/dia, sua despesa fechará o mês em ${formatCurrency(projectedTotal, isPrivacy)} (superando sua média usual de ${formatCurrency(mediaPastTotal, isPrivacy)}).`,
                        badge: 'Ritmo Acelerado',
                        priority: 2
                    });
                } else {
                    insights.push({
                        id: 'insight-burn-rate',
                        type: 'success',
                        icon: '🎯',
                        title: 'Ritmo de Gastos Saudável',
                        message: `No ritmo atual de ${formatCurrency(dailyRate, isPrivacy)}/dia, sua despesa fechará o mês em ${formatCurrency(projectedTotal, isPrivacy)} (dentro da sua média usual de ${formatCurrency(mediaPastTotal, isPrivacy)}).`,
                        badge: 'Ritmo sob Controle',
                        priority: 3
                    });
                }
            } else {
                insights.push({
                    id: 'insight-burn-rate',
                    type: 'info',
                    icon: '📊',
                    title: 'Projeção de Gastos do Mês',
                    message: `No ritmo atual de ${formatCurrency(dailyRate, isPrivacy)}/dia, sua despesa fechará o mês em aproximadamente ${formatCurrency(projectedTotal, isPrivacy)}.`,
                    badge: 'Projeção Mensal',
                    priority: 3
                });
            }
        }
    }

    // ==========================================================
    // 6. INSIGHT: TETOS DE GASTOS POR CATEGORIA (BUDGETING)
    // ==========================================================
    const categoryBudgets = options.categoryBudgets || {};
    if (categoryBudgets && typeof categoryBudgets === 'object') {
        Object.entries(categoryBudgets).forEach(([cat, rawLimit]) => {
            const limit = Number(rawLimit) || 0;
            if (limit <= 0) return;

            const normTargetCat = cat.trim().toLowerCase();
            let gastoAtual = 0;
            Object.entries(currentCatMap).forEach(([c, val]) => {
                if (c.trim().toLowerCase() === normTargetCat) {
                    gastoAtual += val;
                }
            });

            const pctConsumido = (gastoAtual / limit) * 100;
            const pctArredondado = Math.round(pctConsumido);

            if (pctConsumido >= 90) {
                insights.push({
                    id: `insight-budget-alert-${cat}`,
                    type: 'warning',
                    icon: '🚨',
                    title: `Teto de ${cat} quase atingido (${pctArredondado}%)`,
                    message: `Você já utilizou ${formatCurrency(gastoAtual, isPrivacy)} do teto de ${formatCurrency(limit, isPrivacy)} definido para ${cat}.`,
                    badge: 'Teto Crítico',
                    priority: 1,
                    budgetProgress: {
                        category: cat,
                        current: gastoAtual,
                        limit,
                        pct: Math.min(100, pctArredondado),
                        status: 'danger'
                    }
                });
            } else if (pctConsumido >= 75) {
                insights.push({
                    id: `insight-budget-warning-${cat}`,
                    type: 'warning',
                    icon: '⚠️',
                    title: `Atenção ao Teto de ${cat} (${pctArredondado}%)`,
                    message: `Você utilizou ${formatCurrency(gastoAtual, isPrivacy)} do teto de ${formatCurrency(limit, isPrivacy)} previsto para o mês.`,
                    badge: 'Atenção ao Teto',
                    priority: 2,
                    budgetProgress: {
                        category: cat,
                        current: gastoAtual,
                        limit,
                        pct: pctArredondado,
                        status: 'warning'
                    }
                });
            } else if (pctConsumido > 0) {
                insights.push({
                    id: `insight-budget-ok-${cat}`,
                    type: 'info',
                    icon: '🟢',
                    title: `Teto de ${cat} sob controle (${pctArredondado}%)`,
                    message: `Consumo de ${formatCurrency(gastoAtual, isPrivacy)} de um teto de ${formatCurrency(limit, isPrivacy)} para o mês.`,
                    badge: 'Teto sob Controle',
                    priority: 5,
                    budgetProgress: {
                        category: cat,
                        current: gastoAtual,
                        limit,
                        pct: pctArredondado,
                        status: 'ok'
                    }
                });
            }
        });
    }

    // ==========================================================
    // 7. INSIGHT: DETECTOR DE RECORRÊNCIAS & ASSINATURAS
    // ==========================================================
    const allExpenses = transactions.filter(t => getTxType(t) === 'DESPESA');
    const recurringMap = new Map();

    allExpenses.forEach(t => {
        const rawDesc = (t.desc || t.descricao || '').replace(/\[.*?\]/g, '').trim();
        if (!rawDesc || rawDesc.length < 3) return;

        const normDesc = rawDesc.toLowerCase().replace(/\s+/g, ' ');
        const ym = getTxYm(t);
        const val = Number(t.valor || t.value) || 0;
        if (val <= 0) return;

        const isExplicitRec = (t.parcela === 'RECORRENTE' || t.tipo === 'assinatura_cartao' || t.faturaDestino === 'RECORRENTE');

        if (!recurringMap.has(normDesc)) {
            recurringMap.set(normDesc, {
                name: rawDesc,
                category: (t.categoria || t.category || 'Geral').trim(),
                months: new Set(ym ? [ym] : []),
                values: [val],
                lastVal: val,
                isExplicitRec
            });
        } else {
            const entry = recurringMap.get(normDesc);
            if (ym) entry.months.add(ym);
            entry.values.push(val);
            entry.lastVal = val;
            if (isExplicitRec) entry.isExplicitRec = true;
        }
    });

    const activeRecurrings = [];
    recurringMap.forEach((entry) => {
        const minVal = Math.min(...entry.values);
        const maxVal = Math.max(...entry.values);
        const diffVal = maxVal - minVal;

        const isLikelySubscription = entry.isExplicitRec || (entry.months.size >= 2 && diffVal <= 6 && minVal >= 8);

        if (isLikelySubscription) {
            activeRecurrings.push({
                name: entry.name,
                category: entry.category,
                value: entry.lastVal
            });
        }
    });

    if (activeRecurrings.length > 0) {
        activeRecurrings.sort((a, b) => b.value - a.value);

        const totalMonthlyRecurring = activeRecurrings.reduce((acc, r) => acc + r.value, 0);
        const sampleNames = activeRecurrings.slice(0, 3).map(r => r.name).join(', ');

        insights.push({
            id: 'insight-recurring-subscriptions',
            type: 'info',
            icon: '🔁',
            title: 'Detector de Recorrências & Assinaturas',
            message: `Detectamos ${activeRecurrings.length} cobrança${activeRecurrings.length === 1 ? '' : 's'} recorrente${activeRecurrings.length === 1 ? '' : 's'} ativa${activeRecurrings.length === 1 ? '' : 's'} totalizando ${formatCurrency(totalMonthlyRecurring, isPrivacy)}/mês (${sampleNames}${activeRecurrings.length > 3 ? '...' : ''}). Revise se ainda utiliza todos os serviços.`,
            badge: 'Cobranças Automáticas',
            priority: 4,
            recurringItems: activeRecurrings
        });
    }

    // Se nenhum insight de alerta ou economia foi ativado, adiciona um insight de equilíbrio
    if (insights.length === 0) {
        insights.push({
            id: 'insight-balanced',
            type: 'neutral',
            icon: '✨',
            title: 'Finanças em Equilíbrio',
            message: 'Seus lançamentos estão dentro do padrão habitual de consumo, sem picos anômalos detectados.',
            badge: 'Padrão Estável',
            priority: 10
        });
    }

    // Ordena rigorosamente por prioridade (1 é mais importante que 10)
    return insights.sort((a, b) => a.priority - b.priority);
}
