// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSmartInsights } from '../../src/domain/insights/insightsEngine.js';

describe('insightsEngine — Motor Puro de Insights Financeiros Automáticos', () => {

    it('1. Deve gerar insight amigável quando a lista de transações for vazia', () => {
        const insights = generateSmartInsights([], '2026-10');
        assert.ok(Array.isArray(insights));
        assert.equal(insights.length, 1);
        assert.equal(insights[0].id, 'insight-empty');
        assert.ok(insights[0].message.includes('Cadastre suas primeiras receitas'));
    });

    it('2. Deve detectar economia em relação ao mês anterior (R$ 850 economizados)', () => {
        // Mês atual: 2026-10 (Novembro no índice 10). Mês anterior: 2026-9 (Outubro).
        const txs = [
            // Outubro (Mês anterior): R$ 3.000 de despesas
            {
                id: 'tx-prev-1',
                type: 'DESPESA',
                rawDate: '2026-10-15',
                year: 2026,
                month: 9,
                value: 3000.00,
                category: 'Geral'
            },
            // Novembro (Mês atual): R$ 2.150 de despesas (Economia de R$ 850)
            {
                id: 'tx-curr-1',
                type: 'DESPESA',
                rawDate: '2026-11-15',
                year: 2026,
                month: 10,
                value: 2150.00,
                category: 'Geral'
            }
        ];

        const insights = generateSmartInsights(txs, '2026-10');
        const savingsInsight = insights.find(i => i.id === 'insight-month-savings');
        assert.ok(savingsInsight, 'Deveria gerar o insight de economia no mês');
        assert.equal(savingsInsight.type, 'success');
        assert.ok(savingsInsight.message.includes('850,00'), 'Deveria mencionar o valor economizado de R$ 850,00');
        assert.ok(savingsInsight.title.includes('Parabéns'), 'Deveria parabenizar o usuário pela economia');
    });

    it('3. Deve alertar pico de gastos em Alimentação (+18% vs média dos últimos 3 meses)', () => {
        // Últimos 3 meses (Julho 2026-6, Agosto 2026-7, Setembro 2026-8):
        // Média de Alimentação = R$ 1.000,00 / mês
        // Mês atual (Outubro 2026-9): Alimentação = R$ 1.180,00 (+18%)
        const txs = [
            {
                id: 'tx-1',
                tipo: 'Despesa',
                rawDate: '2026-07-10',
                year: 2026,
                month: 6,
                valor: 1000.00,
                categoria: 'Alimentação'
            },
            {
                id: 'tx-2',
                tipo: 'Despesa',
                rawDate: '2026-08-10',
                year: 2026,
                month: 7,
                valor: 1000.00,
                categoria: 'Alimentação'
            },
            {
                id: 'tx-3',
                tipo: 'Despesa',
                rawDate: '2026-09-10',
                year: 2026,
                month: 8,
                valor: 1000.00,
                categoria: 'Alimentação'
            },
            {
                id: 'tx-curr',
                tipo: 'Despesa',
                rawDate: '2026-10-10',
                year: 2026,
                month: 9,
                valor: 1180.00,
                categoria: 'Alimentação'
            }
        ];

        const insights = generateSmartInsights(txs, '2026-9');
        const spikeInsight = insights.find(i => i.id.startsWith('insight-cat-spike-Alimentação'));
        assert.ok(spikeInsight, 'Deveria gerar alerta de subida na categoria Alimentação');
        assert.equal(spikeInsight.type, 'warning');
        assert.ok(spikeInsight.message.includes('18%'), 'Deveria calcular exatamente 18% de aumento');
        assert.ok(spikeInsight.message.includes('Alimentação'));
    });

    it('4. Deve parabenizar redução significativa de gastos em Transporte (-30%)', () => {
        const txs = [
            {
                id: 'tx-1',
                type: 'DESPESA',
                year: 2026,
                month: 7,
                value: 500.00,
                category: 'Transporte'
            },
            {
                id: 'tx-2',
                type: 'DESPESA',
                year: 2026,
                month: 8,
                value: 500.00,
                category: 'Transporte'
            },
            {
                id: 'tx-curr',
                type: 'DESPESA',
                year: 2026,
                month: 9,
                value: 350.00,
                category: 'Transporte'
            }
        ];

        const insights = generateSmartInsights(txs, '2026-9');
        const dropInsight = insights.find(i => i.id.startsWith('insight-cat-drop-Transporte'));
        assert.ok(dropInsight, 'Deveria gerar congratulação por redução em Transporte');
        assert.equal(dropInsight.type, 'success');
        assert.ok(dropInsight.message.includes('30%'));
    });

    it('5. Deve calcular taxa de sobra positiva e alertar déficit quando saídas superam entradas', () => {
        // Cenário 1: Sobra positiva alta (Receita 10.000, Despesa 6.000 -> 40% de sobra)
        const txsSurplus = [
            { id: 'r1', type: 'RECEITA', year: 2026, month: 10, value: 10000.00 },
            { id: 'd1', type: 'DESPESA', year: 2026, month: 10, value: 6000.00 }
        ];
        const insightsSurplus = generateSmartInsights(txsSurplus, '2026-10');
        const surplusInsight = insightsSurplus.find(i => i.id === 'insight-savings-rate');
        assert.ok(surplusInsight);
        assert.ok(surplusInsight.message.includes('40%'));

        // Cenário 2: Déficit (Receita 2.000, Despesa 3.500)
        const txsDeficit = [
            { id: 'r2', type: 'RECEITA', year: 2026, month: 10, value: 2000.00 },
            { id: 'd2', type: 'DESPESA', year: 2026, month: 10, value: 3500.00 }
        ];
        const insightsDeficit = generateSmartInsights(txsDeficit, '2026-10');
        const deficitInsight = insightsDeficit.find(i => i.id === 'insight-deficit-rate');
        assert.ok(deficitInsight);
        assert.equal(deficitInsight.type, 'warning');
        assert.ok(deficitInsight.message.includes('1.500,00'));
    });

    it('6. Deve alertar faturas futuras com parcelas no próximo mês', () => {
        const txs = [
            {
                id: 'tx-card-futuro',
                type: 'DESPESA',
                year: 2026,
                month: 11, // Próximo mês
                value: 850.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank'
            }
        ];
        const insights = generateSmartInsights(txs, '2026-10');
        const nextInvoiceInsight = insights.find(i => i.id === 'insight-next-invoice');
        assert.ok(nextInvoiceInsight, 'Deveria avisar da fatura do mês seguinte');
        assert.ok(nextInvoiceInsight.message.includes('850,00'));
    });

    it('7. Deve ordenar por prioridade e manter robustez com datas malformadas ou campos nulos', () => {
        const txs = [
            { id: 'inv-1', type: null, rawDate: null, value: undefined },
            { id: 'inv-2', tipo: 'Despesa', data: 'invalido', valor: NaN }
        ];
        const insights = generateSmartInsights(txs, '2026-10');
        assert.ok(Array.isArray(insights));
        assert.ok(insights.length > 0);
    });

    it('8. Deve ocultar valores monetários quando o modo de privacidade estiver ativo', () => {
        const txs = [
            {
                id: 'tx-prev',
                type: 'DESPESA',
                rawDate: '2026-10-15',
                year: 2026,
                month: 9,
                value: 3000.00
            },
            {
                id: 'tx-curr',
                type: 'DESPESA',
                rawDate: '2026-11-15',
                year: 2026,
                month: 10,
                value: 2000.00
            }
        ];
        const insights = generateSmartInsights(txs, '2026-10', { isPrivacy: true });
        const savingsInsight = insights.find(i => i.id === 'insight-month-savings');
        assert.ok(savingsInsight);
        assert.ok(!savingsInsight.message.includes('1.000,00'), 'Não deve exibir valor monetário explícito');
        assert.ok(savingsInsight.message.includes('R$ ****,**'), 'Deve exibir máscara de privacidade');
    });

    it('9. Deve calcular Projeção de Fechamento do Mês (Burn Rate) saudável quando dentro da média', () => {
        // Mês analisado: 2026-10 (Novembro, 30 dias). Data de referência: dia 10.
        // Gasto acumulado nos 10 dias: R$ 950,00 -> Ritmo: R$ 95,00/dia -> Projeção: R$ 2.850,00
        // Histórico dos 3 meses anteriores: média R$ 3.100,00
        const refDate = new Date(2026, 10, 10);
        const txs = [
            // Mês -1 (Outubro): 3.100
            { id: 'h1', type: 'DESPESA', year: 2026, month: 9, value: 3100.00 },
            // Mês -2 (Setembro): 3.100
            { id: 'h2', type: 'DESPESA', year: 2026, month: 8, value: 3100.00 },
            // Mês -3 (Agosto): 3.100
            { id: 'h3', type: 'DESPESA', year: 2026, month: 7, value: 3100.00 },
            // Mês atual: 950 acumulados até dia 10
            { id: 'c1', type: 'DESPESA', rawDate: '2026-11-05', year: 2026, month: 10, value: 500.00 },
            { id: 'c2', type: 'DESPESA', rawDate: '2026-11-09', year: 2026, month: 10, value: 450.00 }
        ];

        const insights = generateSmartInsights(txs, '2026-10', { currentDate: refDate });
        const burnInsight = insights.find(i => i.id === 'insight-burn-rate');

        assert.ok(burnInsight, 'Deveria gerar o insight de burn rate');
        assert.equal(burnInsight.type, 'success');
        assert.ok(burnInsight.message.includes('95,00/dia'), 'Deveria identificar ritmo de R$ 95,00/dia');
        assert.ok(burnInsight.message.includes('2.850,00'), 'Deveria projetar fechamento em R$ 2.850,00');
        assert.ok(burnInsight.message.includes('3.100,00'), 'Deveria comparar com média usual de R$ 3.100,00');
    });

    it('10. Deve emitir alerta de Burn Rate acelerado quando projeção supera média em mais de 15%', () => {
        // Mês atual: dia 10, gasto R$ 1.500,00 -> Ritmo: R$ 150,00/dia -> Projeção: R$ 4.500,00
        // Histórico anterior: média R$ 2.000,00
        const refDate = new Date(2026, 10, 10);
        const txs = [
            { id: 'h1', type: 'DESPESA', year: 2026, month: 9, value: 2000.00 },
            { id: 'c1', type: 'DESPESA', rawDate: '2026-11-08', year: 2026, month: 10, value: 1500.00 }
        ];

        const insights = generateSmartInsights(txs, '2026-10', { currentDate: refDate });
        const burnInsight = insights.find(i => i.id === 'insight-burn-rate');

        assert.ok(burnInsight);
        assert.equal(burnInsight.type, 'warning');
        assert.equal(burnInsight.icon, '🔥');
        assert.ok(burnInsight.message.includes('superando sua média'));
        assert.ok(burnInsight.message.includes('150,00/dia'));
        assert.ok(burnInsight.message.includes('4.500,00'));
    });

    it('11. Deve monitorar Tetos de Gastos por Categoria (Budgeting) com faixas semânticas', () => {
        // Teto Alimentação = 800, Lazer = 300
        // No mês: Alimentação gastou 736 (92% - Crítico), Lazer gastou 135 (45% - OK)
        const txs = [
            { id: 't1', type: 'DESPESA', year: 2026, month: 10, value: 736.00, category: 'Alimentação' },
            { id: 't2', type: 'DESPESA', year: 2026, month: 10, value: 135.00, category: 'Lazer' }
        ];

        const budgets = {
            'Alimentação': 800,
            'Lazer': 300
        };

        const insights = generateSmartInsights(txs, '2026-10', { categoryBudgets: budgets, includeOkBudgets: true });

        const foodBudgetInsight = insights.find(i => i.id === 'insight-budget-alert-Alimentação');
        assert.ok(foodBudgetInsight, 'Deveria alertar teto crítico de Alimentação');
        assert.equal(foodBudgetInsight.type, 'warning');
        assert.equal(foodBudgetInsight.icon, '🚨');
        assert.ok(foodBudgetInsight.message.includes('92%') || foodBudgetInsight.title.includes('92%'));
        assert.ok(foodBudgetInsight.budgetProgress);
        assert.equal(foodBudgetInsight.budgetProgress.pct, 92);
        assert.equal(foodBudgetInsight.budgetProgress.status, 'danger');

        const leisureBudgetInsight = insights.find(i => i.id === 'insight-budget-ok-Lazer');
        assert.ok(leisureBudgetInsight, 'Deveria indicar teto sob controle para Lazer');
        assert.equal(leisureBudgetInsight.budgetProgress.pct, 45);
        assert.equal(leisureBudgetInsight.budgetProgress.status, 'ok');
    });

    it('12. Deve detectar cobranças recorrentes e assinaturas ativas', () => {
        const txs = [
            // Netflix presente em 3 meses
            { id: 'r1', type: 'DESPESA', rawDate: '2026-08-10', descricao: 'Netflix', valor: 55.90, categoria: 'Lazer' },
            { id: 'r2', type: 'DESPESA', rawDate: '2026-09-10', descricao: 'Netflix', valor: 55.90, categoria: 'Lazer' },
            { id: 'r3', type: 'DESPESA', rawDate: '2026-10-10', descricao: 'Netflix', valor: 55.90, categoria: 'Lazer' },
            // Spotify marcado como RECORRENTE
            { id: 'r4', type: 'DESPESA', rawDate: '2026-10-05', descricao: 'Spotify Premium', valor: 34.90, parcela: 'RECORRENTE', categoria: 'Lazer' },
            // Compra comum não recorrente
            { id: 'c1', type: 'DESPESA', rawDate: '2026-10-12', descricao: 'Almoço Avulso', valor: 45.00, categoria: 'Alimentação' }
        ];

        const insights = generateSmartInsights(txs, '2026-10');
        const recurringInsight = insights.find(i => i.id === 'insight-recurring-subscriptions');

        assert.ok(recurringInsight, 'Deveria gerar o insight de detector de recorrências');
        assert.equal(recurringInsight.type, 'info');
        assert.equal(recurringInsight.icon, '🔁');
        assert.ok(recurringInsight.message.includes('2 cobranças recorrentes'));
        assert.ok(recurringInsight.message.includes('90,80')); // 55.90 + 34.90 = 90.80
        assert.ok(Array.isArray(recurringInsight.recurringItems));
        assert.equal(recurringInsight.recurringItems.length, 2);
    });

    it('13. Não deve incluir compras parceladas no detector de assinaturas recorrentes', () => {
        const txs = [
            // Compra de tênis parcelada em 3x (mesmo valor em 3 meses com parcela 1/3, 2/3, 3/3)
            { id: 'p1', type: 'DESPESA', rawDate: '2026-08-10', descricao: 'Tênis Nike', valor: 112.00, parcela: '1/3', categoria: 'Vestuário' },
            { id: 'p2', type: 'DESPESA', rawDate: '2026-09-10', descricao: 'Tênis Nike', valor: 112.00, parcela: '2/3', categoria: 'Vestuário' },
            { id: 'p3', type: 'DESPESA', rawDate: '2026-10-10', descricao: 'Tênis Nike', valor: 112.00, parcela: '3/3', categoria: 'Vestuário' },
            // Assinatura real
            { id: 's1', type: 'DESPESA', rawDate: '2026-10-10', descricao: 'Academia SmartFit', valor: 129.90, parcela: 'RECORRENTE', categoria: 'Saúde' }
        ];

        const insights = generateSmartInsights(txs, '2026-10');
        const recurringInsight = insights.find(i => i.id === 'insight-recurring-subscriptions');

        assert.ok(recurringInsight);
        assert.equal(recurringInsight.recurringItems.length, 1, 'Deve conter apenas a assinatura real, ignorando a compra parcelada');
        assert.equal(recurringInsight.recurringItems[0].name, 'Academia SmartFit');
    });

});
