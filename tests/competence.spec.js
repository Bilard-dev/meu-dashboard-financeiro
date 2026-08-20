// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');
const { mockUser } = require('./fixtures/mockData');

test.describe('Competência de Faturas 2.0 - Fluxo de Caixa Real', () => {

    test('1. Compra cartão Agosto + Fatura Setembro (PROXIMA): Agosto = 0, Setembro = valor', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-card-1',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-28',
                    descricao: 'Notebook Novo',
                    valor: 300.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Eletrônicos',
                    fatura_destino: 'PROXIMA',
                    parcela: 'À vista'
                }
            ]
        });

        // 1. Em Agosto/2026 (mês da compra) -> Despesas = 0,00
        await page.selectOption('#monthSelector', '2026-7');
        await expect(page.locator('#kpi-despesas')).toContainText('0,00');

        // 2. Em Setembro/2026 (mês da fatura) -> Despesas = 300,00
        await page.selectOption('#monthSelector', '2026-8');
        await expect(page.locator('#kpi-despesas')).toContainText('300,00');
    });

    test('2. Cartão ATUAL: entra nas despesas do mês da compra', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-card-atual',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-10',
                    descricao: 'Supermercado',
                    valor: 150.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Alimentação',
                    fatura_destino: 'ATUAL',
                    parcela: 'À vista'
                }
            ]
        });

        await page.selectOption('#monthSelector', '2026-7');
        await expect(page.locator('#kpi-despesas')).toContainText('150,00');
    });

    test('3. Dezembro + PROXIMA: entra em Janeiro do ano seguinte', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-card-dez',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-12-15',
                    descricao: 'Presentes Natal',
                    valor: 450.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Presentes',
                    fatura_destino: 'PROXIMA',
                    parcela: 'À vista'
                }
            ]
        });

        // Dezembro/2026 (2026-11) -> 0,00
        await page.selectOption('#monthSelector', '2026-11');
        await expect(page.locator('#kpi-despesas')).toContainText('0,00');

        // Janeiro/2027 (2027-0) -> 450,00
        await page.selectOption('#monthSelector', '2027-0');
        await expect(page.locator('#kpi-despesas')).toContainText('450,00');
    });

    test('4. Fatura específica YYYY-M: entra exatamente no mês selecionado', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-card-custom',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-10',
                    descricao: 'Curso Online',
                    valor: 200.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Educação',
                    fatura_destino: '2026-10',
                    parcela: 'À vista'
                }
            ]
        });

        // Agosto/2026 -> 0,00
        await page.selectOption('#monthSelector', '2026-7');
        await expect(page.locator('#kpi-despesas')).toContainText('0,00');

        // Novembro/2026 -> 200,00
        await page.selectOption('#monthSelector', '2026-10');
        await expect(page.locator('#kpi-despesas')).toContainText('200,00');
    });

    test('5. Parcelamento 3x: R$ 100 em cada uma das três faturas (Out, Nov, Dez)', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-parc-1',
                    grupo_parcela_id: 'grp-uuid-12345',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-15',
                    descricao: 'Smartphone',
                    valor: 100.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Eletrônicos',
                    fatura_destino: '2026-9',
                    parcela: '1/3'
                }
            ]
        });

        // Agosto/2026 -> 0,00
        await page.selectOption('#monthSelector', '2026-7');
        await expect(page.locator('#kpi-despesas')).toContainText('0,00');

        // Setembro/2026 -> 0,00
        await page.selectOption('#monthSelector', '2026-8');
        await expect(page.locator('#kpi-despesas')).toContainText('0,00');

        // Outubro/2026 -> 100,00
        await page.selectOption('#monthSelector', '2026-9');
        await expect(page.locator('#kpi-despesas')).toContainText('100,00');

        // Novembro/2026 -> 100,00
        await page.selectOption('#monthSelector', '2026-10');
        await expect(page.locator('#kpi-despesas')).toContainText('100,00');

        // Dezembro/2026 -> 100,00
        await page.selectOption('#monthSelector', '2026-11');
        await expect(page.locator('#kpi-despesas')).toContainText('100,00');

        // Janeiro/2027 -> 0,00
        await page.selectOption('#monthSelector', '2027-0');
        await expect(page.locator('#kpi-despesas')).toContainText('0,00');
    });

    test('6. Parcelamento NÃO soma R$ 300 no primeiro mês', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-parc-single',
                    grupo_parcela_id: 'grp-uuid-single',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-15',
                    descricao: 'TV Sala',
                    valor: 100.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Casa',
                    fatura_destino: 'ATUAL',
                    parcela: '1/3'
                }
            ]
        });

        await page.selectOption('#monthSelector', '2026-7');
        await expect(page.locator('#kpi-despesas')).toContainText('100,00');
        await expect(page.locator('#kpi-despesas')).not.toContainText('300,00');
    });

    test('7. Dois parcelamentos diferentes coexistem e somam corretamente', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-p1',
                    grupo_parcela_id: 'grp-uuid-a',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-10',
                    descricao: 'Monitor',
                    valor: 80.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Eletrônicos',
                    fatura_destino: 'ATUAL',
                    parcela: '1/2'
                },
                {
                    id: 'tx-p2',
                    grupo_parcela_id: 'grp-uuid-b',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-12',
                    descricao: 'Teclado',
                    valor: 40.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Inter',
                    categoria: 'Eletrônicos',
                    fatura_destino: 'ATUAL',
                    parcela: '1/2'
                }
            ]
        });

        // Agosto/2026 -> 80 + 40 = 120,00
        await page.selectOption('#monthSelector', '2026-7');
        await expect(page.locator('#kpi-despesas')).toContainText('120,00');

        // Setembro/2026 -> 80 + 40 = 120,00
        await page.selectOption('#monthSelector', '2026-8');
        await expect(page.locator('#kpi-despesas')).toContainText('120,00');

        // Outubro/2026 -> 0,00
        await page.selectOption('#monthSelector', '2026-9');
        await expect(page.locator('#kpi-despesas')).toContainText('0,00');
    });

    test('8. Recorrente começa somente na primeira fatura e projeta nos meses seguintes', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-rec-1',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-01',
                    descricao: 'Netflix Premium',
                    valor: 55.90,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Assinaturas',
                    fatura_destino: '2026-9',
                    parcela: 'RECORRENTE'
                }
            ]
        });

        // Setembro/2026 -> 0,00
        await page.selectOption('#monthSelector', '2026-8');
        await expect(page.locator('#kpi-despesas')).toContainText('0,00');

        // Outubro/2026 -> 55,90
        await page.selectOption('#monthSelector', '2026-9');
        await expect(page.locator('#kpi-despesas')).toContainText('55,90');

        // Novembro/2026 -> 55,90
        await page.selectOption('#monthSelector', '2026-10');
        await expect(page.locator('#kpi-despesas')).toContainText('55,90');
    });

    test('9. Meta de categoria usa competência da fatura', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            metas: [
                {
                    id: 'meta-alim',
                    user_id: mockUser.id,
                    categoria: 'Alimentação',
                    valor_limite: 500.00
                }
            ],
            transactions: [
                {
                    id: 'tx-card-alim',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-29',
                    descricao: 'Jantar Restaurante',
                    valor: 450.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Alimentação',
                    fatura_destino: 'PROXIMA',
                    parcela: 'À vista'
                }
            ]
        });

        // Agosto/2026 -> Sem alerta de meta
        await page.selectOption('#monthSelector', '2026-7');
        const alertBoxAgo = page.locator('#alertsContainer .alert-mini-box');
        await expect(alertBoxAgo).toHaveCount(0);

        // Setembro/2026 -> Alerta disparado
        await page.selectOption('#monthSelector', '2026-8');
        const alertBoxSet = page.locator('#alertsContainer .alert-mini-box');
        await expect(alertBoxSet).toHaveCount(1);
        await expect(alertBoxSet).toContainText('Alimentação');
        await expect(alertBoxSet).toContainText('90%');
    });

    test('10. Meta de cartão usa competência da fatura', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            metas: [
                {
                    id: 'meta-card',
                    user_id: mockUser.id,
                    categoria: 'Nubank',
                    valor_limite: 1000.00
                }
            ],
            transactions: [
                {
                    id: 'tx-card-nubank',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-30',
                    descricao: 'Passagem Aérea',
                    valor: 900.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Viagem',
                    fatura_destino: 'PROXIMA',
                    parcela: 'À vista'
                }
            ]
        });

        // Setembro/2026 -> Alerta do cartão Nubank
        await page.selectOption('#monthSelector', '2026-8');
        const alertBox = page.locator('#alertsContainer .alert-mini-box');
        await expect(alertBox).toHaveCount(1);
        await expect(alertBox).toContainText('Nubank');
        await expect(alertBox).toContainText('90%');
    });

    test('11. Gráfico e detalhamento de categoria usam competência da fatura', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-card-lazer',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-25',
                    descricao: 'Ingresso Show',
                    valor: 250.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Lazer',
                    fatura_destino: 'PROXIMA',
                    parcela: 'À vista'
                }
            ]
        });

        // Setembro/2026 -> Detalhe de categoria
        await page.selectOption('#monthSelector', '2026-8');
        await page.evaluate(() => {
            // @ts-ignore
            window.showCategoryDetails('Lazer', '2026-8');
        });

        await expect(page.locator('#categoryDetailsSection')).toBeVisible();
        await expect(page.locator('#kpi-cat-atual')).toContainText('250,00');
    });

    test('12. Saldo Mensal (Sobra de Caixa) reflete despesas por competência de fatura', async ({ page }) => {
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
                    id: 'tx-desp-pix',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-06',
                    descricao: 'Aluguel',
                    valor: 1500.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Moradia'
                },
                {
                    id: 'tx-desp-card-prox',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-20',
                    descricao: 'Geladeira',
                    valor: 2000.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Casa',
                    fatura_destino: 'PROXIMA',
                    parcela: 'À vista'
                },
                {
                    id: 'tx-invest-1',
                    user_id: mockUser.id,
                    tipo: 'Investimento',
                    data: '2026-08-07',
                    descricao: 'Aporte Tesouro',
                    valor: 1000.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Investimentos'
                }
            ]
        });

        // Em Agosto/2026: Receitas: 5.000, Despesas: 1.500, Invest: 1.000 -> Sobra: 2.500,00
        await page.selectOption('#monthSelector', '2026-7');
        await expect(page.locator('#kpi-receitas')).toContainText('5.000,00');
        await expect(page.locator('#kpi-despesas')).toContainText('1.500,00');
        await expect(page.locator('#kpi-investimentos')).toContainText('1.000,00');
        await expect(page.locator('#kpi-saldo')).toContainText('2.500,00');
    });

    test('13. Extrato preserva a data real da compra com badge de fatura', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-extrato-card',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-28',
                    descricao: 'Compras Shopping',
                    valor: 350.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Vestuário',
                    fatura_destino: 'PROXIMA',
                    parcela: 'À vista'
                }
            ]
        });

        const firstRow = page.locator('#resumoExtratoTableBody tr').first();
        await expect(firstRow).toContainText('28/08/2026');
        await expect(firstRow).toContainText('Compras Shopping');
        await expect(firstRow).toContainText('Fatura Setembro/2026');
    });

    test('14. PIX, Dinheiro e Débito continuam no mês da data da compra', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-pix',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-01',
                    descricao: 'Transferência PIX',
                    valor: 50.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Serviços'
                },
                {
                    id: 'tx-dinheiro',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-02',
                    descricao: 'Padaria Espécie',
                    valor: 30.00,
                    pagamento: 'Dinheiro',
                    cartao: null,
                    categoria: 'Alimentação'
                },
                {
                    id: 'tx-debito',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-03',
                    descricao: 'Farmácia Débito',
                    valor: 70.00,
                    pagamento: 'Débito',
                    cartao: null,
                    categoria: 'Saúde'
                }
            ]
        });

        // Agosto/2026 -> 50 + 30 + 70 = 150,00
        await page.selectOption('#monthSelector', '2026-7');
        await expect(page.locator('#kpi-despesas')).toContainText('150,00');

        // Setembro/2026 -> 0,00
        await page.selectOption('#monthSelector', '2026-8');
        await expect(page.locator('#kpi-despesas')).toContainText('0,00');
    });

    test('15. Registros legados com ATUAL, PROXIMA e YYYY-M funcionam sem migration', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'leg-1',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-01',
                    descricao: 'Legado Atual',
                    valor: 100.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Outros',
                    fatura_destino: 'ATUAL',
                    parcela: 'À vista'
                },
                {
                    id: 'leg-2',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-02',
                    descricao: 'Legado Proxima',
                    valor: 200.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Outros',
                    fatura_destino: 'PROXIMA',
                    parcela: 'À vista'
                },
                {
                    id: 'leg-3',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-03',
                    descricao: 'Legado YYYY-M',
                    valor: 300.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Outros',
                    fatura_destino: '2026-9',
                    parcela: 'À vista'
                }
            ]
        });

        // Agosto/2026 -> leg-1 (100,00)
        await page.selectOption('#monthSelector', '2026-7');
        await expect(page.locator('#kpi-despesas')).toContainText('100,00');

        // Setembro/2026 -> leg-2 (200,00)
        await page.selectOption('#monthSelector', '2026-8');
        await expect(page.locator('#kpi-despesas')).toContainText('200,00');

        // Outubro/2026 -> leg-3 (300,00)
        await page.selectOption('#monthSelector', '2026-9');
        await expect(page.locator('#kpi-despesas')).toContainText('300,00');
    });

    test('16. UX: Alteração dos rótulos do formulário ao alternar forma de pagamento e parcela', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.click('button[onclick="switchTab(\'novo\')"]');

        // Padrão PIX
        await expect(page.locator('#i_valor_label')).toHaveText('4. Valor (R$) *');

        // Seleciona Cartão de Crédito
        await page.selectOption('#i_pagamento', 'Cartão de Crédito');
        await expect(page.locator('#i_valor_label')).toHaveText('4. Valor da Compra (R$) *');
        await expect(page.locator('#i_fatura_destino_label')).toHaveText('Fatura de Pagamento *');

        // Seleciona Parcela Customizada
        await page.selectOption('#i_parcela_select', 'CUSTOM');
        await expect(page.locator('#i_valor_label')).toHaveText('4. Valor da Parcela (R$) *');
        await expect(page.locator('#i_fatura_destino_label')).toHaveText('Primeira Parcela na Fatura *');

        // Seleciona Recorrente
        await page.selectOption('#i_parcela_select', 'RECORRENTE');
        await expect(page.locator('#i_valor_label')).toHaveText('4. Valor Mensal (R$) *');
        await expect(page.locator('#i_fatura_destino_label')).toHaveText('Primeira Fatura de Cobrança *');
    });

});
