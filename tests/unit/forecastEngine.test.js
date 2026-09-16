import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFinancialForecast } from '../../src/domain/forecast/forecastEngine.js';

describe('forecastEngine — Motor Puro de Previsão Financeira 2.0', () => {

    it('1. horizonte vazio/inválido: aplica fallback para horizonte padrão de 6 meses', () => {
        const resNull = calculateFinancialForecast('2026-7', null, []);
        assert.equal(resNull.length, 6);
        assert.equal(resNull[0].yearMonth, '2026-7');

        const resZero = calculateFinancialForecast('2026-7', 0, []);
        assert.equal(resZero.length, 6);

        const resInvalid = calculateFinancialForecast('2026-7', -3, []);
        assert.equal(resInvalid.length, 6);
    });

    it('2. 3 meses: projeta exatamente 3 competências consecutivas', () => {
        const res = calculateFinancialForecast('2026-7', 3, []);
        assert.equal(res.length, 3);
        assert.deepEqual(res.map(m => m.yearMonth), ['2026-7', '2026-8', '2026-9']);
        assert.equal(res[0].isCurrentMonth, true);
        assert.equal(res[1].isCurrentMonth, false);
        assert.equal(res[2].isCurrentMonth, false);
    });

    it('3. 6 meses: projeta 6 competências consecutivas com labels corretos', () => {
        const res = calculateFinancialForecast('2026-7', 6, []);
        assert.equal(res.length, 6);
        assert.deepEqual(res.map(m => m.yearMonth), [
            '2026-7', '2026-8', '2026-9', '2026-10', '2026-11', '2027-0'
        ]);
        assert.equal(res[0].label, 'Agosto/2026');
        assert.equal(res[0].shortLabel, 'AGO/26');
        assert.equal(res[5].label, 'Janeiro/2027');
        assert.equal(res[5].shortLabel, 'JAN/27');
    });

    it('4. 12 meses: projeta 12 competências atravessando o ano inteiro', () => {
        const res = calculateFinancialForecast('2026-7', 12, []);
        assert.equal(res.length, 12);
        assert.equal(res[0].yearMonth, '2026-7');
        assert.equal(res[11].yearMonth, '2027-6'); // Julho/2027
    });

    it('5. nenhuma transação: retorna estrutura limpa sem NaN ou Infinity com totais zerados', () => {
        const res = calculateFinancialForecast('2026-7', 3, []);
        res.forEach(m => {
            assert.equal(m.totalComprometido, 0);
            assert.equal(m.totalCartao, 0);
            assert.equal(m.totalParcelas, 0);
            assert.equal(m.totalRecorrentes, 0);
            assert.equal(m.totalOutros, 0);
            assert.equal(m.receitasConfirmadas, 0);
            assert.equal(m.investimentosConfirmados, 0);
            assert.deepEqual(m.byCard, {});
            assert.deepEqual(m.byCategory, {});
            assert.deepEqual(m.items, []);
        });
    });

    it('6. apenas despesa imediata: aloca no mês corrente e zera meses futuros', () => {
        const txs = [
            { id: '1', type: 'DESPESA', value: 80, pagamento: 'PIX', rawDate: '2026-08-15', year: 2026, month: 7, category: 'Alimentação' }
        ];
        const res = calculateFinancialForecast('2026-7', 3, txs);
        assert.equal(res[0].totalComprometido, 80);
        assert.equal(res[0].totalOutros, 80);
        assert.equal(res[0].totalCartao, 0);
        assert.deepEqual(res[0].byCategory, { 'Alimentação': 80 });

        assert.equal(res[1].totalComprometido, 0);
        assert.equal(res[2].totalComprometido, 0);
    });

    it('7. cartão à vista: aloca na competência alvo (ATUAL vs PROXIMA)', () => {
        const txs = [
            { id: 'c1', type: 'DESPESA', value: 120, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-05', year: 2026, month: 7, faturaDestino: 'ATUAL', category: 'Transporte' },
            { id: 'c2', type: 'DESPESA', value: 250, pagamento: 'Cartão de Crédito', cartao: 'XP', rawDate: '2026-08-28', year: 2026, month: 7, faturaDestino: 'PROXIMA', category: 'Lazer' }
        ];
        const res = calculateFinancialForecast('2026-7', 3, txs);

        // Mês 1 (Agosto 2026-7): apenas c1
        assert.equal(res[0].totalComprometido, 120);
        assert.equal(res[0].totalCartao, 120);
        assert.deepEqual(res[0].byCard, { 'Nubank': 120 });
        assert.deepEqual(res[0].byCategory, { 'Transporte': 120 });

        // Mês 2 (Setembro 2026-8): apenas c2
        assert.equal(res[1].totalComprometido, 250);
        assert.equal(res[1].totalCartao, 250);
        assert.deepEqual(res[1].byCard, { 'XP': 250 });
        assert.deepEqual(res[1].byCategory, { 'Lazer': 250 });

        // Mês 3 (Outubro 2026-9): nada
        assert.equal(res[2].totalComprometido, 0);
    });

    it('8. parcelamento atravessando meses: projeta parcelas 1/3, 2/3, 3/3 e zera após término', () => {
        const txs = [
            { id: 'p1', type: 'DESPESA', value: 100, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-10', year: 2026, month: 7, parcela: '1/3', faturaDestino: 'ATUAL', category: 'Eletrônicos', desc: 'Fone' }
        ];
        const res = calculateFinancialForecast('2026-7', 4, txs);

        // Agosto (1/3)
        assert.equal(res[0].totalComprometido, 100);
        assert.equal(res[0].totalParcelas, 100);
        assert.equal(res[0].items[0].parcelaExibida, '1/3');

        // Setembro (2/3)
        assert.equal(res[1].totalComprometido, 100);
        assert.equal(res[1].totalParcelas, 100);
        assert.equal(res[1].items[0].parcelaExibida, '2/3');

        // Outubro (3/3)
        assert.equal(res[2].totalComprometido, 100);
        assert.equal(res[2].totalParcelas, 100);
        assert.equal(res[2].items[0].parcelaExibida, '3/3');

        // Novembro (terminou)
        assert.equal(res[3].totalComprometido, 0);
        assert.equal(res[3].totalParcelas, 0);
        assert.equal(res[3].items.length, 0);
    });

    it('9. recorrente: projeta continuamente em todos os meses do horizonte', () => {
        const txs = [
            { id: 'rec', type: 'DESPESA', value: 39.90, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-01', year: 2026, month: 7, parcela: 'RECORRENTE', faturaDestino: 'ATUAL', category: 'Serviços' }
        ];
        const res = calculateFinancialForecast('2026-7', 6, txs);
        res.forEach(m => {
            assert.equal(m.totalComprometido, 39.90);
            assert.equal(m.totalRecorrentes, 39.90);
            assert.equal(m.totalCartao, 39.90);
            assert.equal(m.items[0].parcelaExibida, '🔄 Recorrente');
        });
    });

    it('10. receita futura confirmada: agrega no mês correspondente sem misturar com obrigações', () => {
        const txs = [
            { id: 'rec-futura', type: 'RECEITA', value: 6000, rawDate: '2026-09-05', year: 2026, month: 8 }
        ];
        const res = calculateFinancialForecast('2026-7', 3, txs);
        assert.equal(res[0].receitasConfirmadas, 0);
        assert.equal(res[1].receitasConfirmadas, 6000);
        assert.equal(res[2].receitasConfirmadas, 0);
        assert.equal(res[1].totalComprometido, 0); // receitas não entram no total comprometido
    });

    it('11. investimento futuro confirmado: agrega no mês correspondente', () => {
        const txs = [
            { id: 'inv-futuro', type: 'INVESTIMENTO', value: 1500, rawDate: '2026-10-10', year: 2026, month: 9 }
        ];
        const res = calculateFinancialForecast('2026-7', 4, txs);
        assert.equal(res[0].investimentosConfirmados, 0);
        assert.equal(res[1].investimentosConfirmados, 0);
        assert.equal(res[2].investimentosConfirmados, 1500);
        assert.equal(res[3].investimentosConfirmados, 0);
    });

    it('12. estorno/valor negativo: reduz o total comprometido algebricamente', () => {
        const txs = [
            { id: 'c1', type: 'DESPESA', value: 300, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-10', year: 2026, month: 7, parcela: 'À vista' },
            { id: 'estorno', type: 'DESPESA', value: -100, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-12', year: 2026, month: 7, parcela: 'À vista' }
        ];
        const res = calculateFinancialForecast('2026-7', 2, txs);
        assert.equal(res[0].totalComprometido, 200);
        assert.equal(res[0].totalCartao, 200);
        assert.equal(res[0].byCard['Nubank'], 200);
    });

    it('13. dois cartões: totaliza e detalha por cartão em byCard', () => {
        const txs = [
            { id: '1', type: 'DESPESA', value: 100, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-01', year: 2026, month: 7, parcela: 'À vista' },
            { id: '2', type: 'DESPESA', value: 200, pagamento: 'Cartão de Crédito', cartao: 'XP', rawDate: '2026-08-01', year: 2026, month: 7, parcela: 'À vista' }
        ];
        const res = calculateFinancialForecast('2026-7', 2, txs);
        assert.equal(res[0].totalComprometido, 300);
        assert.equal(res[0].totalCartao, 300);
        assert.deepEqual(res[0].byCard, {
            'Nubank': 100,
            'XP': 200
        });
    });

    it('14. duas categorias: totaliza e detalha por categoria em byCategory', () => {
        const txs = [
            { id: '1', type: 'DESPESA', value: 50, pagamento: 'PIX', rawDate: '2026-08-01', year: 2026, month: 7, category: 'Alimentação' },
            { id: '2', type: 'DESPESA', value: 70, pagamento: 'PIX', rawDate: '2026-08-01', year: 2026, month: 7, category: 'Saúde' }
        ];
        const res = calculateFinancialForecast('2026-7', 2, txs);
        assert.equal(res[0].totalComprometido, 120);
        assert.deepEqual(res[0].byCategory, {
            'Alimentação': 50,
            'Saúde': 70
        });
    });

    it('15. virada dezembro → janeiro: projeta competências do ano seguinte com datas e labels corretos', () => {
        const txs = [
            { id: 'p-virada', type: 'DESPESA', value: 500, pagamento: 'Cartão de Crédito', cartao: 'Inter', rawDate: '2026-11-15', year: 2026, month: 10, parcela: '1/3', faturaDestino: 'ATUAL', desc: 'TV' }
        ];
        // Novembro 2026 -> Dezembro 2026 -> Janeiro 2027
        const res = calculateFinancialForecast('2026-10', 4, txs);
        assert.equal(res[0].yearMonth, '2026-10'); // Nov/26
        assert.equal(res[0].label, 'Novembro/2026');
        assert.equal(res[0].totalComprometido, 500);

        assert.equal(res[1].yearMonth, '2026-11'); // Dez/26
        assert.equal(res[1].label, 'Dezembro/2026');
        assert.equal(res[1].totalComprometido, 500);

        assert.equal(res[2].yearMonth, '2027-0'); // Jan/27
        assert.equal(res[2].label, 'Janeiro/2027');
        assert.equal(res[2].totalComprometido, 500);

        assert.equal(res[3].yearMonth, '2027-1'); // Fev/27
        assert.equal(res[3].totalComprometido, 0);
    });

    it('16. combinação realista de receitas, despesas imediatas, cartão à vista, parcelas e investimentos', () => {
        const txs = [
            { id: 'r1', type: 'RECEITA', value: 8000, rawDate: '2026-08-05', year: 2026, month: 7 },
            { id: 'r2', type: 'RECEITA', value: 8000, rawDate: '2026-09-05', year: 2026, month: 8 },
            { id: 'd-pix', type: 'DESPESA', value: 200, pagamento: 'PIX', rawDate: '2026-08-02', year: 2026, month: 7, category: 'Mercado' },
            { id: 'c-vista', type: 'DESPESA', value: 300, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-10', year: 2026, month: 7, parcela: 'À vista', faturaDestino: 'ATUAL', category: 'Gasolina' },
            { id: 'c-parc', type: 'DESPESA', value: 150, pagamento: 'Cartão de Crédito', cartao: 'XP', rawDate: '2026-08-12', year: 2026, month: 7, parcela: '1/3', faturaDestino: 'ATUAL', category: 'Curso', desc: 'Inglês' },
            { id: 'c-rec', type: 'DESPESA', value: 45, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-01', year: 2026, month: 7, parcela: 'RECORRENTE', faturaDestino: 'ATUAL', category: 'Streaming' },
            { id: 'inv', type: 'INVESTIMENTO', value: 1000, rawDate: '2026-08-10', year: 2026, month: 7 }
        ];

        const res = calculateFinancialForecast('2026-7', 3, txs);

        // Mês 0 (Agosto): 200 (pix) + 300 (cartão à vista) + 150 (parc 1/3) + 45 (rec) = 695
        assert.equal(res[0].totalComprometido, 695);
        assert.equal(res[0].receitasConfirmadas, 8000);
        assert.equal(res[0].investimentosConfirmados, 1000);
        assert.equal(res[0].totalCartao, 495);
        assert.equal(res[0].totalParcelas, 150);
        assert.equal(res[0].totalRecorrentes, 45);
        assert.equal(res[0].totalOutros, 200);

        // Mês 1 (Setembro): 150 (parc 2/3) + 45 (rec) = 195
        assert.equal(res[1].totalComprometido, 195);
        assert.equal(res[1].receitasConfirmadas, 8000);
        assert.equal(res[1].investimentosConfirmados, 0);
        assert.equal(res[1].totalCartao, 195);
        assert.equal(res[1].totalParcelas, 150);
        assert.equal(res[1].totalRecorrentes, 45);
        assert.equal(res[1].totalOutros, 0);

        // Mês 2 (Outubro): 150 (parc 3/3) + 45 (rec) = 195
        assert.equal(res[2].totalComprometido, 195);
        assert.equal(res[2].receitasConfirmadas, 0);
        assert.equal(res[2].totalCartao, 195);
    });

    it('17. equivalência estrutural com a implementação legada de getFinancialForecast', () => {
        const complexTransactions = [
            { id: '1', type: 'DESPESA', value: 45, pagamento: 'PIX', rawDate: '2026-08-01', year: 2026, month: 7, desc: 'Lanche', category: 'Alimentação' },
            { id: '2', type: 'DESPESA', value: 120, pagamento: 'Dinheiro', rawDate: '2026-08-05', year: 2026, month: 7, desc: 'Mercado', category: 'Alimentação' },
            { id: '3', type: 'DESPESA', value: 150, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-10', year: 2026, month: 7, parcela: 'À vista', faturaDestino: 'ATUAL', desc: 'Gasolina', category: 'Transporte' },
            { id: '4', type: 'DESPESA', value: 200, pagamento: 'Cartão de Crédito', cartao: 'XP', rawDate: '2026-08-28', year: 2026, month: 7, parcela: 'À vista', faturaDestino: 'PROXIMA', desc: 'Jantar', category: 'Lazer' },
            { id: '5', type: 'DESPESA', value: 300, pagamento: 'Cartão de Crédito', cartao: 'Inter', rawDate: '2026-07-15', year: 2026, month: 6, parcela: '2/4', faturaDestino: 'ATUAL', desc: 'Móveis', category: 'Casa' },
            { id: '6', type: 'DESPESA', value: 39.90, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-06-01', year: 2026, month: 5, parcela: 'RECORRENTE', faturaDestino: 'ATUAL', desc: 'Spotify', category: 'Lazer' },
            { id: '7', type: 'RECEITA', value: 5000, pagamento: 'PIX', rawDate: '2026-08-05', year: 2026, month: 7 },
            { id: '8', type: 'RECEITA', value: 5000, pagamento: 'PIX', rawDate: '2026-09-05', year: 2026, month: 8 },
            { id: '9', type: 'INVESTIMENTO', value: 1000, pagamento: 'PIX', rawDate: '2026-08-07', year: 2026, month: 7 },
            { id: '10', type: 'DESPESA', value: -50, pagamento: 'Cartão de Crédito', cartao: 'Nubank', rawDate: '2026-08-12', year: 2026, month: 7, parcela: 'À vista', faturaDestino: 'ATUAL', desc: 'Estorno', category: 'Transporte' }
        ];

        // Implementação de referência legada congelada:
        function legacyGetFinancialExpensesForMonth(selectedYm, globalData) {
            if (selectedYm === 'all') return globalData.filter(d => d.type === 'DESPESA');
            const [targetYear, targetMonth] = selectedYm.split('-').map(Number);
            const immediate = globalData.filter(d =>
                d.type === 'DESPESA' &&
                d.pagamento !== 'Cartão de Crédito' &&
                !d.cartao &&
                `${d.year}-${d.month}` === selectedYm
            );
            const despesasCartao = globalData.filter(d =>
                d.type === 'DESPESA' && (d.cartao || d.pagamento === 'Cartão de Crédito')
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
                        while (originalMonth < 0) { originalMonth += 12; originalYear -= 1; }
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
                const pertenceNoMesTarget = item.isRecorrente ? (deltaTarget >= 0) : (item.isParcelado ? (parcelaNoMesTarget >= 1 && parcelaNoMesTarget <= item.total) : (deltaTarget === 0));
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

        function legacyGetFinancialForecast(startYm, horizonMonths = 6, globalData = []) {
            let startYear, startMonth;
            if (startYm && startYm !== 'all' && startYm.includes('-')) {
                const parts = startYm.split('-').map(Number);
                startYear = parts[0];
                startMonth = parts[1];
            } else {
                const now = new Date();
                startYear = now.getFullYear();
                startMonth = now.getMonth();
            }
            const monthNamesBR = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
            const months = [];
            for (let i = 0; i < horizonMonths; i++) {
                const d = new Date(startYear, startMonth + i, 1);
                const y = d.getFullYear();
                const m = d.getMonth();
                const ymKey = `${y}-${m}`;
                const rawItems = legacyGetFinancialExpensesForMonth(ymKey, globalData);
                const items = rawItems.map(item => ({
                    ...item,
                    valorOriginal: item.value,
                    valorLiquidado: 0,
                    obrigacaoRestante: item.value,
                    isLiquidado: false,
                    isLiquidadoParcial: false,
                    liquidacao: null
                }));
                const totalComprometido = items.reduce((acc, item) => acc + item.value, 0);
                const cartaoItems = items.filter(item => item.cartao || item.pagamento === 'Cartão de Crédito');
                const parcelasItems = items.filter(item => item.isParcelado);
                const recorrentesItems = items.filter(item => item.isRecorrente);
                const outrosItems = items.filter(item => !item.cartao && item.pagamento !== 'Cartão de Crédito' && !item.isParcelado && !item.isRecorrente);
                const byCard = {};
                cartaoItems.forEach(item => {
                    const cardName = item.cartao || 'Cartão';
                    byCard[cardName] = (byCard[cardName] || 0) + item.value;
                });
                const byCategory = {};
                items.forEach(item => {
                    const catName = item.category || 'Outros';
                    byCategory[catName] = (byCategory[catName] || 0) + item.value;
                });
                const receitasConfirmadas = globalData
                    .filter(d => d.type === 'RECEITA' && `${d.year}-${d.month}` === ymKey)
                    .reduce((acc, d) => acc + d.value, 0);
                const investimentosConfirmados = globalData
                    .filter(d => d.type === 'INVESTIMENTO' && `${d.year}-${d.month}` === ymKey)
                    .reduce((acc, d) => acc + d.value, 0);
                months.push({
                    index: i,
                    isCurrentMonth: (i === 0),
                    year: y,
                    month: m,
                    yearMonth: ymKey,
                    label: `${monthNamesBR[m]}/${y}`,
                    shortLabel: `${monthNamesBR[m].substring(0, 3).toUpperCase()}/${String(y).slice(-2)}`,
                    totalComprometido,
                    totalCartao: cartaoItems.reduce((acc, d) => acc + d.value, 0),
                    totalParcelas: parcelasItems.reduce((acc, d) => acc + d.value, 0),
                    totalRecorrentes: recorrentesItems.reduce((acc, d) => acc + d.value, 0),
                    totalOutros: outrosItems.reduce((acc, d) => acc + d.value, 0),
                    receitasConfirmadas,
                    investimentosConfirmados,
                    byCard,
                    byCategory,
                    totalPrevistoAssinaturas: 0,
                    totalPrevistoPix: 0,
                    totalPrevistoAgendamentos: 0,
                    totalProjetadoComPrevisao: totalComprometido,
                    scheduledOccurrences: [],
                    items
                });
            }
            return months;
        }

        const horizons = [3, 6, 12];
        const startMonths = ['2026-6', '2026-7', '2026-8', '2026-11'];

        for (const ym of startMonths) {
            for (const h of horizons) {
                const legacyRes = legacyGetFinancialForecast(ym, h, complexTransactions);
                const domainRes = calculateFinancialForecast(ym, h, complexTransactions);
                assert.deepStrictEqual(domainRes, legacyRes, `Falha de equivalência para ym=${ym}, h=${h}`);
            }
        }
    });

    describe('Liquidação Antecipada na Previsão Financeira (Fase 4.7-B)', () => {
        const baseCompraCartao = {
            id: 'tx-cc-1',
            type: 'DESPESA',
            value: 500,
            pagamento: 'Cartão de Crédito',
            cartao: 'Nubank',
            rawDate: '2026-08-10',
            year: 2026,
            month: 7,
            faturaDestino: 'ATUAL',
            parcela: '1/1',
            desc: 'Compra Eletro',
            category: 'Casa'
        };

        it('1. Parcela de 500 sem liquidação => previsão 500', () => {
            const res = calculateFinancialForecast('2026-7', 2, [baseCompraCartao], []);
            assert.equal(res[0].totalComprometido, 500);
            assert.equal(res[0].totalCartao, 500);
            assert.equal(res[0].byCard['Nubank'], 500);
            assert.equal(res[0].byCategory['Casa'], 500);
            assert.equal(res[0].items[0].valorOriginal, 500);
            assert.equal(res[0].items[0].valorLiquidado, 0);
            assert.equal(res[0].items[0].obrigacaoRestante, 500);
            assert.equal(res[0].items[0].isLiquidado, false);
            assert.equal(res[0].items[0].isLiquidadoParcial, false);
        });

        it('2. Parcela de 500 + liquidação válida de 500 => previsão 0', () => {
            const settlement = {
                id: 'set-1',
                transacao_id: 'tx-cc-1',
                parcela_numero: 1,
                valor: 500,
                forma_liquidacao: 'PIX',
                data_liquidacao: '2026-08-15',
                status: 'ATIVA'
            };
            const res = calculateFinancialForecast('2026-7', 2, [baseCompraCartao], [settlement]);
            assert.equal(res[0].totalComprometido, 0);
            assert.equal(res[0].totalCartao, 0);
            assert.equal(res[0].byCard['Nubank'], undefined);
            assert.equal(res[0].items[0].valorOriginal, 500);
            assert.equal(res[0].items[0].valorLiquidado, 500);
            assert.equal(res[0].items[0].obrigacaoRestante, 0);
            assert.equal(res[0].items[0].isLiquidado, true);
            assert.equal(res[0].items[0].isLiquidadoParcial, false);
        });

        it('3. Parcela de 500 + liquidação válida parcial de 300 => previsão 200', () => {
            const settlement = {
                id: 'set-2',
                transacao_id: 'tx-cc-1',
                parcela_numero: 1,
                valor: 300,
                forma_liquidacao: 'PIX',
                data_liquidacao: '2026-08-15',
                status: 'ATIVA'
            };
            const res = calculateFinancialForecast('2026-7', 2, [baseCompraCartao], [settlement]);
            assert.equal(res[0].totalComprometido, 200);
            assert.equal(res[0].totalCartao, 200);
            assert.equal(res[0].byCard['Nubank'], 200);
            assert.equal(res[0].byCategory['Casa'], 200);
            assert.equal(res[0].items[0].valorOriginal, 500);
            assert.equal(res[0].items[0].valorLiquidado, 300);
            assert.equal(res[0].items[0].obrigacaoRestante, 200);
            assert.equal(res[0].items[0].isLiquidado, false);
            assert.equal(res[0].items[0].isLiquidadoParcial, true);
        });

        it('4. Liquidação revertida (CANCELADA ou cancelled_at) => restaura valor devido de 500', () => {
            const settlement = {
                id: 'set-3',
                transacao_id: 'tx-cc-1',
                parcela_numero: 1,
                valor: 500,
                forma_liquidacao: 'PIX',
                data_liquidacao: '2026-08-15',
                status: 'CANCELADA',
                cancelled_at: '2026-08-16T10:00:00Z'
            };
            const res = calculateFinancialForecast('2026-7', 2, [baseCompraCartao], [settlement]);
            assert.equal(res[0].totalComprometido, 500);
            assert.equal(res[0].totalCartao, 500);
            assert.equal(res[0].items[0].valorLiquidado, 0);
            assert.equal(res[0].items[0].obrigacaoRestante, 500);
            assert.equal(res[0].items[0].isLiquidado, false);
        });

        it('5. Liquidação superior ao devido (ex: 600) => prevê 0 (nunca negativo)', () => {
            const settlement = {
                id: 'set-4',
                transacao_id: 'tx-cc-1',
                parcela_numero: 1,
                valor: 600,
                forma_liquidacao: 'PIX',
                data_liquidacao: '2026-08-15',
                status: 'ATIVA'
            };
            const res = calculateFinancialForecast('2026-7', 2, [baseCompraCartao], [settlement]);
            assert.equal(res[0].totalComprometido, 0);
            assert.equal(res[0].totalCartao, 0);
            assert.equal(res[0].items[0].obrigacaoRestante, 0);
            assert.equal(res[0].items[0].isLiquidado, true);
        });

        it('6. Liquidação de outra compra/parcela não interfere na obrigação desta', () => {
            const settlementOutro = {
                id: 'set-outro',
                transacao_id: 'tx-cc-outra',
                parcela_numero: 1,
                valor: 500,
                forma_liquidacao: 'PIX',
                data_liquidacao: '2026-08-15',
                status: 'ATIVA'
            };
            const res = calculateFinancialForecast('2026-7', 2, [baseCompraCartao], [settlementOutro]);
            assert.equal(res[0].totalComprometido, 500);
            assert.equal(res[0].totalCartao, 500);
            assert.equal(res[0].items[0].obrigacaoRestante, 500);
        });

        it('7. Preservação da despesa econômica original no item', () => {
            const settlement = {
                id: 'set-orig',
                transacao_id: 'tx-cc-1',
                parcela_numero: 1,
                valor: 500,
                forma_liquidacao: 'PIX',
                data_liquidacao: '2026-08-15',
                status: 'ATIVA'
            };
            const res = calculateFinancialForecast('2026-7', 2, [baseCompraCartao], [settlement]);
            // A compra original permanece nos items para fins de rastreabilidade
            assert.equal(res[0].items.length, 1);
            assert.equal(res[0].items[0].valorOriginal, 500);
            assert.equal(res[0].items[0].value, 500);
            assert.equal(res[0].items[0].obrigacaoRestante, 0);
        });

        it('8. Parcelamento em 3x (3 x R$ 200) com quitação antecipada apenas da parcela 2', () => {
            const parcelamento = [
                {
                    id: 'tx-parc-seed',
                    type: 'DESPESA',
                    value: 200,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    rawDate: '2026-08-05',
                    year: 2026,
                    month: 7,
                    faturaDestino: 'ATUAL',
                    parcela: '1/3',
                    desc: 'Smartphone 3x',
                    category: 'Tecnologia',
                    grupo_parcela_id: 'grp-phone'
                }
            ];

            // Liquidação da parcela 2 (setembro/2026)
            const settlementP2 = {
                id: 'set-p2',
                grupo_parcela_id: 'grp-phone',
                parcela_numero: 2,
                valor: 200,
                forma_liquidacao: 'PIX',
                data_liquidacao: '2026-08-20',
                status: 'ATIVA'
            };

            const res = calculateFinancialForecast('2026-7', 3, parcelamento, [settlementP2]);

            // Mês 1 (Agosto - parcela 1/3): devida R$ 200
            assert.equal(res[0].totalComprometido, 200);
            assert.equal(res[0].totalParcelas, 200);
            assert.equal(res[0].items[0].obrigacaoRestante, 200);

            // Mês 2 (Setembro - parcela 2/3): liquidada antecipadamente R$ 200 => obrigação R$ 0
            assert.equal(res[1].totalComprometido, 0);
            assert.equal(res[1].totalParcelas, 0);
            assert.equal(res[1].items[0].obrigacaoRestante, 0);
            assert.equal(res[1].items[0].isLiquidado, true);

            // Mês 3 (Outubro - parcela 3/3): devida R$ 200
            assert.equal(res[2].totalComprometido, 200);
            assert.equal(res[2].totalParcelas, 200);
            assert.equal(res[2].items[0].obrigacaoRestante, 200);
        });

        it('9. Preservação rigorosa da Fase 4.6 (PREVISTO ≠ REALIZADO) junto com Liquidação Antecipada', () => {
            const occs = [
                {
                    id: 'occ-1',
                    tipo: 'assinatura_cartao',
                    valor_previsto: 49.90,
                    data_prevista: '2026-08-15',
                    status: 'PREVISTA'
                },
                {
                    id: 'occ-2',
                    tipo: 'pix_agendado',
                    valor_previsto: 100.00,
                    data_prevista: '2026-08-20',
                    status: 'PREVISTA'
                }
            ];

            const settlement = {
                id: 'set-1',
                transacao_id: 'tx-cc-1',
                parcela_numero: 1,
                valor: 500,
                forma_liquidacao: 'PIX',
                data_liquidacao: '2026-08-15',
                status: 'ATIVA'
            };

            const res = calculateFinancialForecast('2026-7', 2, [baseCompraCartao], [settlement], occs);

            // Comprometido efetivo (cartão liquidado) = 0
            assert.equal(res[0].totalComprometido, 0);
            // Previsões de agendamento permanecem intactas
            assert.equal(res[0].totalPrevistoAssinaturas, 49.90);
            assert.equal(res[0].totalPrevistoPix, 100.00);
            assert.equal(res[0].totalPrevistoAgendamentos, 149.90);
            assert.equal(res[0].totalProjetadoComPrevisao, 149.90);
        });
    });
});
