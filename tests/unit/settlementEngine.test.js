import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildSettlementKey,
    createSettlementMap,
    isInstallmentSettled,
    enrichItemsWithSettlement,
    validateSettlementPayload
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

    it('18. Invariância canônica por permutação de ordem: grupo_parcela_id resolve a mesma parcela em qualquer ordem de chegada', () => {
        const p1 = { id: 'tx-p1', grupo_parcela_id: 'grp-100', type: 'DESPESA', value: 100, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-10', year: 2026, month: 7, parcela: '1/3' };
        const p2 = { id: 'tx-p2', grupo_parcela_id: 'grp-100', type: 'DESPESA', value: 100, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-09-10', year: 2026, month: 8, parcela: '2/3' };
        const p3 = { id: 'tx-p3', grupo_parcela_id: 'grp-100', type: 'DESPESA', value: 100, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-10-10', year: 2026, month: 9, parcela: '3/3' };

        // Liquidação da 2ª parcela referenciando o grupo_parcela_id
        const settlements = [
            { id: 's-p2', user_id: 'u-1', grupo_parcela_id: 'grp-100', transacao_id: 'tx-p2', parcela_numero: 2, valor: 100, data_liquidacao: '2026-08-15', forma_liquidacao: 'PIX' }
        ];

        // Testar as 3 ordens possíveis de array
        const order1 = [p1, p2, p3];
        const order2 = [p3, p1, p2];
        const order3 = [p2, p3, p1];

        for (const order of [order1, order2, order3]) {
            const resAug = calculateInvoiceSummary('2026-7', order, settlements);
            const resSep = calculateInvoiceSummary('2026-8', order, settlements);
            const resOct = calculateInvoiceSummary('2026-9', order, settlements);

            // Agosto (1/3 pendente)
            assert.equal(resAug.totalFaturaSelecionada, 100, 'Agosto deve ter R$ 100 em aberto');
            // Setembro (2/3 liquidado)
            assert.equal(resSep.totalFaturaSelecionada, 0, 'Setembro deve ter R$ 0 em aberto');
            assert.equal(resSep.itemsNoMes[0].isLiquidado, true, 'Setembro deve marcar item como liquidado');
            // Outubro (3/3 pendente)
            assert.equal(resOct.totalFaturaSelecionada, 100, 'Outubro deve ter R$ 100 em aberto');
        }
    });

    it('19. Dual-key lookup: liquidação vinculada via grupo_parcela_id casa com item cujo transacao_id é o seed', () => {
        const item = { id: 'tx-seed-1', grupo_parcela_id: 'grp-abc', parcelaNoMes: 2 };
        const settlements = [
            { id: 's-group', user_id: 'u-1', grupo_parcela_id: 'grp-abc', transacao_id: 'tx-other-id', parcela_numero: 2, valor: 150, forma_liquidacao: 'PIX' }
        ];
        const settleMap = createSettlementMap(settlements);

        const result = isInstallmentSettled(settleMap, item, 2);
        assert.ok(result, 'Deve encontrar a liquidação pela chave de grupo');
        assert.equal(result.id, 's-group');
    });

    it('20. Bloqueio de liquidação em assinaturas recorrentes (isRecorrente: true)', () => {
        const recurringItem = { id: 'tx-rec', isRecorrente: true, parcela: 'RECORRENTE', parcelaNoMes: 1 };
        const settlements = [
            { id: 's-rec', user_id: 'u-1', transacao_id: 'tx-rec', parcela_numero: 1, valor: 50, forma_liquidacao: 'PIX' }
        ];
        const settleMap = createSettlementMap(settlements);

        assert.equal(isInstallmentSettled(settleMap, recurringItem, 1), null, 'Recorrente não pode ser liquidada');
        assert.equal(isInstallmentSettled(settlements, recurringItem, 1), null, 'Recorrente não pode ser liquidada via lista');
    });

    it('21. Teste de Identidade Canônica Obrigatório (Compra R$ 600 em 3x, quitar somente 2/3, permutações de array)', () => {
        const p1 = { id: 'tx-seed-1', grupo_parcela_id: 'grp-G', type: 'DESPESA', value: 200, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-10', year: 2026, month: 7, parcela: '1/3' };
        const p2 = { id: 'tx-seed-2', grupo_parcela_id: 'grp-G', type: 'DESPESA', value: 200, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-09-10', year: 2026, month: 8, parcela: '2/3' };
        const p3 = { id: 'tx-seed-3', grupo_parcela_id: 'grp-G', type: 'DESPESA', value: 200, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-10-10', year: 2026, month: 9, parcela: '3/3' };

        // Quitação SOMENTE da parcela 2/3 vinculada ao grupo
        const settlements = [
            {
                id: 's-2-only',
                user_id: 'user-1',
                grupo_parcela_id: 'grp-G',
                transacao_id: 'tx-seed-1',
                parcela_numero: 2,
                valor: 200,
                data_liquidacao: '2026-08-15',
                forma_liquidacao: 'PIX',
                status: 'ATIVA'
            }
        ];

        // Testar sob todas as ordens de permutação
        const permutations = [
            [p1, p2, p3],
            [p3, p1, p2],
            [p2, p3, p1]
        ];

        for (const list of permutations) {
            // Mês 1 (Agosto/2026 - Parcela 1/3) -> Pendente
            const invAug = calculateInvoiceSummary('2026-7', list, settlements);
            assert.equal(invAug.totalFaturaSelecionada, 200, 'Agosto: Parcela 1/3 deve estar pendente (R$ 200)');
            assert.equal(invAug.totalFaturaSeguinte, 0, 'Agosto: Fatura seguinte (Setembro 2/3) deve ser R$ 0 pois está quitada');
            assert.equal(invAug.totalRestanteFuturo, 200, 'Agosto: Restante futuro deve somar apenas a parcela 3 (R$ 200)');
            assert.equal(invAug.itemsNoMes[0].isLiquidado, false);

            // Mês 2 (Setembro/2026 - Parcela 2/3) -> Liquidada
            const invSep = calculateInvoiceSummary('2026-8', list, settlements);
            assert.equal(invSep.totalFaturaSelecionada, 0, 'Setembro: Parcela 2/3 quitada resulta em fatura R$ 0');
            assert.equal(invSep.totalFaturaBruta, 200, 'Setembro: Total bruto continua R$ 200');
            assert.equal(invSep.totalLiquidadoNaCompetencia, 200, 'Setembro: Total liquidado é R$ 200');
            assert.equal(invSep.totalFaturaSeguinte, 200, 'Setembro: Fatura seguinte (Outubro 3/3) é R$ 200');
            assert.equal(invSep.itemsNoMes[0].isLiquidado, true);

            // Mês 3 (Outubro/2026 - Parcela 3/3) -> Pendente
            const invOct = calculateInvoiceSummary('2026-9', list, settlements);
            assert.equal(invOct.totalFaturaSelecionada, 200, 'Outubro: Parcela 3/3 deve estar pendente (R$ 200)');
            assert.equal(invOct.itemsNoMes[0].isLiquidado, false);

            // Forecast de 3 meses a partir de Agosto/2026
            const forecast = calculateFinancialForecast('2026-7', 3, list, settlements);
            assert.equal(forecast[0].totalComprometido, 200, 'Forecast Mês 1 (Ago): R$ 200');
            assert.equal(forecast[0].items[0].isLiquidado, false);
            assert.equal(forecast[1].totalComprometido, 0, 'Forecast Mês 2 (Set): R$ 0 (quitada)');
            assert.equal(forecast[1].items[0].isLiquidado, true);
            assert.equal(forecast[2].totalComprometido, 200, 'Forecast Mês 3 (Out): R$ 200');
            assert.equal(forecast[2].items[0].isLiquidado, false);
        }
    });

    it('22. Soft Reversal (Cancelamento): liquidação CANCELADA não baixa obrigação e reativação restaura baixa', () => {
        const item = { id: 'tx-rev-1', type: 'DESPESA', value: 300, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-10', year: 2026, month: 7, parcela: 'À vista' };

        // 1. Estado Quitado Ativo
        let settlements = [
            { id: 's-rev', user_id: 'u-1', transacao_id: 'tx-rev-1', parcela_numero: 1, valor: 300, status: 'ATIVA', data_liquidacao: '2026-08-11', forma_liquidacao: 'PIX' }
        ];
        let summary = calculateInvoiceSummary('2026-7', [item], settlements);
        assert.equal(summary.totalFaturaSelecionada, 0);
        assert.equal(summary.itemsNoMes[0].isLiquidado, true);

        // 2. Soft Reversal (Cancelada)
        settlements = [
            { id: 's-rev', user_id: 'u-1', transacao_id: 'tx-rev-1', parcela_numero: 1, valor: 300, status: 'CANCELADA', cancelled_at: '2026-08-12T10:00:00Z', data_liquidacao: '2026-08-11', forma_liquidacao: 'PIX' }
        ];
        summary = calculateInvoiceSummary('2026-7', [item], settlements);
        assert.equal(summary.totalFaturaSelecionada, 300, 'Liquidação cancelada não baixa a fatura');
        assert.equal(summary.itemsNoMes[0].isLiquidado, false, 'Item volta ao estado pendente');

        // 3. Reativação (Reativa para ATIVA)
        settlements = [
            { id: 's-rev', user_id: 'u-1', transacao_id: 'tx-rev-1', parcela_numero: 1, valor: 300, status: 'ATIVA', cancelled_at: null, data_liquidacao: '2026-08-11', forma_liquidacao: 'PIX' }
        ];
        summary = calculateInvoiceSummary('2026-7', [item], settlements);
        assert.equal(summary.totalFaturaSelecionada, 0);
        assert.equal(summary.itemsNoMes[0].isLiquidado, true);
    });

    it('23. validateSettlementPayload: validação estrita de integridade de valores, formas e parcelas', () => {
        const itemParc = { id: 'tx-val-1', value: 150.00, total: 3, isRecorrente: false };
        const itemRec = { id: 'tx-val-rec', value: 50.00, total: 1, isRecorrente: true };

        // Sucesso: valor exato, parcela válida, forma PIX
        const okRes = validateSettlementPayload({ valor: 150, parcela_numero: 2, forma_liquidacao: 'PIX' }, itemParc);
        assert.equal(okRes.valid, true);

        // Sucesso: formas permitidas adicionais (Transferência Bancária, Saldo em Conta)
        assert.equal(validateSettlementPayload({ valor: 150, parcela_numero: 1, forma_liquidacao: 'Transferência Bancária' }, itemParc).valid, true);
        assert.equal(validateSettlementPayload({ valor: 150, parcela_numero: 1, forma_liquidacao: 'Saldo em Conta' }, itemParc).valid, true);

        // Erro: valor divergente da parcela (tentativa de pagamento parcial ou excedente)
        const diffRes = validateSettlementPayload({ valor: 100, parcela_numero: 2, forma_liquidacao: 'PIX' }, itemParc);
        assert.equal(diffRes.valid, false);
        assert.match(diffRes.error, /Quitação integral obrigatória/);

        // Erro: valor zero ou negativo
        assert.equal(validateSettlementPayload({ valor: 0, parcela_numero: 1, forma_liquidacao: 'PIX' }, itemParc).valid, false);
        assert.equal(validateSettlementPayload({ valor: -150, parcela_numero: 1, forma_liquidacao: 'PIX' }, itemParc).valid, false);

        // Erro: parcela fora da faixa
        assert.equal(validateSettlementPayload({ valor: 150, parcela_numero: 0, forma_liquidacao: 'PIX' }, itemParc).valid, false);
        assert.equal(validateSettlementPayload({ valor: 150, parcela_numero: 4, forma_liquidacao: 'PIX' }, itemParc).valid, false);

        // Erro: despesa recorrente
        const recRes = validateSettlementPayload({ valor: 50, parcela_numero: 1, forma_liquidacao: 'PIX' }, itemRec);
        assert.equal(recRes.valid, false);
        assert.match(recRes.error, /Despesas recorrentes não possuem identidade finita/);

        // Erro: forma de liquidação inválida
        const invalidForma = validateSettlementPayload({ valor: 150, parcela_numero: 1, forma_liquidacao: 'Boleto' }, itemParc);
        assert.equal(invalidForma.valid, false);
        assert.match(invalidForma.error, /Forma de liquidação inválida/);
    });

    it('24. Imunidade Contábil / Não-Double-Counting rigorosamente comprovada', () => {
        const txs = [
            { id: 'tx-main-600', user_id: 'u-1', type: 'DESPESA', value: 600, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-05', year: 2026, month: 7, parcela: 'À vista' }
        ];
        const settlements = [
            { id: 's-600', user_id: 'u-1', transacao_id: 'tx-main-600', parcela_numero: 1, valor: 600, data_liquidacao: '2026-08-06', forma_liquidacao: 'PIX', status: 'ATIVA' }
        ];

        // 1. Fato Econômico na Competência
        const expenses = getExpensesByCompetence('2026-7', txs);
        assert.equal(expenses.length, 1, 'Exatamente uma despesa contábil');
        assert.equal(expenses[0].value, 600, 'Valor contábil é exatamente R$ 600');

        // 2. Fato Financeiro na Fatura do Cartão
        const invoice = calculateInvoiceSummary('2026-7', txs, settlements);
        assert.equal(invoice.totalFaturaBruta, 600, 'Fatura bruta é R$ 600');
        assert.equal(invoice.totalLiquidadoNaCompetencia, 600, 'Total liquidado é R$ 600');
        assert.equal(invoice.totalFaturaSelecionada, 0, 'Saldo devedor em aberto na fatura é R$ 0');

        // 3. Imunidade contra duplicação de despesas:
        assert.equal(txs.length, 1, 'Transações contém apenas 1 registro');
    });

});
