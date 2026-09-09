import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildSettlementKey,
    createSettlementMap,
    isInstallmentSettled,
    enrichItemsWithSettlement
} from '../../src/domain/creditSettlement/settlementEngine.js';
import { calculateInvoiceSummary } from '../../src/domain/creditCard/invoiceCalculator.js';
import { getExpensesByCompetence } from '../../src/domain/competence/competenceEngine.js';
import { calculateFinancialForecast } from '../../src/domain/forecast/forecastEngine.js';

describe('settlementEngine — Motor Puro de Liquidação Antecipada do Crédito (Fase 3.5)', () => {

    it('1. isSettled com array vazio ou nulo retorna null', () => {
        assert.equal(isInstallmentSettled([], 'tx-1', 1), null);
        assert.equal(isInstallmentSettled(null, 'tx-1', 1), null);
        assert.equal(isInstallmentSettled(undefined, 'tx-1', 1), null);
        assert.equal(isInstallmentSettled(new Map(), 'tx-1', 1), null);
        assert.equal(isInstallmentSettled([], null, 1), null);
    });

    it('2. isSettled para compra à vista (parcela_numero = 1) quitada', () => {
        const settlements = [
            { id: 's-1', user_id: 'u-1', transacao_id: 'tx-avista', parcela_numero: 1, valor: 150, data_liquidacao: '2026-08-10', forma_liquidacao: 'PIX' }
        ];
        const settleMap = createSettlementMap(settlements);

        const resDirect = isInstallmentSettled(settlements, 'tx-avista', 1);
        const resMap = isInstallmentSettled(settleMap, 'tx-avista', 1);

        assert.ok(resDirect);
        assert.equal(resDirect.valor, 150);
        assert.equal(resDirect.forma_liquidacao, 'PIX');
        assert.deepEqual(resDirect, resMap);
    });

    it('3. isSettled para parcelamento (1/3 quitada, 2/3 e 3/3 pendentes)', () => {
        const settlements = [
            { id: 's-1', user_id: 'u-1', transacao_id: 'tx-3x', parcela_numero: 1, valor: 100, data_liquidacao: '2026-08-01', forma_liquidacao: 'PIX' }
        ];
        const settleMap = createSettlementMap(settlements);

        assert.ok(isInstallmentSettled(settleMap, 'tx-3x', 1));
        assert.equal(isInstallmentSettled(settleMap, 'tx-3x', 2), null);
        assert.equal(isInstallmentSettled(settleMap, 'tx-3x', 3), null);
    });

    it('4. isSettled para parcelamento do meio quitado (2/3 quitada, 1/3 e 3/3 pendentes)', () => {
        const settlements = [
            { id: 's-2', user_id: 'u-1', transacao_id: 'tx-3x', parcela_numero: 2, valor: 100, data_liquidacao: '2026-09-01', forma_liquidacao: 'PIX' }
        ];
        const settleMap = createSettlementMap(settlements);

        assert.equal(isInstallmentSettled(settleMap, 'tx-3x', 1), null);
        assert.ok(isInstallmentSettled(settleMap, 'tx-3x', 2));
        assert.equal(isInstallmentSettled(settleMap, 'tx-3x', 3), null);
    });

    it('5. isSettled para última parcela quitada (3/3 quitada)', () => {
        const settlements = [
            { id: 's-3', user_id: 'u-1', transacao_id: 'tx-3x', parcela_numero: 3, valor: 100, data_liquidacao: '2026-10-01', forma_liquidacao: 'PIX' }
        ];
        const settleMap = createSettlementMap(settlements);

        assert.equal(isInstallmentSettled(settleMap, 'tx-3x', 1), null);
        assert.equal(isInstallmentSettled(settleMap, 'tx-3x', 2), null);
        assert.ok(isInstallmentSettled(settleMap, 'tx-3x', 3));
    });

    it('6. isSettled para todas as parcelas quitadas simultaneamente', () => {
        const settlements = [
            { id: 's-1', user_id: 'u-1', transacao_id: 'tx-3x', parcela_numero: 1, valor: 100, data_liquidacao: '2026-08-01', forma_liquidacao: 'PIX' },
            { id: 's-2', user_id: 'u-1', transacao_id: 'tx-3x', parcela_numero: 2, valor: 100, data_liquidacao: '2026-08-01', forma_liquidacao: 'PIX' },
            { id: 's-3', user_id: 'u-1', transacao_id: 'tx-3x', parcela_numero: 3, valor: 100, data_liquidacao: '2026-08-01', forma_liquidacao: 'PIX' }
        ];
        const settleMap = createSettlementMap(settlements);

        assert.ok(isInstallmentSettled(settleMap, 'tx-3x', 1));
        assert.ok(isInstallmentSettled(settleMap, 'tx-3x', 2));
        assert.ok(isInstallmentSettled(settleMap, 'tx-3x', 3));
    });

    it('7. isSettled ignorando IDs que não batem com a transação', () => {
        const settlements = [
            { id: 's-1', user_id: 'u-1', transacao_id: 'tx-other', parcela_numero: 1, valor: 100, data_liquidacao: '2026-08-01', forma_liquidacao: 'PIX' }
        ];
        const settleMap = createSettlementMap(settlements);

        assert.equal(isInstallmentSettled(settleMap, 'tx-target', 1), null);
    });

    it('8. isSettled ignorando número de parcela divergente', () => {
        const settlements = [
            { id: 's-1', user_id: 'u-1', transacao_id: 'tx-target', parcela_numero: 5, valor: 100, data_liquidacao: '2026-08-01', forma_liquidacao: 'PIX' }
        ];
        const settleMap = createSettlementMap(settlements);

        assert.equal(isInstallmentSettled(settleMap, 'tx-target', 1), null);
        assert.equal(isInstallmentSettled(settleMap, 'tx-target', 2), null);
        assert.ok(isInstallmentSettled(settleMap, 'tx-target', 5));
    });

    it('9. Deduplicação e idempotência: múltiplos registros de liquidação para a mesma transação/parcela', () => {
        const settlements = [
            { id: 's-1', user_id: 'u-1', transacao_id: 'tx-1', parcela_numero: 1, valor: 100, data_liquidacao: '2026-08-01', forma_liquidacao: 'PIX' },
            { id: 's-dup', user_id: 'u-1', transacao_id: 'tx-1', parcela_numero: 1, valor: 100, data_liquidacao: '2026-08-01', forma_liquidacao: 'PIX' }
        ];
        const settleMap = createSettlementMap(settlements);

        assert.equal(settleMap.size, 1);
        assert.equal(settleMap.get(buildSettlementKey('tx-1', 1)).id, 's-1');
    });

    it('10. calculateInvoiceSummary com liquidação de compra à vista: reduz totalFaturaSelecionada e marca isLiquidado: true', () => {
        const txs = [
            {
                id: 'tx-avista',
                type: 'DESPESA',
                value: 300,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                rawDate: '2026-08-15',
                year: 2026,
                month: 7,
                parcela: 'À vista'
            }
        ];
        const settlements = [
            { id: 's-1', user_id: 'u-1', transacao_id: 'tx-avista', parcela_numero: 1, valor: 300, data_liquidacao: '2026-08-16', forma_liquidacao: 'PIX' }
        ];

        const res = calculateInvoiceSummary('2026-7', txs, settlements);

        assert.equal(res.totalFaturaSelecionada, 0, 'O saldo devedor em aberto na fatura deve ser zero');
        assert.equal(res.totalFaturaBruta, 300, 'O total bruto da fatura continua R$ 300');
        assert.equal(res.totalLiquidadoNaCompetencia, 300, 'O total liquidado nesta competência deve ser R$ 300');
        assert.equal(res.itemsNoMes.length, 1);
        assert.equal(res.itemsNoMes[0].isLiquidado, true);
        assert.ok(res.itemsNoMes[0].liquidacao);
        assert.equal(res.itemsNoMes[0].liquidacao.forma_liquidacao, 'PIX');
        assert.deepEqual(res.cartoesMap, {}, 'Cartão liquidado não deve constar como dívida aberta');
    });

    it('11. calculateInvoiceSummary com liquidação de 1ª parcela de 3: totalFaturaSelecionada exclui a 1ª, totalRestanteFuturo mantém 2ª e 3ª', () => {
        const txs = [
            {
                id: 'tx-parcelada',
                type: 'DESPESA',
                value: 200,
                pagamento: 'Cartão de Crédito',
                cartao: 'Inter',
                rawDate: '2026-08-10',
                year: 2026,
                month: 7,
                parcela: '1/3'
            }
        ];
        // 1ª parcela quitada
        const settlements = [
            { id: 's-1', user_id: 'u-1', transacao_id: 'tx-parcelada', parcela_numero: 1, valor: 200, data_liquidacao: '2026-08-11', forma_liquidacao: 'PIX' }
        ];

        const res = calculateInvoiceSummary('2026-7', txs, settlements);

        assert.equal(res.totalFaturaSelecionada, 0, 'Fatura atual 1/3 quitada tem saldo aberto 0');
        assert.equal(res.totalFaturaBruta, 200);
        assert.equal(res.totalLiquidadoNaCompetencia, 200);
        assert.equal(res.totalFaturaSeguinte, 200, 'Fatura seguinte (2/3) permanece pendente');
        assert.equal(res.totalRestanteFuturo, 400, 'Restante futuro das parcelas 2 e 3 soma R$ 400');
        assert.equal(res.itemsNoMes[0].isLiquidado, true);
        assert.equal(res.itemsNoMes[0].restanteAposEsteMes, 400);
    });

    it('12. calculateInvoiceSummary com liquidação de parcela futura (2ª parcela): fatura atual mantém 1ª parcela, mas fatura seguinte e totalRestanteFuturo excluem a 2ª', () => {
        const txs = [
            {
                id: 'tx-parcelada',
                type: 'DESPESA',
                value: 200,
                pagamento: 'Cartão de Crédito',
                cartao: 'Inter',
                rawDate: '2026-08-10',
                year: 2026,
                month: 7,
                parcela: '1/3'
            }
        ];
        // Apenas a 2ª parcela quitada antecipadamente
        const settlements = [
            { id: 's-2', user_id: 'u-1', transacao_id: 'tx-parcelada', parcela_numero: 2, valor: 200, data_liquidacao: '2026-08-11', forma_liquidacao: 'PIX' }
        ];

        const res = calculateInvoiceSummary('2026-7', txs, settlements);

        assert.equal(res.totalFaturaSelecionada, 200, 'Fatura atual (1/3) permanece pendente');
        assert.equal(res.totalLiquidadoNaCompetencia, 0);
        assert.equal(res.totalFaturaSeguinte, 0, 'Fatura seguinte (2/3) foi quitada antecipadamente');
        assert.equal(res.totalRestanteFuturo, 200, 'Restante futuro considera apenas a parcela 3 (R$ 200)');
        assert.equal(res.itemsNoMes[0].isLiquidado, false);
        assert.equal(res.itemsNoMes[0].restanteAposEsteMes, 200);
    });

    it('13. calculateInvoiceSummary com liquidação e múltiplos cartões', () => {
        const txs = [
            { id: 't1', type: 'DESPESA', value: 100, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-10', year: 2026, month: 7, parcela: 'À vista' },
            { id: 't2', type: 'DESPESA', value: 250, pagamento: 'Cartão de Crédito', cartao: 'XP', rawDate: '2026-08-12', year: 2026, month: 7, parcela: 'À vista' }
        ];
        const settlements = [
            { id: 's-1', user_id: 'u-1', transacao_id: 't1', parcela_numero: 1, valor: 100, data_liquidacao: '2026-08-11', forma_liquidacao: 'PIX' }
        ];

        const res = calculateInvoiceSummary('2026-7', txs, settlements);

        assert.equal(res.totalFaturaSelecionada, 250);
        assert.equal(res.totalFaturaBruta, 350);
        assert.equal(res.totalLiquidadoNaCompetencia, 100);
        assert.deepEqual(res.cartoesMap, { XP: 250 });
    });

    it('14. Reversão: remoção da liquidação restaura o item para pendente e restabelece os totais da fatura', () => {
        const txs = [
            { id: 't1', type: 'DESPESA', value: 150, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-10', year: 2026, month: 7, parcela: 'À vista' }
        ];

        // Estado inicial: quitado
        let settlements = [
            { id: 's-1', user_id: 'u-1', transacao_id: 't1', parcela_numero: 1, valor: 150, data_liquidacao: '2026-08-11', forma_liquidacao: 'PIX' }
        ];
        let res = calculateInvoiceSummary('2026-7', txs, settlements);
        assert.equal(res.totalFaturaSelecionada, 0);
        assert.equal(res.itemsNoMes[0].isLiquidado, true);

        // Reversão (exclusão da liquidação)
        settlements = [];
        res = calculateInvoiceSummary('2026-7', txs, settlements);
        assert.equal(res.totalFaturaSelecionada, 150);
        assert.equal(res.itemsNoMes[0].isLiquidado, false);
        assert.equal(res.itemsNoMes[0].liquidacao, null);
    });

    it('15. Isolamento por usuário: liquidação de outro usuário não afeta a fatura do usuário atual', () => {
        const txs = [
            { id: 'tx-userA', type: 'DESPESA', value: 500, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-10', year: 2026, month: 7, parcela: 'À vista' }
        ];
        // Liquidação pertence a outra transação / outro usuário
        const settlements = [
            { id: 's-other', user_id: 'userB', transacao_id: 'tx-userB', parcela_numero: 1, valor: 500, data_liquidacao: '2026-08-11', forma_liquidacao: 'PIX' }
        ];

        const res = calculateInvoiceSummary('2026-7', txs, settlements);

        assert.equal(res.totalFaturaSelecionada, 500);
        assert.equal(res.itemsNoMes[0].isLiquidado, false);
    });

    it('16. Imunidade contra double counting: getExpensesByCompetence preserva o total de despesas sem duplicar despesa ao quitar', () => {
        const txs = [
            { id: 'tx-1', type: 'DESPESA', value: 600, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-10', year: 2026, month: 7, parcela: '1/3' }
        ];

        const expenses = getExpensesByCompetence('2026-7', txs);
        assert.equal(expenses.length, 1);
        assert.equal(expenses[0].value, 600);
        assert.equal(expenses[0].pagamento, 'Cartão de Crédito');
    });

    it('17. Integração com forecastEngine: despesas futuras quitadas antecipadamente reduzem o comprometimento futuro', () => {
        const txs = [
            { id: 'tx-parc', type: 'DESPESA', value: 200, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-10', year: 2026, month: 7, parcela: '1/3' }
        ];
        // Parcela 2 (Setembro) quitada antecipadamente
        const settlements = [
            { id: 's-2', user_id: 'u-1', transacao_id: 'tx-parc', parcela_numero: 2, valor: 200, data_liquidacao: '2026-08-11', forma_liquidacao: 'PIX' }
        ];

        const forecast = calculateFinancialForecast('2026-7', 3, txs, settlements);

        // Mês 0 (Agosto/2026 - Parcela 1/3 pendente)
        assert.equal(forecast[0].totalComprometido, 200);
        assert.equal(forecast[0].items[0].isLiquidado, false);

        // Mês 1 (Setembro/2026 - Parcela 2/3 quitada antecipadamente)
        assert.equal(forecast[1].totalComprometido, 0, 'Comprometimento deve ser R$ 0 pois a parcela já foi quitada');
        assert.equal(forecast[1].totalCartao, 0);
        assert.equal(forecast[1].items[0].isLiquidado, true);

        // Mês 2 (Outubro/2026 - Parcela 3/3 pendente)
        assert.equal(forecast[2].totalComprometido, 200);
        assert.equal(forecast[2].items[0].isLiquidado, false);
    });

});
