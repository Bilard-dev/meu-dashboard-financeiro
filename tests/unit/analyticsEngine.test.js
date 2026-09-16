import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    calculatePeriodDivisors,
    calculateAverageValue,
    compareWithCurrentMonth,
    filterCurrentMonthRealized
} from '../../src/domain/analytics/analyticsEngine.js';

describe('analyticsEngine — Motor Puro de Médias Financeiras e Comparativo (Fase 4.7-A)', () => {

    // 1. PIX médio calcula valor correto com despesas PIX reais
    it('1. PIX médio calcula valor correto com despesas PIX reais', () => {
        const pixExpenses = [
            { id: '1', type: 'DESPESA', pagamento: 'PIX', value: 300 },
            { id: '2', type: 'DESPESA', pagamento: 'pix', value: 600 }
        ];
        const totalPix = pixExpenses.reduce((acc, d) => acc + d.value, 0);
        const divisorMeses = 3;
        const mediaPix = calculateAverageValue(totalPix, pixExpenses.length, 'mes', divisorMeses);
        assert.equal(totalPix, 900);
        assert.equal(mediaPix, 300);
    });

    // 2. Cartão médio calcula valor correto com despesas de cartão reais
    it('2. Cartão médio calcula valor correto com despesas de cartão reais', () => {
        const cardExpenses = [
            { id: '3', type: 'DESPESA', pagamento: 'Cartão de Crédito', cartao: 'Nubank', value: 1200 },
            { id: '4', type: 'DESPESA', pagamento: 'Crédito', cartao: 'Inter', value: 600 }
        ];
        const totalCartao = cardExpenses.reduce((acc, d) => acc + d.value, 0);
        const divisorMeses = 6;
        const mediaCartao = calculateAverageValue(totalCartao, cardExpenses.length, 'mes', divisorMeses);
        assert.equal(totalCartao, 1800);
        assert.equal(mediaCartao, 300);
    });

    // 3. Dinheiro/outros médio calcula valor correto
    it('3. Dinheiro/outros médio calcula valor correto', () => {
        const otherExpenses = [
            { id: '5', type: 'DESPESA', pagamento: 'Dinheiro', value: 250 },
            { id: '6', type: 'DESPESA', pagamento: 'Boleto', value: 350 }
        ];
        const totalDinheiro = otherExpenses.reduce((acc, d) => acc + d.value, 0);
        const divisorMeses = 2;
        const mediaDinheiro = calculateAverageValue(totalDinheiro, otherExpenses.length, 'mes', divisorMeses);
        assert.equal(totalDinheiro, 600);
        assert.equal(mediaDinheiro, 300);
    });

    // 4. Período de 6 meses divide exatamente por 6 mesmo com meses sem despesa
    it('4. Período de 6 meses divide exatamente por 6 mesmo com meses sem despesa', () => {
        const divisors = calculatePeriodDivisors('last_6_months');
        assert.equal(divisors.numMeses, 6);
        assert.equal(divisors.numDias, 180);

        const totalGasto = 3600;
        const media = calculateAverageValue(totalGasto, 1, 'mes', divisors.numMeses);
        assert.equal(media, 600);
    });

    // 5. Mês sem gasto não reduz o divisor de períodos fixos (ex: 3 meses)
    it('5. Mês sem gasto não reduz o divisor de períodos fixos (ex: 3 meses)', () => {
        const txs = [
            { id: 'tx-1', type: 'DESPESA', year: 2026, month: 8, value: 900 }
        ];
        const divisors = calculatePeriodDivisors('last_3_months', { transactions: txs });
        assert.equal(divisors.numMeses, 3);
        const media = calculateAverageValue(900, txs.length, 'mes', divisors.numMeses);
        assert.equal(media, 300);
    });

    // 6. Período personalizado calcula divisor correto de meses civis
    it('6. Período personalizado calcula divisor correto de meses civis', () => {
        const divisors1 = calculatePeriodDivisors('custom', {
            dataInicioVal: '2026-01-01',
            dataFimVal: '2026-05-31'
        });
        assert.equal(divisors1.numMeses, 5);

        const divisors2 = calculatePeriodDivisors('custom', {
            dataInicioVal: '2025-11-15',
            dataFimVal: '2026-02-10'
        });
        assert.equal(divisors2.numMeses, 4);
    });

    // 7. Média por categoria calcula valor correto
    it('7. Média por categoria calcula valor correto', () => {
        const catExpenses = [
            { id: 'c1', type: 'DESPESA', category: 'Alimentação', value: 400 },
            { id: 'c2', type: 'DESPESA', category: 'Alimentação', value: 800 }
        ];
        const totalCat = catExpenses.reduce((acc, d) => acc + d.value, 0);
        const divisors = calculatePeriodDivisors('last_6_months');
        const mediaCat = calculateAverageValue(totalCat, catExpenses.length, 'mes', divisors.numMeses);
        assert.equal(totalCat, 1200);
        assert.equal(mediaCat, 200);
    });

    // 8. Mês atual até hoje filtra apenas transações até a data de hoje
    it('8. Mês atual até hoje filtra apenas transações até a data de hoje', () => {
        const mockNow = new Date(2026, 8, 15, 12, 0, 0); // 15 de Setembro de 2026
        const txs = [
            { id: 't1', type: 'DESPESA', year: 2026, month: 8, rawDate: '2026-09-10', value: 100 },
            { id: 't2', type: 'DESPESA', year: 2026, month: 8, rawDate: '2026-09-15', value: 150 },
            { id: 't3', type: 'DESPESA', year: 2026, month: 8, rawDate: '2026-09-20', value: 200 },
            { id: 't4', type: 'DESPESA', year: 2026, month: 7, rawDate: '2026-08-15', value: 300 }
        ];

        const filtered = filterCurrentMonthRealized(txs, {}, mockNow);
        assert.equal(filtered.length, 2);
        assert.deepEqual(filtered.map(t => t.id), ['t1', 't2']);
    });

    // 9. Mês atual ignora SOMENTE o filtro de período
    it('9. Mês atual ignora SOMENTE o filtro de período', () => {
        const mockNow = new Date(2026, 8, 16);
        const txs = [
            { id: 'm1', type: 'DESPESA', year: 2026, month: 8, rawDate: '2026-09-05', value: 50 },
            { id: 'm2', type: 'DESPESA', year: 2026, month: 7, rawDate: '2026-08-05', value: 50 }
        ];
        const currentMonthTxs = filterCurrentMonthRealized(txs, { tipoVal: 'DESPESA' }, mockNow);
        assert.equal(currentMonthTxs.length, 1);
        assert.equal(currentMonthTxs[0].id, 'm1');
    });

    // 10. Mês atual respeita demais filtros ativos (ex: categoria, forma de pagamento)
    it('10. Mês atual respeita demais filtros ativos (ex: categoria, forma de pagamento)', () => {
        const mockNow = new Date(2026, 8, 16);
        const txs = [
            { id: 'a1', type: 'DESPESA', category: 'Mercado', pagamento: 'PIX', year: 2026, month: 8, rawDate: '2026-09-02', value: 80 },
            { id: 'a2', type: 'DESPESA', category: 'Mercado', pagamento: 'Dinheiro', year: 2026, month: 8, rawDate: '2026-09-03', value: 40 },
            { id: 'a3', type: 'DESPESA', category: 'Farmácia', pagamento: 'PIX', year: 2026, month: 8, rawDate: '2026-09-04', value: 90 }
        ];

        const filtered = filterCurrentMonthRealized(txs, {
            tipoVal: 'DESPESA',
            catVal: 'Mercado',
            payVal: 'PIX'
        }, mockNow);

        assert.equal(filtered.length, 1);
        assert.equal(filtered[0].id, 'a1');
    });

    // 11. Previsto/agendado (Fase 4.6) NÃO entra no cálculo do mês atual como realizado
    it('11. Previsto/agendado (Fase 4.6) NÃO entra no cálculo do mês atual como realizado', () => {
        const mockNow = new Date(2026, 8, 16);
        const txs = [
            { id: 'real-1', type: 'DESPESA', year: 2026, month: 8, rawDate: '2026-09-05', value: 120 },
            { id: 'prev-1', type: 'DESPESA', year: 2026, month: 8, rawDate: '2026-09-10', value: 50, status: 'PREVISTA', agendamento_id: 'ag-1' },
            { id: 'prev-2', type: 'DESPESA', year: 2026, month: 8, rawDate: '2026-09-12', value: 80, is_forecast: true },
            { id: 'canc-1', type: 'DESPESA', year: 2026, month: 8, rawDate: '2026-09-14', value: 30, status: 'CANCELADA' }
        ];

        const filtered = filterCurrentMonthRealized(txs, {}, mockNow);
        assert.equal(filtered.length, 1);
        assert.equal(filtered[0].id, 'real-1');
    });

    // 12. Comparativo: média zero + atual > 0 não gera Infinity (mostra "Sem média histórica para comparação")
    it('12. Comparativo: média zero + atual > 0 não gera Infinity (mostra "Sem média histórica para comparação")', () => {
        const res = compareWithCurrentMonth(0, 150);
        assert.equal(res.status, 'sem_historico');
        assert.equal(res.textoComparativo, 'Sem média histórica para comparação');
        assert.equal(res.simbolo, '↑');
        assert.equal(res.percentual, null);
        assert.equal(res.diferenca, 150);
    });

    // 13. Comparativo: média zero + atual zero exibe neutro ("≈ na média")
    it('13. Comparativo: média zero + atual zero exibe neutro ("≈ na média")', () => {
        const res = compareWithCurrentMonth(0, 0);
        assert.equal(res.status, 'neutro');
        assert.equal(res.textoComparativo, '≈ na média');
        assert.equal(res.simbolo, '≈');
        assert.equal(res.diferenca, 0);
        assert.equal(res.percentual, 0);
    });

    // 14. Comparativo: variações acima, abaixo e na margem de tolerância
    it('14. Comparativo: variações acima, abaixo e na margem de tolerância', () => {
        const naMargem = compareWithCurrentMonth(100, 100.8);
        assert.equal(naMargem.status, 'na_media');
        assert.equal(naMargem.textoComparativo, '≈ na média');

        const acima = compareWithCurrentMonth(100, 115);
        assert.equal(acima.status, 'acima');
        assert.equal(acima.textoComparativo, '↑ 15% acima da média');
        assert.equal(acima.diferenca, 15);

        const abaixo = compareWithCurrentMonth(100, 80);
        assert.equal(abaixo.status, 'abaixo');
        assert.equal(abaixo.textoComparativo, '↓ 20% abaixo da média');
        assert.equal(abaixo.diferenca, -20);
    });

    // 15. Consistência matemática: soma dos meios fecha exatamente com o total de despesas
    it('15. Consistência matemática: soma dos meios fecha exatamente com o total de despesas', () => {
        const despesas = [
            { id: '1', type: 'DESPESA', pagamento: 'PIX', value: 150.50 },
            { id: '2', type: 'DESPESA', pagamento: 'Cartão de Crédito', cartao: 'Visa', value: 300.25 },
            { id: '3', type: 'DESPESA', pagamento: 'Dinheiro', value: 49.25 }
        ];

        const pix = despesas.filter(d => (d.pagamento || '').toUpperCase() === 'PIX');
        const cartao = despesas.filter(d => !((d.pagamento || '').toUpperCase() === 'PIX') && ((d.pagamento || '').includes('Cartão') || Boolean(d.cartao)));
        const dinheiro = despesas.filter(d => !((d.pagamento || '').toUpperCase() === 'PIX') && !((d.pagamento || '').includes('Cartão') || Boolean(d.cartao)));

        const totalPix = pix.reduce((a, b) => a + b.value, 0);
        const totalCartao = cartao.reduce((a, b) => a + b.value, 0);
        const totalDinheiro = dinheiro.reduce((a, b) => a + b.value, 0);
        const totalGeral = despesas.reduce((a, b) => a + b.value, 0);

        assert.equal(totalPix + totalCartao + totalDinheiro, totalGeral);
        assert.equal(pix.length + cartao.length + dinheiro.length, despesas.length);
    });
});
