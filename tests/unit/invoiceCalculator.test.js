import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    groupCreditCardPurchases,
    projectCardExpensesForCompetence,
    calculateInvoiceSummary
} from '../../src/domain/creditCard/invoiceCalculator.js';

describe('invoiceCalculator — Calculadora Pura de Faturas e Parcelamentos', () => {

    it('1. vazio: deve retornar estrutura zerada para array vazio ou parâmetros inválidos', () => {
        const emptyResult = calculateInvoiceSummary('2026-7', []);
        assert.equal(emptyResult.targetYear, 2026);
        assert.equal(emptyResult.targetMonth, 7);
        assert.equal(emptyResult.nextYear, 2026);
        assert.equal(emptyResult.nextMonth, 8);
        assert.equal(emptyResult.totalFaturaSelecionada, 0);
        assert.equal(emptyResult.totalFaturaSeguinte, 0);
        assert.equal(emptyResult.totalRestanteFuturo, 0);
        assert.deepEqual(emptyResult.itemsNoMes, []);
        assert.deepEqual(emptyResult.cartoesMap, {});

        const nullResult = calculateInvoiceSummary('2026-7', null);
        assert.equal(nullResult.totalFaturaSelecionada, 0);
        assert.deepEqual(nullResult.itemsNoMes, []);

        const invalidYm = calculateInvoiceSummary('invalido', [{ type: 'DESPESA', cartao: 'Nubank', value: 100 }]);
        assert.equal(invalidYm.totalFaturaSelecionada, 0);
        assert.deepEqual(invalidYm.itemsNoMes, []);
    });

    it('2. crédito à vista: deve alocar compra à vista sem faturaDestino na competência da data', () => {
        const txs = [
            {
                id: 'c-avista',
                type: 'DESPESA',
                value: 120,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                rawDate: '2026-08-15',
                year: 2026,
                month: 7,
                parcela: 'À vista'
            }
        ];
        const res = calculateInvoiceSummary('2026-7', txs);
        assert.equal(res.totalFaturaSelecionada, 120);
        assert.equal(res.totalFaturaSeguinte, 0);
        assert.equal(res.totalRestanteFuturo, 0);
        assert.equal(res.itemsNoMes.length, 1);
        assert.equal(res.itemsNoMes[0].parcelaExibida, 'À vista');
        assert.equal(res.itemsNoMes[0].parcelaNoMes, 1);
        assert.equal(res.itemsNoMes[0].restanteAposEsteMes, 0);
    });

    it('3. ATUAL: deve alocar compra com faturaDestino "ATUAL" no mês da compra', () => {
        const txs = [
            {
                id: 'c-atual',
                type: 'DESPESA',
                value: 85,
                pagamento: 'Cartão de Crédito',
                cartao: 'Inter',
                rawDate: '2026-08-02',
                year: 2026,
                month: 7,
                parcela: 'À vista',
                faturaDestino: 'ATUAL'
            }
        ];
        const res = calculateInvoiceSummary('2026-7', txs);
        assert.equal(res.totalFaturaSelecionada, 85);
        assert.equal(res.itemsNoMes.length, 1);
        assert.equal(res.itemsNoMes[0].id, 'c-atual');

        const outroMes = calculateInvoiceSummary('2026-8', txs);
        assert.equal(outroMes.totalFaturaSelecionada, 0);
    });

    it('4. PROXIMA: deve alocar compra com faturaDestino "PROXIMA" no mês seguinte', () => {
        const txs = [
            {
                id: 'c-prox',
                type: 'DESPESA',
                value: 200,
                pagamento: 'Cartão de Crédito',
                cartao: 'XP',
                rawDate: '2026-08-28',
                year: 2026,
                month: 7,
                parcela: 'À vista',
                faturaDestino: 'PROXIMA'
            }
        ];
        // Agosto (7): fatura seguinte recebe 200, selecionada 0
        const resAgosto = calculateInvoiceSummary('2026-7', txs);
        assert.equal(resAgosto.totalFaturaSelecionada, 0);
        assert.equal(resAgosto.totalFaturaSeguinte, 200);
        assert.equal(resAgosto.itemsNoMes.length, 0);

        // Setembro (8): fatura selecionada recebe 200
        const resSetembro = calculateInvoiceSummary('2026-8', txs);
        assert.equal(resSetembro.totalFaturaSelecionada, 200);
        assert.equal(resSetembro.itemsNoMes.length, 1);
        assert.equal(resSetembro.itemsNoMes[0].id, 'c-prox');
    });

    it('5. fatura absoluta: deve alocar compra com fatura explícita no formato "YYYY-M"', () => {
        const txs = [
            {
                id: 'c-abs',
                type: 'DESPESA',
                value: 450,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                rawDate: '2026-08-10',
                year: 2026,
                month: 7,
                faturaDestino: '2026-10' // Novembro 2026 (mês 10 base 0)
            }
        ];
        assert.equal(calculateInvoiceSummary('2026-7', txs).totalFaturaSelecionada, 0);
        assert.equal(calculateInvoiceSummary('2026-8', txs).totalFaturaSelecionada, 0);
        assert.equal(calculateInvoiceSummary('2026-9', txs).totalFaturaSelecionada, 0);

        const resNov = calculateInvoiceSummary('2026-10', txs);
        assert.equal(resNov.totalFaturaSelecionada, 450);
        assert.equal(resNov.itemsNoMes.length, 1);
    });

    it('6. parcela 1/3: deve alocar 1ª parcela, projetar fatura seguinte e calcular restante futuro', () => {
        const txs = [
            {
                id: 'p-1-3',
                type: 'DESPESA',
                value: 100,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                rawDate: '2026-08-15',
                year: 2026,
                month: 7,
                parcela: '1/3',
                faturaDestino: 'ATUAL',
                desc: 'Monitor'
            }
        ];
        const res = calculateInvoiceSummary('2026-7', txs);
        assert.equal(res.totalFaturaSelecionada, 100);
        assert.equal(res.totalFaturaSeguinte, 100); // parcela 2/3 no próximo mês
        assert.equal(res.totalRestanteFuturo, 200); // restam 2 parcelas (2/3 e 3/3) = 2 * 100 = 200
        assert.equal(res.itemsNoMes[0].parcelaExibida, '1/3');
        assert.equal(res.itemsNoMes[0].parcelaNoMes, 1);
        assert.equal(res.itemsNoMes[0].restanteAposEsteMes, 200);
    });

    it('7. parcela 2/3: deve alocar 2ª parcela no mês 2 e calcular 1 parcela restante', () => {
        const txs = [
            {
                id: 'p-1-3',
                type: 'DESPESA',
                value: 100,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                rawDate: '2026-08-15',
                year: 2026,
                month: 7,
                parcela: '1/3',
                faturaDestino: 'ATUAL',
                desc: 'Monitor'
            }
        ];
        const res = calculateInvoiceSummary('2026-8', txs);
        assert.equal(res.totalFaturaSelecionada, 100);
        assert.equal(res.totalFaturaSeguinte, 100); // parcela 3/3 no próximo mês
        assert.equal(res.totalRestanteFuturo, 100); // resta 1 parcela = 100
        assert.equal(res.itemsNoMes[0].parcelaExibida, '2/3');
        assert.equal(res.itemsNoMes[0].parcelaNoMes, 2);
        assert.equal(res.itemsNoMes[0].restanteAposEsteMes, 100);
    });

    it('8. parcela 3/3: deve alocar última parcela com restante futuro zerado', () => {
        const txs = [
            {
                id: 'p-1-3',
                type: 'DESPESA',
                value: 100,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                rawDate: '2026-08-15',
                year: 2026,
                month: 7,
                parcela: '1/3',
                faturaDestino: 'ATUAL',
                desc: 'Monitor'
            }
        ];
        const res = calculateInvoiceSummary('2026-9', txs);
        assert.equal(res.totalFaturaSelecionada, 100);
        assert.equal(res.totalFaturaSeguinte, 0);
        assert.equal(res.totalRestanteFuturo, 0); // nenhuma parcela restante
        assert.equal(res.itemsNoMes[0].parcelaExibida, '3/3');
        assert.equal(res.itemsNoMes[0].parcelaNoMes, 3);
        assert.equal(res.itemsNoMes[0].restanteAposEsteMes, 0);
    });

    it('9. depois da última parcela: não deve incluir o item nem computar totais', () => {
        const txs = [
            {
                id: 'p-1-3',
                type: 'DESPESA',
                value: 100,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                rawDate: '2026-08-15',
                year: 2026,
                month: 7,
                parcela: '1/3',
                faturaDestino: 'ATUAL',
                desc: 'Monitor'
            }
        ];
        const res = calculateInvoiceSummary('2026-10', txs);
        assert.equal(res.totalFaturaSelecionada, 0);
        assert.equal(res.totalFaturaSeguinte, 0);
        assert.equal(res.totalRestanteFuturo, 0);
        assert.equal(res.itemsNoMes.length, 0);
    });

    it('10. parcelamento atravessando ano: calcula corretamente de Novembro/2026 a Março/2027', () => {
        const txs = [
            {
                id: 'p-ano',
                type: 'DESPESA',
                value: 200,
                pagamento: 'Cartão de Crédito',
                cartao: 'XP',
                rawDate: '2026-11-10',
                year: 2026,
                month: 10,
                parcela: '1/4',
                faturaDestino: 'ATUAL',
                desc: 'Passagem'
            }
        ];
        // Nov/2026: 1/4 (resta 600)
        const nov = calculateInvoiceSummary('2026-10', txs);
        assert.equal(nov.totalFaturaSelecionada, 200);
        assert.equal(nov.totalRestanteFuturo, 600);
        assert.equal(nov.itemsNoMes[0].parcelaExibida, '1/4');

        // Dez/2026: 2/4 (resta 400)
        const dez = calculateInvoiceSummary('2026-11', txs);
        assert.equal(dez.totalFaturaSelecionada, 200);
        assert.equal(dez.totalRestanteFuturo, 400);
        assert.equal(dez.itemsNoMes[0].parcelaExibida, '2/4');

        // Jan/2027: 3/4 (resta 200)
        const jan = calculateInvoiceSummary('2027-0', txs);
        assert.equal(jan.totalFaturaSelecionada, 200);
        assert.equal(jan.totalRestanteFuturo, 200);
        assert.equal(jan.itemsNoMes[0].parcelaExibida, '3/4');

        // Fev/2027: 4/4 (resta 0)
        const fev = calculateInvoiceSummary('2027-1', txs);
        assert.equal(fev.totalFaturaSelecionada, 200);
        assert.equal(fev.totalRestanteFuturo, 0);
        assert.equal(fev.itemsNoMes[0].parcelaExibida, '4/4');

        // Mar/2027: acabou
        const mar = calculateInvoiceSummary('2027-2', txs);
        assert.equal(mar.totalFaturaSelecionada, 0);
        assert.equal(mar.totalRestanteFuturo, 0);
    });

    it('11. recorrente: projeta mensalmente sem inflar o total restante futuro como dívida finita', () => {
        const txs = [
            {
                id: 'rec-net',
                type: 'DESPESA',
                value: 55.90,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                rawDate: '2026-08-01',
                year: 2026,
                month: 7,
                parcela: 'RECORRENTE',
                faturaDestino: 'ATUAL',
                desc: 'Netflix'
            }
        ];
        const res = calculateInvoiceSummary('2026-7', txs);
        assert.equal(res.totalFaturaSelecionada, 55.90);
        assert.equal(res.totalFaturaSeguinte, 55.90);
        assert.equal(res.totalRestanteFuturo, 0); // recorrente não é dívida finita
        assert.equal(res.itemsNoMes[0].parcelaExibida, '🔄 Recorrente');
        assert.equal(res.itemsNoMes[0].restanteAposEsteMes, 0);
    });

    it('12. dois cartões: separa e totaliza cartões no cartoesMap', () => {
        const txs = [
            { id: '1', type: 'DESPESA', value: 100, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-05', year: 2026, month: 7, parcela: 'À vista' },
            { id: '2', type: 'DESPESA', value: 250, pagamento: 'Cartão de Crédito', cartao: 'XP', rawDate: '2026-08-06', year: 2026, month: 7, parcela: 'À vista' },
            { id: '3', type: 'DESPESA', value: 50, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-07', year: 2026, month: 7, parcela: 'À vista' }
        ];
        const res = calculateInvoiceSummary('2026-7', txs);
        assert.equal(res.totalFaturaSelecionada, 400);
        assert.deepEqual(res.cartoesMap, {
            'Nubank': 150,
            'XP': 250
        });
    });

    it('13. grupo_parcela_id: deduplica registros de parcelas salvas com mesmo UUID', () => {
        const txs = [
            { id: 'p1', grupo_parcela_id: 'uuid-abc', type: 'DESPESA', value: 80, pagamento: 'Cartão de Crédito', cartao: 'Inter', rawDate: '2026-08-10', year: 2026, month: 7, parcela: '1/3', faturaDestino: 'ATUAL', desc: 'Tênis' },
            { id: 'p2', grupo_parcela_id: 'uuid-abc', type: 'DESPESA', value: 80, pagamento: 'Cartão de Crédito', cartao: 'Inter', rawDate: '2026-09-10', year: 2026, month: 8, parcela: '2/3', faturaDestino: 'ATUAL', desc: 'Tênis' }
        ];
        const ago = calculateInvoiceSummary('2026-7', txs);
        assert.equal(ago.totalFaturaSelecionada, 80);
        assert.equal(ago.itemsNoMes.length, 1);
        assert.equal(ago.itemsNoMes[0].parcelaExibida, '1/3');
        assert.equal(ago.totalRestanteFuturo, 160); // 2 parcelas restantes = 160

        const set = calculateInvoiceSummary('2026-8', txs);
        assert.equal(set.totalFaturaSelecionada, 80);
        assert.equal(set.itemsNoMes.length, 1);
        assert.equal(set.itemsNoMes[0].parcelaExibida, '2/3');
        assert.equal(set.totalRestanteFuturo, 80);
    });

    it('14. fallback heurístico: deduplica parcelas legadas sem grupo_parcela_id por chave composta', () => {
        const txs = [
            { id: 'leg1', type: 'DESPESA', value: 150, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-07-01', year: 2026, month: 6, parcela: '1/2', faturaDestino: 'ATUAL', desc: 'Curso' },
            { id: 'leg2', type: 'DESPESA', value: 150, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-01', year: 2026, month: 7, parcela: '2/2', faturaDestino: 'ATUAL', desc: 'Curso' }
        ];
        const jul = calculateInvoiceSummary('2026-6', txs);
        assert.equal(jul.totalFaturaSelecionada, 150);
        assert.equal(jul.itemsNoMes.length, 1);
        assert.equal(jul.itemsNoMes[0].parcelaExibida, '1/2');

        const ago = calculateInvoiceSummary('2026-7', txs);
        assert.equal(ago.totalFaturaSelecionada, 150);
        assert.equal(ago.itemsNoMes.length, 1);
        assert.equal(ago.itemsNoMes[0].parcelaExibida, '2/2');
    });

    it('15. duas compras independentes: preserva duas compras simultâneas de mesmo valor com nomes distintos', () => {
        const txs = [
            { id: 'c1', type: 'DESPESA', value: 100, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-15', year: 2026, month: 7, parcela: '1/2', faturaDestino: 'ATUAL', desc: 'Farmácia A' },
            { id: 'c2', type: 'DESPESA', value: 100, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-15', year: 2026, month: 7, parcela: '1/2', faturaDestino: 'ATUAL', desc: 'Farmácia B' }
        ];
        const res = calculateInvoiceSummary('2026-7', txs);
        assert.equal(res.totalFaturaSelecionada, 200);
        assert.equal(res.itemsNoMes.length, 2);
    });

    it('16. estorno negativo: subtrai do total da fatura selecionada preservando o cálculo', () => {
        const txs = [
            { id: 'c1', type: 'DESPESA', value: 300, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-10', year: 2026, month: 7, parcela: 'À vista' },
            { id: 'estorno', type: 'DESPESA', value: -100, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-12', year: 2026, month: 7, parcela: 'À vista' }
        ];
        const res = calculateInvoiceSummary('2026-7', txs);
        assert.equal(res.totalFaturaSelecionada, 200);
        assert.equal(res.cartoesMap['Nubank'], 200);
    });

    it('17. total da fatura: soma compras à vista, parceladas e recorrentes na competência correta', () => {
        const txs = [
            { id: '1', type: 'DESPESA', value: 100, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-01', year: 2026, month: 7, parcela: 'À vista' },
            { id: '2', type: 'DESPESA', value: 50, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-02', year: 2026, month: 7, parcela: '1/2', faturaDestino: 'ATUAL', desc: 'P2' },
            { id: '3', type: 'DESPESA', value: 30, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-03', year: 2026, month: 7, parcela: 'RECORRENTE', faturaDestino: 'ATUAL', desc: 'R3' }
        ];
        const res = calculateInvoiceSummary('2026-7', txs);
        assert.equal(res.totalFaturaSelecionada, 180);
    });

    it('18. fatura seguinte: projeta corretamente o valor da competência subsequente', () => {
        const txs = [
            { id: '1', type: 'DESPESA', value: 100, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-01', year: 2026, month: 7, parcela: 'À vista', faturaDestino: 'PROXIMA' },
            { id: '2', type: 'DESPESA', value: 50, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-02', year: 2026, month: 7, parcela: '1/3', faturaDestino: 'ATUAL', desc: 'P2' },
            { id: '3', type: 'DESPESA', value: 30, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-03', year: 2026, month: 7, parcela: 'RECORRENTE', faturaDestino: 'ATUAL', desc: 'R3' }
        ];
        // Em Agosto (7):
        // Fatura seguinte (Setembro 8) terá:
        // Item 1: PROXIMA (100)
        // Item 2: Parcela 2/3 (50)
        // Item 3: Recorrente (30)
        // Total Fatura Seguinte = 100 + 50 + 30 = 180
        const res = calculateInvoiceSummary('2026-7', txs);
        assert.equal(res.totalFaturaSeguinte, 180);
    });

    it('19. restante futuro: soma parcelas remanescentes de todas as compras parceladas futuras', () => {
        const txs = [
            { id: '1', type: 'DESPESA', value: 100, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-01', year: 2026, month: 7, parcela: '1/3', faturaDestino: 'ATUAL', desc: 'Compra A' },
            { id: '2', type: 'DESPESA', value: 50, pagamento: 'Cartão de Crédito', cartao: 'XP', rawDate: '2026-08-01', year: 2026, month: 7, parcela: '2/4', faturaDestino: 'ATUAL', desc: 'Compra B' }
        ];
        // Compra A (1/3 em Agosto): restam 2 parcelas = 200
        // Compra B (2/4 em Agosto): restam 2 parcelas = 100
        // Total restante futuro em Agosto = 300
        const res = calculateInvoiceSummary('2026-7', txs);
        assert.equal(res.totalRestanteFuturo, 300);
    });

    it('20. agrupamento por cartão: ignora transações não-cartão e agrega múltiplos cartões', () => {
        const txs = [
            { id: '1', type: 'DESPESA', value: 100, pagamento: 'PIX', rawDate: '2026-08-01', year: 2026, month: 7 },
            { id: '2', type: 'DESPESA', value: 50, pagamento: 'Dinheiro', rawDate: '2026-08-01', year: 2026, month: 7 },
            { id: '3', type: 'DESPESA', value: 120, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-01', year: 2026, month: 7, parcela: 'À vista' },
            { id: '4', type: 'DESPESA', value: 80, pagamento: 'Cartão de Crédito', cartao: 'Inter', rawDate: '2026-08-01', year: 2026, month: 7, parcela: 'À vista' }
        ];
        const res = calculateInvoiceSummary('2026-7', txs);
        assert.equal(res.totalFaturaSelecionada, 200);
        assert.deepEqual(res.cartoesMap, {
            'Nubank': 120,
            'Inter': 80
        });
    });

    it('21. equivalência estrita (deepStrictEqual) com a implementação legada de renderParcelasTab', () => {
        const complexTransactions = [
            { id: '1', type: 'DESPESA', value: 45, pagamento: 'PIX', rawDate: '2026-08-01', year: 2026, month: 7, desc: 'Lanche' },
            { id: '2', type: 'DESPESA', value: 120, pagamento: 'Dinheiro', rawDate: '2026-08-05', year: 2026, month: 7, desc: 'Mercado' },
            { id: '3', type: 'DESPESA', value: 150, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-10', year: 2026, month: 7, parcela: 'À vista', faturaDestino: 'ATUAL', desc: 'Gasolina' },
            { id: '4', type: 'DESPESA', value: 200, pagamento: 'Cartão de Crédito', cartao: 'XP', rawDate: '2026-08-28', year: 2026, month: 7, parcela: 'À vista', faturaDestino: 'PROXIMA', desc: 'Jantar' },
            { id: '5', type: 'DESPESA', value: 300, pagamento: 'Cartão de Crédito', cartao: 'Inter', rawDate: '2026-07-15', year: 2026, month: 6, parcela: '2/4', faturaDestino: 'ATUAL', desc: 'Móveis' },
            { id: '6', type: 'DESPESA', value: 39.90, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-06-01', year: 2026, month: 5, parcela: 'RECORRENTE', faturaDestino: 'ATUAL', desc: 'Spotify' },
            { id: '7', type: 'RECEITA', value: 5000, pagamento: 'PIX', rawDate: '2026-08-05', year: 2026, month: 7 },
            { id: '8', type: 'DESPESA', value: -50, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-12', year: 2026, month: 7, parcela: 'À vista', faturaDestino: 'ATUAL', desc: 'Estorno' }
        ];

        function legacyCalculateInvoice(targetYm, globalData) {
            if (!targetYm || !targetYm.includes('-')) return null;
            const [targetYear, targetMonth] = targetYm.split('-').map(Number);
            const nextMonthDate = new Date(targetYear, targetMonth + 1, 1);
            const nextYear = nextMonthDate.getFullYear();
            const nextMonth = nextMonthDate.getMonth();

            const despesasCartao = (globalData || []).filter(d => d && d.type === 'DESPESA' && (d.cartao || d.pagamento === 'Cartão de Crédito'));

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

                const pertenceNoMesTarget = item.isRecorrente ? (deltaTarget >= 0) : (parcelaNoMesTarget >= 1 && parcelaNoMesTarget <= item.total);
                const pertenceNoMesNext = item.isRecorrente ? (deltaNext >= 0) : (parcelaNoMesNext >= 1 && parcelaNoMesNext <= item.total);

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

        const months = ['2026-5', '2026-6', '2026-7', '2026-8', '2026-9', '2026-10'];
        for (const ym of months) {
            const legacyRes = legacyCalculateInvoice(ym, complexTransactions);
            const domainRes = calculateInvoiceSummary(ym, complexTransactions);
            assert.deepStrictEqual(domainRes, legacyRes, `Falha de equivalência estrita para ${ym}`);
        }
    });
});
