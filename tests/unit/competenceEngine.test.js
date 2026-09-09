import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getExpensesByCompetence } from '../../src/domain/competence/competenceEngine.js';

describe('competenceEngine — getExpensesByCompetence', () => {

    it('1. deve retornar array vazio para entradas nulas, indefinidas ou vazias', () => {
        assert.deepEqual(getExpensesByCompetence('2026-8', null), []);
        assert.deepEqual(getExpensesByCompetence('2026-8', undefined), []);
        assert.deepEqual(getExpensesByCompetence('2026-8', []), []);
        assert.deepEqual(getExpensesByCompetence(null, []), []);
        assert.deepEqual(getExpensesByCompetence('invalido', []), []);
    });

    it('2. deve retornar todas as despesas quando selectedYm for "all"', () => {
        const txs = [
            { type: 'DESPESA', value: 100, year: 2026, month: 7 },
            { type: 'DESPESA', value: 200, year: 2026, month: 8 },
            { type: 'RECEITA', value: 5000, year: 2026, month: 8 },
            { type: 'SAQUE', value: 300, year: 2026, month: 8 }
        ];
        const res = getExpensesByCompetence('all', txs);
        assert.equal(res.length, 2);
        assert.equal(res[0].value, 100);
        assert.equal(res[1].value, 200);
    });

    it('3. deve alocar despesas imediatas (PIX, Dinheiro, Débito) no mês civil da compra', () => {
        const txs = [
            { id: '1', type: 'DESPESA', value: 50, pagamento: 'PIX', rawDate: '2026-09-09', year: 2026, month: 8 },
            { id: '2', type: 'DESPESA', value: 30, pagamento: 'Dinheiro', rawDate: '2026-09-10', year: 2026, month: 8 },
            { id: '3', type: 'DESPESA', value: 80, pagamento: 'Débito', rawDate: '2026-09-11', year: 2026, month: 8 },
            { id: '4', type: 'DESPESA', value: 90, pagamento: 'PIX', rawDate: '2026-08-15', year: 2026, month: 7 }
        ];
        const resSet = getExpensesByCompetence('2026-8', txs);
        assert.equal(resSet.length, 3);
        assert.deepEqual(resSet.map(d => d.id), ['1', '2', '3']);

        const resAgo = getExpensesByCompetence('2026-7', txs);
        assert.equal(resAgo.length, 1);
        assert.equal(resAgo[0].id, '4');
    });

    it('4. deve alocar cartão de crédito à vista com faturaDestino "ATUAL" no mês da compra', () => {
        const txs = [
            {
                id: 'card-atual',
                type: 'DESPESA',
                value: 150,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                rawDate: '2026-09-05',
                year: 2026,
                month: 8,
                parcela: 'À vista',
                faturaDestino: 'ATUAL'
            }
        ];
        const res = getExpensesByCompetence('2026-8', txs);
        assert.equal(res.length, 1);
        assert.equal(res[0].id, 'card-atual');
        assert.equal(res[0].parcelaExibida, 'À vista');
        assert.equal(res[0].parcelaNoMes, 1);

        const resOutroMes = getExpensesByCompetence('2026-9', txs);
        assert.equal(resOutroMes.length, 0);
    });

    it('5. deve alocar cartão de crédito à vista com faturaDestino "PROXIMA" no mês seguinte', () => {
        const txs = [
            {
                id: 'card-prox',
                type: 'DESPESA',
                value: 200,
                pagamento: 'Cartão de Crédito',
                cartao: 'XP',
                rawDate: '2026-08-25',
                year: 2026,
                month: 7,
                parcela: 'À vista',
                faturaDestino: 'PROXIMA'
            }
        ];
        // Compra em Agosto (7), fatura em Setembro (8)
        const resAgosto = getExpensesByCompetence('2026-7', txs);
        assert.equal(resAgosto.length, 0);

        const resSetembro = getExpensesByCompetence('2026-8', txs);
        assert.equal(resSetembro.length, 1);
        assert.equal(resSetembro[0].id, 'card-prox');
        assert.equal(resSetembro[0].parcelaExibida, 'À vista');
    });

    it('6. deve alocar cartão com fatura absoluta no formato "YYYY-M" (base 0)', () => {
        const txs = [
            {
                id: 'card-abs',
                type: 'DESPESA',
                value: 350,
                pagamento: 'Cartão de Crédito',
                cartao: 'Inter',
                rawDate: '2026-08-10',
                year: 2026,
                month: 7,
                faturaDestino: '2026-10' // Novembro/2026 (mês 10 base 0)
            }
        ];
        assert.equal(getExpensesByCompetence('2026-7', txs).length, 0);
        assert.equal(getExpensesByCompetence('2026-8', txs).length, 0);
        assert.equal(getExpensesByCompetence('2026-9', txs).length, 0);

        const resNov = getExpensesByCompetence('2026-10', txs);
        assert.equal(resNov.length, 1);
        assert.equal(resNov[0].id, 'card-abs');
    });

    it('7. deve alocar e numerar parcelas de compra parcelada (1/3, 2/3, 3/3) ao longo dos meses', () => {
        const txs = [
            {
                id: 'parc-1',
                type: 'DESPESA',
                value: 100,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                rawDate: '2026-08-15',
                year: 2026,
                month: 7,
                parcela: '1/3',
                faturaDestino: 'ATUAL',
                desc: 'Smartphone'
            }
        ];

        // Mês 1 (Agosto 2026-7): Parcela 1/3
        const m1 = getExpensesByCompetence('2026-7', txs);
        assert.equal(m1.length, 1);
        assert.equal(m1[0].parcelaExibida, '1/3');
        assert.equal(m1[0].parcelaNoMes, 1);

        // Mês 2 (Setembro 2026-8): Parcela 2/3
        const m2 = getExpensesByCompetence('2026-8', txs);
        assert.equal(m2.length, 1);
        assert.equal(m2[0].parcelaExibida, '2/3');
        assert.equal(m2[0].parcelaNoMes, 2);

        // Mês 3 (Outubro 2026-9): Parcela 3/3
        const m3 = getExpensesByCompetence('2026-9', txs);
        assert.equal(m3.length, 1);
        assert.equal(m3[0].parcelaExibida, '3/3');
        assert.equal(m3[0].parcelaNoMes, 3);

        // Mês 4 (Novembro 2026-10): Terminou, não deve entrar
        const m4 = getExpensesByCompetence('2026-10', txs);
        assert.equal(m4.length, 0);

        // Mês Anterior (Julho 2026-6): Antes da compra, não deve entrar
        const m0 = getExpensesByCompetence('2026-6', txs);
        assert.equal(m0.length, 0);
    });

    it('8. deve tratar corretamente parcelamento atravessando a virada de ano (Dez -> Jan -> Fev)', () => {
        const txs = [
            {
                id: 'parc-virada',
                type: 'DESPESA',
                value: 250,
                pagamento: 'Cartão de Crédito',
                cartao: 'XP',
                rawDate: '2026-12-10',
                year: 2026,
                month: 11, // Dezembro
                parcela: '1/3',
                faturaDestino: 'ATUAL',
                desc: 'Presente Natal'
            }
        ];

        // Dezembro 2026
        const dez = getExpensesByCompetence('2026-11', txs);
        assert.equal(dez.length, 1);
        assert.equal(dez[0].parcelaExibida, '1/3');

        // Janeiro 2027
        const jan = getExpensesByCompetence('2027-0', txs);
        assert.equal(jan.length, 1);
        assert.equal(jan[0].parcelaExibida, '2/3');

        // Fevereiro 2027
        const fev = getExpensesByCompetence('2027-1', txs);
        assert.equal(fev.length, 1);
        assert.equal(fev[0].parcelaExibida, '3/3');

        // Março 2027
        const mar = getExpensesByCompetence('2027-2', txs);
        assert.equal(mar.length, 0);
    });

    it('9. deve alocar despesas recorrentes no mês inicial e em todos os meses futuros', () => {
        const txs = [
            {
                id: 'rec-1',
                type: 'DESPESA',
                value: 49.90,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                rawDate: '2026-08-01',
                year: 2026,
                month: 7,
                parcela: 'RECORRENTE',
                faturaDestino: 'ATUAL',
                desc: 'Assinatura Streaming'
            }
        ];

        // Mês da compra
        const ago = getExpensesByCompetence('2026-7', txs);
        assert.equal(ago.length, 1);
        assert.equal(ago[0].parcelaExibida, '🔄 Recorrente');

        // Meses futuros
        const set = getExpensesByCompetence('2026-8', txs);
        assert.equal(set.length, 1);
        assert.equal(set[0].parcelaExibida, '🔄 Recorrente');

        const dez = getExpensesByCompetence('2026-11', txs);
        assert.equal(dez.length, 1);

        const anoQueVem = getExpensesByCompetence('2027-5', txs);
        assert.equal(anoQueVem.length, 1);

        // Mês anterior não deve ter
        const jul = getExpensesByCompetence('2026-6', txs);
        assert.equal(jul.length, 0);
    });

    it('10. deve deduplicar parcelas registradas com grupo_parcela_id', () => {
        const txs = [
            {
                id: 'p1',
                grupo_parcela_id: 'uuid-123',
                type: 'DESPESA',
                value: 100,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                rawDate: '2026-08-15',
                year: 2026,
                month: 7,
                parcela: '1/3',
                faturaDestino: 'ATUAL',
                desc: 'Curso Online'
            },
            {
                id: 'p2',
                grupo_parcela_id: 'uuid-123',
                type: 'DESPESA',
                value: 100,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                rawDate: '2026-09-15',
                year: 2026,
                month: 8,
                parcela: '2/3',
                faturaDestino: 'ATUAL',
                desc: 'Curso Online'
            }
        ];

        // Em Agosto deve retornar exatamente 1 item (não 2)
        const ago = getExpensesByCompetence('2026-7', txs);
        assert.equal(ago.length, 1);
        assert.equal(ago[0].parcelaExibida, '1/3');

        // Em Setembro deve retornar exatamente 1 item
        const set = getExpensesByCompetence('2026-8', txs);
        assert.equal(set.length, 1);
        assert.equal(set[0].parcelaExibida, '2/3');
    });

    it('11. deve diferenciar duas compras parecidas de mesmo valor com descrições distintas', () => {
        const txs = [
            {
                id: 'c1',
                type: 'DESPESA',
                value: 100,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                rawDate: '2026-08-15',
                year: 2026,
                month: 7,
                parcela: '1/2',
                faturaDestino: 'ATUAL',
                desc: 'Restaurante A'
            },
            {
                id: 'c2',
                type: 'DESPESA',
                value: 100,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                rawDate: '2026-08-15',
                year: 2026,
                month: 7,
                parcela: '1/2',
                faturaDestino: 'ATUAL',
                desc: 'Restaurante B'
            }
        ];

        const res = getExpensesByCompetence('2026-7', txs);
        assert.equal(res.length, 2);
    });

    it('12. deve preservar valores negativos (estornos)', () => {
        const txs = [
            {
                id: 'estorno',
                type: 'DESPESA',
                value: -50,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                rawDate: '2026-08-20',
                year: 2026,
                month: 7,
                parcela: 'À vista',
                faturaDestino: 'ATUAL',
                desc: 'Estorno Compra'
            }
        ];
        const res = getExpensesByCompetence('2026-7', txs);
        assert.equal(res.length, 1);
        assert.equal(res[0].value, -50);
    });

    it('13. deve apresentar equivalência estrita (deepStrictEqual) com a implementação legada', () => {
        const complexTransactions = [
            { id: '1', type: 'DESPESA', value: 45, pagamento: 'PIX', rawDate: '2026-08-01', year: 2026, month: 7, desc: 'Lanche' },
            { id: '2', type: 'DESPESA', value: 120, pagamento: 'Dinheiro', rawDate: '2026-08-05', year: 2026, month: 7, desc: 'Mercado' },
            { id: '3', type: 'DESPESA', value: 150, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-10', year: 2026, month: 7, parcela: 'À vista', faturaDestino: 'ATUAL', desc: 'Gasolina' },
            { id: '4', type: 'DESPESA', value: 200, pagamento: 'Cartão de Crédito', cartao: 'XP', rawDate: '2026-08-28', year: 2026, month: 7, parcela: 'À vista', faturaDestino: 'PROXIMA', desc: 'Jantar' },
            { id: '5', type: 'DESPESA', value: 300, pagamento: 'Cartão de Crédito', cartao: 'Inter', rawDate: '2026-07-15', year: 2026, month: 6, parcela: '2/4', faturaDestino: 'ATUAL', desc: 'Móveis' },
            { id: '6', type: 'DESPESA', value: 39.90, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-06-01', year: 2026, month: 5, parcela: 'RECORRENTE', faturaDestino: 'ATUAL', desc: 'Spotify' },
            { id: '7', type: 'RECEITA', value: 5000, pagamento: 'PIX', rawDate: '2026-08-05', year: 2026, month: 7 },
            { id: '8', type: 'SAQUE', value: 500, pagamento: 'PIX', rawDate: '2026-08-06', year: 2026, month: 7 },
            { id: '9', type: 'INVESTIMENTO', value: 1000, pagamento: 'PIX', rawDate: '2026-08-07', year: 2026, month: 7 }
        ];

        // Implementação de referência legada congelada:
        function legacyGetFinancialExpensesForMonth(selectedYm, globalData) {
            if (selectedYm === 'all') {
                return globalData.filter(d => d.type === 'DESPESA');
            }

            const [targetYear, targetMonth] = selectedYm.split('-').map(Number);

            const immediate = globalData.filter(d =>
                d.type === 'DESPESA' &&
                d.pagamento !== 'Cartão de Crédito' &&
                !d.cartao &&
                `${d.year}-${d.month}` === selectedYm
            );

            const despesasCartao = globalData.filter(d =>
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

        const monthsToTest = ['2026-6', '2026-7', '2026-8', '2026-9', '2026-10', 'all'];

        for (const ym of monthsToTest) {
            const legacyResult = legacyGetFinancialExpensesForMonth(ym, complexTransactions);
            const domainResult = getExpensesByCompetence(ym, complexTransactions);
            assert.deepStrictEqual(domainResult, legacyResult, `Falha de equivalência estrita para ${ym}`);
        }
    });
});
