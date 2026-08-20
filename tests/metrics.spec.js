// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');
const { mockUser } = require('./fixtures/mockData');

test.describe('Consolidação de KPIs e Métricas 2.0', () => {

    test('1. Taxa de Aporte: calculada corretamente com valores conhecidos (Receita = 5000, Invest = 1000 -> 20.0%)', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-rec-1',
                    user_id: mockUser.id,
                    tipo: 'Receita',
                    data: '2026-08-05',
                    descricao: 'Salário',
                    valor: 5000.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Salário'
                },
                {
                    id: 'tx-inv-1',
                    user_id: mockUser.id,
                    tipo: 'Investimento',
                    data: '2026-08-06',
                    descricao: 'Aporte CDB',
                    valor: 1000.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Investimentos'
                }
            ]
        });

        await page.selectOption('#monthSelector', '2026-7');
        const detalhesContainer = page.locator('#kpi-investimentos-detalhes');
        await expect(detalhesContainer).toContainText('Taxa de Aporte');
        await expect(detalhesContainer).toContainText('20.0%');
        await expect(detalhesContainer).toContainText('1'); // Operações: 1
    });

    test('2. Taxa de Aporte sem receita: exibe 0.0% e evita divisão por zero / NaN', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-inv-sem-rec',
                    user_id: mockUser.id,
                    tipo: 'Investimento',
                    data: '2026-08-06',
                    descricao: 'Aporte Único',
                    valor: 500.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Investimentos'
                }
            ]
        });

        await page.selectOption('#monthSelector', '2026-7');
        const detalhesContainer = page.locator('#kpi-investimentos-detalhes');
        await expect(detalhesContainer).toContainText('0.0%');
        await expect(detalhesContainer).not.toContainText('NaN');
        await expect(detalhesContainer).not.toContainText('Infinity');
    });

    test('3. Taxa de Sobra / Poupança: Superávit positivo (Receita = 5000, Despesa = 2000, Invest = 1000 -> Sobra = 2000 -> 40.0%)', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-rec-poup',
                    user_id: mockUser.id,
                    tipo: 'Receita',
                    data: '2026-08-01',
                    descricao: 'Salário',
                    valor: 5000.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Salário'
                },
                {
                    id: 'tx-desp-poup',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-02',
                    descricao: 'Contas Gerais',
                    valor: 2000.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Casa'
                },
                {
                    id: 'tx-inv-poup',
                    user_id: mockUser.id,
                    tipo: 'Investimento',
                    data: '2026-08-03',
                    descricao: 'Aporte Ações',
                    valor: 1000.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Investimentos'
                }
            ]
        });

        await page.selectOption('#monthSelector', '2026-7');
        const saldoDetalhes = page.locator('#kpi-saldo-detalhes');
        await expect(saldoDetalhes).toContainText('Taxa de Sobra');
        await expect(saldoDetalhes).toContainText('40.0%');
        await expect(saldoDetalhes).toContainText('Superávit');
    });

    test('4. Taxa de Sobra com Déficit: saldo negativo exibe taxa negativa e status Déficit', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-rec-def',
                    user_id: mockUser.id,
                    tipo: 'Receita',
                    data: '2026-08-01',
                    descricao: 'Freelance',
                    valor: 2000.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Extra'
                },
                {
                    id: 'tx-desp-def',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-02',
                    descricao: 'Reforma',
                    valor: 3000.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Casa'
                }
            ]
        });

        // Saldo = 2000 - 3000 = -1000 (-50.0% da receita)
        await page.selectOption('#monthSelector', '2026-7');
        const saldoDetalhes = page.locator('#kpi-saldo-detalhes');
        await expect(saldoDetalhes).toContainText('-50.0%');
        await expect(saldoDetalhes).toContainText('Déficit');
    });

    test('5. Média Histórica de Categoria: calculada dividindo pelo número de meses ativos com despesa', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-alim-ago',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-10',
                    descricao: 'Supermercado Agosto',
                    valor: 400.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Alimentação'
                },
                {
                    id: 'tx-alim-jul',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-07-15',
                    descricao: 'Supermercado Julho',
                    valor: 200.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Alimentação'
                }
            ]
        });

        // Total Alimentação = 600, 2 meses ativos (2026-6 e 2026-7) -> Média = 300,00
        await page.selectOption('#monthSelector', '2026-7');
        await page.evaluate(() => {
            // @ts-ignore
            window.showCategoryDetails('Alimentação', '2026-7');
        });

        await expect(page.locator('#kpi-cat-atual')).toContainText('400,00');
        await expect(page.locator('#kpi-cat-media')).toContainText('300,00');
    });

    test('6. Variação Percentual Acima da Média (+33.3%): gasto atual > média histórica', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-laz-ago',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-10',
                    descricao: 'Cinema e Jantar',
                    valor: 400.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Lazer'
                },
                {
                    id: 'tx-laz-jul',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-07-15',
                    descricao: 'Jogos',
                    valor: 200.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Lazer'
                }
            ]
        });

        // Média = 300, Atual em Agosto = 400 -> Variação = ((400/300) - 1) * 100 = +33.3%
        await page.selectOption('#monthSelector', '2026-7');
        await page.evaluate(() => {
            // @ts-ignore
            window.showCategoryDetails('Lazer', '2026-7');
        });

        await expect(page.locator('#kpi-cat-var')).toContainText('+33.3%');
    });

    test('7. Variação Percentual Abaixo da Média (-33.3%): gasto atual < média histórica', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-laz-ago',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-10',
                    descricao: 'Cinema',
                    valor: 200.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Lazer'
                },
                {
                    id: 'tx-laz-jul',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-07-15',
                    descricao: 'Parque',
                    valor: 400.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Lazer'
                }
            ]
        });

        // Média = 300, Atual em Agosto = 200 -> Variação = ((200/300) - 1) * 100 = -33.3%
        await page.selectOption('#monthSelector', '2026-7');
        await page.evaluate(() => {
            // @ts-ignore
            window.showCategoryDetails('Lazer', '2026-7');
        });

        await expect(page.locator('#kpi-cat-var')).toContainText('-33.3%');
    });

    test('8. Detalhes de categoria sem histórico prévio: não gera NaN ou Infinity', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-casa-ago',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-10',
                    descricao: 'Lâmpadas',
                    valor: 100.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Casa'
                }
            ]
        });

        await page.selectOption('#monthSelector', '2026-7');
        await page.evaluate(() => {
            // @ts-ignore
            window.showCategoryDetails('Inexistente', '2026-7');
        });

        await expect(page.locator('#kpi-cat-atual')).toContainText('0,00');
        await expect(page.locator('#kpi-cat-media')).toContainText('0,00');
        await expect(page.locator('#kpi-cat-var')).not.toContainText('NaN');
        await expect(page.locator('#kpi-cat-var')).not.toContainText('Infinity');
    });

    test('9. Restante Futuro de Parcelamento no Início (1/3): projeta exatamente 2 parcelas restantes', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-parc-future-1',
                    grupo_parcela_id: 'grp-fut-1',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-10',
                    descricao: 'Mesa de Escritório',
                    valor: 100.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Casa',
                    fatura_destino: '2026-9', // Outubro/2026
                    parcela: '1/3'
                }
            ]
        });

        await page.getByRole('button', { name: /Parcelas/ }).click();
        await page.selectOption('#faturaMonthSelector', '2026-9'); // Outubro/2026

        // Fatura Atual: 100,00 (Parcela 1/3)
        await expect(page.locator('#kpi-fatura-atual')).toContainText('100,00');
        // Restante Futuro: 2 * 100 = 200,00
        await expect(page.locator('#kpi-parcela-total-restante')).toContainText('200,00');
    });

    test('10. Restante Futuro de Parcelamento no Meio (2/3): projeta exatamente 1 parcela restante', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-parc-future-2',
                    grupo_parcela_id: 'grp-fut-2',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-10',
                    descricao: 'Cadeira Gamer',
                    valor: 150.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Casa',
                    fatura_destino: '2026-9', // Outubro/2026
                    parcela: '1/3'
                }
            ]
        });

        await page.getByRole('button', { name: /Parcelas/ }).click();
        await page.selectOption('#faturaMonthSelector', '2026-10'); // Novembro/2026 (Parcela 2/3)

        // Fatura Atual: 150,00
        await expect(page.locator('#kpi-fatura-atual')).toContainText('150,00');
        // Restante Futuro: 1 * 150 = 150,00
        await expect(page.locator('#kpi-parcela-total-restante')).toContainText('150,00');
    });

    test('11. Restante Futuro de Parcelamento no Fim (3/3): resta 0,00 após a última parcela', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-parc-future-3',
                    grupo_parcela_id: 'grp-fut-3',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-10',
                    descricao: 'Headset',
                    valor: 80.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Eletrônicos',
                    fatura_destino: '2026-9', // Outubro/2026
                    parcela: '1/3'
                }
            ]
        });

        await page.getByRole('button', { name: /Parcelas/ }).click();
        await page.selectOption('#faturaMonthSelector', '2026-11'); // Dezembro/2026 (Parcela 3/3)

        // Fatura Atual: 80,00
        await expect(page.locator('#kpi-fatura-atual')).toContainText('80,00');
        // Restante Futuro: 0 * 80 = 0,00
        await expect(page.locator('#kpi-parcela-total-restante')).toContainText('0,00');
    });

    test('12. Dois parcelamentos simultâneos somam seus restantes futuros corretamente', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-parc-sim-1',
                    grupo_parcela_id: 'grp-sim-1',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-10',
                    descricao: 'Compra A',
                    valor: 100.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Outros',
                    fatura_destino: '2026-9', // Outubro/2026 (1/2 -> resta 1x 100 = 100)
                    parcela: '1/2'
                },
                {
                    id: 'tx-parc-sim-2',
                    grupo_parcela_id: 'grp-sim-2',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-10',
                    descricao: 'Compra B',
                    valor: 50.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Inter',
                    categoria: 'Outros',
                    fatura_destino: '2026-9', // Outubro/2026 (1/3 -> resta 2x 50 = 100)
                    parcela: '1/3'
                }
            ]
        });

        await page.getByRole('button', { name: /Parcelas/ }).click();
        await page.selectOption('#faturaMonthSelector', '2026-9'); // Outubro/2026

        // Fatura Atual: 100 + 50 = 150,00
        await expect(page.locator('#kpi-fatura-atual')).toContainText('150,00');
        // Restante Futuro: 100 (da Compra A) + 100 (da Compra B) = 200,00
        await expect(page.locator('#kpi-parcela-total-restante')).toContainText('200,00');
    });

    test('13. Compra Recorrente NÃO infla o restante futuro como dívida parcelada finita', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-rec-streaming',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-01',
                    descricao: 'Spotify Family',
                    valor: 34.90,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Assinaturas',
                    fatura_destino: '2026-9', // Outubro/2026
                    parcela: 'RECORRENTE'
                }
            ]
        });

        await page.getByRole('button', { name: /Parcelas/ }).click();
        await page.selectOption('#faturaMonthSelector', '2026-9');

        // Fatura Atual: 34,90
        await expect(page.locator('#kpi-fatura-atual')).toContainText('34,90');
        // Restante Futuro: 0,00 (recorrente é contínuo e não dívida finita)
        await expect(page.locator('#kpi-parcela-total-restante')).toContainText('0,00');
    });

    test('14. Aba Investimentos: KPI exibe título sem termo "Patrimônio" e soma total de aportes', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-inv-kpi-1',
                    user_id: mockUser.id,
                    tipo: 'Investimento',
                    data: '2026-08-01',
                    descricao: 'Tesouro Selic',
                    valor: 1200.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Renda Fixa'
                },
                {
                    id: 'tx-inv-kpi-2',
                    user_id: mockUser.id,
                    tipo: 'Investimento',
                    data: '2026-08-02',
                    descricao: 'Fundo Imobiliário',
                    valor: 800.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'FIIs'
                }
            ]
        });

        await page.getByRole('button', { name: 'Investimentos' }).click();
        await expect(page.locator('#tab-investimentos')).toHaveClass(/active/);

        // Total Aportado: 2.000,00
        const totalAportado = page.locator('#kpi-patrimonio-total');
        await expect(totalAportado).toContainText('2.000,00');

        // Maior aporte: 1.200,00
        const maiorAporte = page.locator('#kpi-maior-aporte');
        await expect(maiorAporte).toContainText('1.200,00');

        // Média por aporte: 1.000,00
        const mediaAporte = page.locator('#kpi-media-aporte');
        await expect(mediaAporte).toContainText('1.000,00');

        // Quantidade de operações: 2
        const qtdAportes = page.locator('#kpi-qtd-aportes');
        await expect(qtdAportes).toHaveText('2');
    });

});
