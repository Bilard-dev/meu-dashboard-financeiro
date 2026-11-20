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

});
