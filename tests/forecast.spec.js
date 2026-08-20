// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');
const { mockUser } = require('./fixtures/mockData');

test.describe('Previsão Financeira 2.0 — Motor & Interface', () => {

    test('1. Aba Previsão Financeira carrega e exibe horizonte padrão de 6 meses', async ({ page }) => {
        await setupAuthenticatedApp(page);
        await page.click('button:has-text("🔮 Previsão Financeira")');
        await expect(page.locator('#tab-previsao')).toBeVisible();

        // Botão 6 meses ativo por padrão
        await expect(page.locator('#btnHorizon6')).toHaveClass(/active/);

        // 6 cards mensais no grid
        const cards = page.locator('#forecastMonthGrid .forecast-month-card');
        await expect(cards).toHaveCount(6);
    });

    test('2. Alternância de horizonte para 3 meses', async ({ page }) => {
        await setupAuthenticatedApp(page);
        await page.click('button:has-text("🔮 Previsão Financeira")');

        await page.click('#btnHorizon3');
        await expect(page.locator('#btnHorizon3')).toHaveClass(/active/);
        await expect(page.locator('#btnHorizon6')).not.toHaveClass(/active/);

        const cards = page.locator('#forecastMonthGrid .forecast-month-card');
        await expect(cards).toHaveCount(3);
    });

    test('3. Alternância de horizonte para 12 meses e virada de ano', async ({ page }) => {
        await setupAuthenticatedApp(page);
        await page.click('button:has-text("🔮 Previsão Financeira")');

        await page.click('#btnHorizon12');
        await expect(page.locator('#btnHorizon12')).toHaveClass(/active/);

        const cards = page.locator('#forecastMonthGrid .forecast-month-card');
        await expect(cards).toHaveCount(12);
    });

    test('4. Projeção de compra parcelada finita encerra na última parcela e zera no mês seguinte', async ({ page }) => {
        // Mock com compra parcelada 3x em Agosto/2026 (1/3 em Ago, 2/3 em Set, 3/3 em Out, 0 em Nov)
        const customTxs = [
            {
                id: 'tx-p1',
                user_id: mockUser.id,
                data: '2026-08-05',
                descricao: 'Smartphone Teste',
                categoria: 'Eletrônicos',
                valor: 100.00,
                tipo: 'DESPESA',
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: '1/3',
                fatura_destino: 'ATUAL',
                grupo_parcela_id: 'grp-phone-1'
            }
        ];

        await setupAuthenticatedApp(page, { transactions: customTxs });
        await page.click('button:has-text("🔮 Previsão Financeira")');
        await page.click('#btnHorizon6');

        const cards = page.locator('#forecastMonthGrid .forecast-month-card');
        await expect(cards.nth(0)).toContainText('R$ 100,00');
        await expect(cards.nth(1)).toContainText('R$ 100,00');
        await expect(cards.nth(2)).toContainText('R$ 100,00');
        await expect(cards.nth(3)).toContainText('R$ 0,00');
    });

    test('5. Despesa Recorrente projeta continuamente em todos os meses sem ser tratada como dívida finita', async ({ page }) => {
        const customTxs = [
            {
                id: 'tx-rec1',
                user_id: mockUser.id,
                data: '2026-08-01',
                descricao: 'Streaming Netflix',
                categoria: 'Lazer',
                valor: 55.90,
                tipo: 'DESPESA',
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: 'RECORRENTE',
                fatura_destino: 'ATUAL'
            }
        ];

        await setupAuthenticatedApp(page, { transactions: customTxs });
        await page.click('button:has-text("🔮 Previsão Financeira")');
        await page.click('#btnHorizon6');

        const cards = page.locator('#forecastMonthGrid .forecast-month-card');
        for (let i = 0; i < 6; i++) {
            await expect(cards.nth(i)).toContainText('R$ 55,90');
        }
    });

    test('6. Cartão com fatura PROXIMA projeta para o mês seguinte', async ({ page }) => {
        const customTxs = [
            {
                id: 'tx-prox1',
                user_id: mockUser.id,
                data: '2026-08-25',
                descricao: 'Jantar Fatura Fechada',
                categoria: 'Alimentação',
                valor: 250.00,
                tipo: 'DESPESA',
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: '',
                fatura_destino: 'PROXIMA'
            }
        ];

        await setupAuthenticatedApp(page, { transactions: customTxs });
        await page.click('button:has-text("🔮 Previsão Financeira")');
        await page.click('#btnHorizon3');

        const cards = page.locator('#forecastMonthGrid .forecast-month-card');
        await expect(cards.nth(0)).toContainText('R$ 0,00');
        await expect(cards.nth(1)).toContainText('R$ 250,00');
    });

    test('7. Competência absoluta YYYY-M direciona para a fatura exata', async ({ page }) => {
        const customTxs = [
            {
                id: 'tx-abs1',
                user_id: mockUser.id,
                data: '2026-08-10',
                descricao: 'Compra Fatura Futura Fixada',
                categoria: 'Outros',
                valor: 400.00,
                tipo: 'DESPESA',
                pagamento: 'Cartão de Crédito',
                cartao: 'Mercado Livre',
                parcela: '',
                fatura_destino: '2026-9'
            }
        ];

        await setupAuthenticatedApp(page, { transactions: customTxs });
        await page.click('button:has-text("🔮 Previsão Financeira")');
        await page.click('#btnHorizon6');

        const cards = page.locator('#forecastMonthGrid .forecast-month-card');
        await expect(cards.nth(0)).toContainText('R$ 0,00');
        await expect(cards.nth(1)).toContainText('R$ 0,00');
        await expect(cards.nth(2)).toContainText('R$ 400,00');
    });

    test('8. Parcelamento legado sem grupo_parcela_id é agrupado e projetado corretamente', async ({ page }) => {
        const customTxs = [
            {
                id: 'tx-leg1',
                user_id: mockUser.id,
                data: '2026-08-01',
                descricao: 'Mesa de Escritório',
                categoria: 'Casa',
                valor: 150.00,
                tipo: 'DESPESA',
                pagamento: 'Cartão de Crédito',
                cartao: 'Banco do Brasil',
                parcela: '2/4',
                fatura_destino: 'ATUAL',
                grupo_parcela_id: null
            }
        ];

        await setupAuthenticatedApp(page, { transactions: customTxs });
        await page.click('button:has-text("🔮 Previsão Financeira")');
        await page.click('#btnHorizon6');

        const cards = page.locator('#forecastMonthGrid .forecast-month-card');
        await expect(cards.nth(0)).toContainText('R$ 150,00');
        await expect(cards.nth(1)).toContainText('R$ 150,00');
        await expect(cards.nth(2)).toContainText('R$ 150,00');
        await expect(cards.nth(3)).toContainText('R$ 0,00');
    });

    test('9. Múltiplos cartões somam no mês e detalham por cartão no drill-down', async ({ page }) => {
        const customTxs = [
            {
                id: 'tx-card-a',
                user_id: mockUser.id,
                data: '2026-08-01',
                descricao: 'Supermercado',
                categoria: 'Alimentação',
                valor: 300.00,
                tipo: 'DESPESA',
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: '',
                fatura_destino: 'ATUAL'
            },
            {
                id: 'tx-card-b',
                user_id: mockUser.id,
                data: '2026-08-01',
                descricao: 'Ferramentas',
                categoria: 'Casa',
                valor: 200.00,
                tipo: 'DESPESA',
                pagamento: 'Cartão de Crédito',
                cartao: 'Mercado Livre',
                parcela: '',
                fatura_destino: 'ATUAL'
            }
        ];

        await setupAuthenticatedApp(page, { transactions: customTxs });
        await page.click('button:has-text("🔮 Previsão Financeira")');

        await expect(page.locator('#fdetail-total')).toHaveText('R$ 500,00');
        await expect(page.locator('#forecastByCardList')).toContainText('Nubank');
        await expect(page.locator('#forecastByCardList')).toContainText('R$ 300,00');
        await expect(page.locator('#forecastByCardList')).toContainText('Mercado Livre');
        await expect(page.locator('#forecastByCardList')).toContainText('R$ 200,00');
    });

    test('10. Cartão inativo com parcelas futuras continua sendo projetado no comprometimento', async ({ page }) => {
        const customTxs = [
            {
                id: 'tx-inativo1',
                user_id: mockUser.id,
                data: '2026-08-01',
                descricao: 'Compra Cartão Cancelado',
                categoria: 'Outros',
                valor: 80.00,
                tipo: 'DESPESA',
                pagamento: 'Cartão de Crédito',
                cartao: 'Santander Antigo',
                parcela: '1/2',
                fatura_destino: 'ATUAL'
            }
        ];

        await setupAuthenticatedApp(page, { transactions: customTxs });
        await page.click('button:has-text("🔮 Previsão Financeira")');

        const cards = page.locator('#forecastMonthGrid .forecast-month-card');
        await expect(cards.nth(0)).toContainText('R$ 80,00');
        await expect(cards.nth(1)).toContainText('R$ 80,00');
        await expect(cards.nth(2)).toContainText('R$ 0,00');
    });

    test('11. Drill-down detalha por categoria e lista itens individuais na tabela', async ({ page }) => {
        const customTxs = [
            {
                id: 'tx-det1',
                user_id: mockUser.id,
                data: '2026-08-01',
                descricao: 'Academia Mensal',
                categoria: 'Saúde',
                valor: 120.00,
                tipo: 'DESPESA',
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: 'RECORRENTE',
                fatura_destino: 'ATUAL'
            }
        ];

        await setupAuthenticatedApp(page, { transactions: customTxs });
        await page.click('button:has-text("🔮 Previsão Financeira")');

        await expect(page.locator('#forecastByCategoryList')).toContainText('Saúde');
        await expect(page.locator('#forecastByCategoryList')).toContainText('R$ 120,00');
        await expect(page.locator('#forecastItemsTableBody')).toContainText('Academia Mensal');
        await expect(page.locator('#forecastItemsTableBody')).toContainText('🔄 Recorrente');
    });

    test('12. Widget de resumo no Dashboard principal exibe os próximos 3 meses com botão para previsão', async ({ page }) => {
        const customTxs = [
            {
                id: 'tx-w1',
                user_id: mockUser.id,
                data: '2026-08-01',
                descricao: 'TV Sala',
                categoria: 'Lazer',
                valor: 300.00,
                tipo: 'DESPESA',
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: '1/4',
                fatura_destino: 'ATUAL'
            }
        ];

        await setupAuthenticatedApp(page, { transactions: customTxs });
        await expect(page.locator('#dashboardForecastWidget')).toBeVisible();

        const dashCards = page.locator('#dashboardForecastCards > div');
        await expect(dashCards).toHaveCount(3);
        await expect(dashCards.nth(0)).toContainText('R$ 300,00');

        await page.click('#dashboardForecastWidget button:has-text("Ver Previsão Completa")');
        await expect(page.locator('#tab-previsao')).toBeVisible();
    });

    test('13. Receitas e Investimentos futuros confirmados aparecem em destaque sem misturar com obrigações', async ({ page }) => {
        const customTxs = [
            {
                id: 'tx-rec-fut',
                user_id: mockUser.id,
                data: '2026-09-15',
                descricao: 'Bônus semestral confirmado',
                categoria: 'Bônus',
                valor: 2000.00,
                tipo: 'RECEITA',
                pagamento: 'PIX'
            },
            {
                id: 'tx-inv-fut',
                user_id: mockUser.id,
                data: '2026-09-20',
                descricao: 'Aporte Tesouro Direto',
                categoria: 'Renda Fixa',
                valor: 500.00,
                tipo: 'INVESTIMENTO',
                pagamento: 'PIX'
            },
            {
                id: 'tx-desp-fut',
                user_id: mockUser.id,
                data: '2026-09-05',
                descricao: 'Parcela Carro',
                categoria: 'Transporte',
                valor: 800.00,
                tipo: 'DESPESA',
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: '1/2',
                fatura_destino: 'ATUAL'
            }
        ];

        await setupAuthenticatedApp(page, { transactions: customTxs });
        await page.click('button:has-text("🔮 Previsão Financeira")');

        const cards = page.locator('#forecastMonthGrid .forecast-month-card');
        await cards.nth(1).click();

        await expect(page.locator('#forecastConfirmadosContainer')).toBeVisible();
        await expect(page.locator('#forecastConfirmadosContainer')).toContainText('R$ 2.000,00');
        await expect(page.locator('#forecastConfirmadosContainer')).toContainText('R$ 500,00');
        await expect(page.locator('#fdetail-total')).toHaveText('R$ 800,00');
    });

    test('14. Estornos / valores negativos reduzem o total comprometido da competência', async ({ page }) => {
        const customTxs = [
            {
                id: 'tx-norm',
                user_id: mockUser.id,
                data: '2026-08-01',
                descricao: 'Compra Geral',
                categoria: 'Outros',
                valor: 300.00,
                tipo: 'DESPESA',
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: '',
                fatura_destino: 'ATUAL'
            },
            {
                id: 'tx-estorno',
                user_id: mockUser.id,
                data: '2026-08-02',
                descricao: 'Estorno Parcial',
                categoria: 'Outros',
                valor: -50.00,
                tipo: 'DESPESA',
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: '',
                fatura_destino: 'ATUAL'
            }
        ];

        await setupAuthenticatedApp(page, { transactions: customTxs });
        await page.click('button:has-text("🔮 Previsão Financeira")');

        await expect(page.locator('#fdetail-total')).toHaveText('R$ 250,00');
    });

    test('15. Base sem transações exibe empty state amigável sem NaN ou Infinity', async ({ page }) => {
        await setupAuthenticatedApp(page, { transactions: [] });
        await page.click('button:has-text("🔮 Previsão Financeira")');

        await expect(page.locator('#forecastMonthGrid')).toContainText('Nenhum compromisso financeiro futuro identificado');
        await expect(page.locator('body')).not.toContainText('NaN');
        await expect(page.locator('body')).not.toContainText('Infinity');
        await expect(page.locator('body')).not.toContainText('undefined');
    });

    test('16. Responsividade mobile 390x844 e alternância de tema claro/escuro', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page);

        await page.click('button:has-text("🔮 Previsão Financeira")');
        await expect(page.locator('#tab-previsao')).toBeVisible();
        await expect(page.locator('#forecastMonthGrid')).toBeVisible();

        await page.click('#themeToggleBtn');
        await expect(page.locator('body')).toHaveClass(/dark-theme/);

        await page.click('#themeToggleBtn');
        await expect(page.locator('body')).not.toHaveClass(/dark-theme/);
    });

    test('17. Virada de ano com horizonte 12 meses projeta corretamente competências do ano seguinte', async ({ page }) => {
        // Compra iniciada em Outubro/2026 em 6x (termina em Março/2027)
        const customTxs = [
            {
                id: 'tx-virada1',
                user_id: mockUser.id,
                data: '2026-10-15',
                descricao: 'Geladeira Inox',
                categoria: 'Casa',
                valor: 500.00,
                tipo: 'DESPESA',
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: '1/6',
                fatura_destino: 'ATUAL',
                grupo_parcela_id: 'grp-gela-1'
            }
        ];

        await setupAuthenticatedApp(page, { transactions: customTxs });
        await page.click('button:has-text("🔮 Previsão Financeira")');
        await page.click('#btnHorizon12');

        const cards = page.locator('#forecastMonthGrid .forecast-month-card');
        await expect(cards).toHaveCount(12);

        // Mês 0 (Ago/26): 0
        // Mês 1 (Set/26): 0
        // Mês 2 (Out/26): 500 (1/6)
        // Mês 3 (Nov/26): 500 (2/6)
        // Mês 4 (Dez/26): 500 (3/6)
        // Mês 5 (Jan/27): 500 (4/6) -> Virada de Ano
        // Mês 6 (Fev/27): 500 (5/6)
        // Mês 7 (Mar/27): 500 (6/6)
        // Mês 8 (Abr/27): 0 (Pós-término)
        await expect(cards.nth(0)).toContainText('R$ 0,00');
        await expect(cards.nth(2)).toContainText('R$ 500,00');
        await expect(cards.nth(4)).toContainText('R$ 500,00');
        await expect(cards.nth(5)).toContainText('R$ 500,00');
        await expect(cards.nth(7)).toContainText('R$ 500,00');
        await expect(cards.nth(8)).toContainText('R$ 0,00');
    });

    test('18. Medição real de performance para 3, 6 e 12 meses com 523 transações mockadas', async ({ page }) => {
        // Gera 523 transações mockadas representando o histórico real
        const bigDataset = [];
        for (let i = 0; i < 523; i++) {
            const isCard = (i % 3 !== 0);
            const isParc = isCard && (i % 4 === 0);
            const isRec = isCard && (i % 10 === 0);
            const m = (i % 12);
            const y = 2025 + Math.floor(i / 260);
            const dStr = `${y}-${String(m+1).padStart(2, '0')}-15`;
            bigDataset.push({
                id: `tx-bench-${i}`,
                user_id: mockUser.id,
                tipo: (i % 15 === 0) ? 'Receita' : (i % 25 === 0) ? 'Investimento' : 'Despesa',
                data: dStr,
                descricao: `Transação Histórica ${i}`,
                valor: 50 + (i % 200),
                pagamento: isCard ? 'Cartão de Crédito' : 'PIX',
                cartao: isCard ? 'Nubank' : '',
                categoria: `Categoria ${i % 8}`,
                subcategoria: `Sub ${i % 5}`,
                parcela: isRec ? 'RECORRENTE' : isParc ? '1/6' : '',
                fatura_destino: (i % 5 === 0) ? 'PROXIMA' : 'ATUAL',
                grupo_parcela_id: isParc ? `grp-bench-${i % 20}` : null
            });
        }

        await setupAuthenticatedApp(page, { transactions: bigDataset });

        const perfTimes = await page.evaluate(() => {
            const measure = (h) => {
                const iters = 50;
                const t0 = performance.now();
                for (let k = 0; k < iters; k++) {
                    getFinancialForecast('2026-7', h);
                }
                const t1 = performance.now();
                return (t1 - t0) / iters;
            };
            return {
                h3: measure(3),
                h6: measure(6),
                h12: measure(12)
            };
        });

        // Esperado: execução muito rápida (< 50ms mesmo sem cache)
        expect(perfTimes.h3).toBeLessThan(50);
        expect(perfTimes.h6).toBeLessThan(50);
        expect(perfTimes.h12).toBeLessThan(50);

        console.log(`Performance medida no navegador (523 txs): 3M=${perfTimes.h3.toFixed(2)}ms, 6M=${perfTimes.h6.toFixed(2)}ms, 12M=${perfTimes.h12.toFixed(2)}ms`);
    });
});
