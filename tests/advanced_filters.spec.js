// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');

test.describe('Filtros Avançados - Parcelas/Cartões e Análise de Gastos', () => {

    test('1. Aba Parcelas: Filtra por Cartão específico', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-card-1',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-01',
                    descricao: 'Monitor Dell 4K',
                    valor: 500.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank Ultravioleta',
                    parcela: '1/3',
                    categoria: 'Eletrônicos'
                },
                {
                    id: 'tx-card-2',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-05',
                    descricao: 'Passagem Aérea',
                    valor: 800.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'XP Visa Infinite',
                    parcela: '1/5',
                    categoria: 'Viagem'
                }
            ]
        });

        await page.getByRole('button', { name: /Parcelas/i }).click();
        await expect(page.locator('#tab-parcelas')).toHaveClass(/active/);

        // Ambas aparecem inicialmente
        await expect(page.locator('#parcelasTableBody')).toContainText('Monitor Dell 4K');
        await expect(page.locator('#parcelasTableBody')).toContainText('Passagem Aérea');

        // Filtra por 'Nubank Ultravioleta'
        await page.locator('#parcelasCartaoFilter').selectOption('Nubank Ultravioleta');
        await expect(page.locator('#parcelasTableBody')).toContainText('Monitor Dell 4K');
        await expect(page.locator('#parcelasTableBody')).not.toContainText('Passagem Aérea');

        // Filtra por 'XP Visa Infinite'
        await page.locator('#parcelasCartaoFilter').selectOption('XP Visa Infinite');
        await expect(page.locator('#parcelasTableBody')).toContainText('Passagem Aérea');
        await expect(page.locator('#parcelasTableBody')).not.toContainText('Monitor Dell 4K');
    });

    test('2. Aba Parcelas: Filtra por Tipo de Compra (Parceladas vs Recorrentes vs À vista)', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-parc',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-01',
                    descricao: 'Smartphone Galaxy',
                    valor: 400.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    parcela: '2/10',
                    categoria: 'Tecnologia'
                },
                {
                    id: 'tx-rec',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-02',
                    descricao: 'Netflix Premium',
                    valor: 55.90,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    parcela: 'RECORRENTE',
                    categoria: 'Lazer'
                },
                {
                    id: 'tx-av',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-03',
                    descricao: 'Jantar Restaurante',
                    valor: 150.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    parcela: '',
                    categoria: 'Alimentação'
                }
            ]
        });

        await page.getByRole('button', { name: /Parcelas/i }).click();
        await page.locator('#faturaMonthSelector').selectOption('2026-7');

        // Filtra apenas parceladas
        await page.locator('#parcelasTypeFilter').selectOption('parcelado');
        await expect(page.locator('#parcelasTableBody')).toContainText('Smartphone Galaxy');
        await expect(page.locator('#parcelasTableBody')).not.toContainText('Netflix Premium');
        await expect(page.locator('#parcelasTableBody')).not.toContainText('Jantar Restaurante');

        // Filtra apenas recorrentes
        await page.locator('#parcelasTypeFilter').selectOption('recorrente');
        await expect(page.locator('#parcelasTableBody')).toContainText('Netflix Premium');
        await expect(page.locator('#parcelasTableBody')).not.toContainText('Smartphone Galaxy');

        // Filtra apenas à vista
        await page.locator('#parcelasTypeFilter').selectOption('avista');
        await expect(page.locator('#parcelasTableBody')).toContainText('Jantar Restaurante');
        await expect(page.locator('#parcelasTableBody')).not.toContainText('Smartphone Galaxy');
    });

    test('3. Aba Parcelas: Busca textual e botão limpar filtros', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-1',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-01',
                    descricao: 'Cadeira Gamer Ergonômica',
                    valor: 350.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    parcela: '1/4',
                    categoria: 'Conforto'
                },
                {
                    id: 'tx-2',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-02',
                    descricao: 'Teclado Mecânico RGB',
                    valor: 200.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    parcela: '1/2',
                    categoria: 'Periféricos'
                }
            ]
        });

        await page.getByRole('button', { name: /Parcelas/i }).click();

        // Busca por 'Teclado'
        await page.locator('#parcelasSearchInput').fill('Teclado');
        await expect(page.locator('#parcelasTableBody')).toContainText('Teclado Mecânico RGB');
        await expect(page.locator('#parcelasTableBody')).not.toContainText('Cadeira Gamer');

        // Limpa filtros
        await page.locator('#tab-parcelas button:has-text("Limpar")').click();
        await expect(page.locator('#parcelasSearchInput')).toHaveValue('');
        await expect(page.locator('#parcelasTableBody')).toContainText('Cadeira Gamer Ergonômica');
        await expect(page.locator('#parcelasTableBody')).toContainText('Teclado Mecânico RGB');
    });

    test('4. Aba Análise de Gastos: Filtra por Tipo de Transação (Receitas, Investimentos, Saques, Despesas)', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-d',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-10',
                    descricao: 'Supermercado Mensal',
                    valor: 650.00,
                    pagamento: 'PIX',
                    categoria: 'Alimentação'
                },
                {
                    id: 'tx-r',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Receita',
                    data: '2026-08-05',
                    descricao: 'Salário Empresa',
                    valor: 8500.00,
                    pagamento: 'PIX',
                    categoria: 'Salário'
                },
                {
                    id: 'tx-i',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Investimento',
                    data: '2026-08-15',
                    descricao: 'Aporte Tesouro IPCA',
                    valor: 2000.00,
                    pagamento: 'PIX',
                    categoria: 'Renda Fixa'
                },
                {
                    id: 'tx-s',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Saque',
                    data: '2026-08-20',
                    descricao: 'Saque Caixa 24h',
                    valor: 300.00,
                    pagamento: 'Dinheiro',
                    categoria: 'Saque / Caixa'
                }
            ]
        });

        await page.getByRole('button', { name: /Análise de Gastos/i }).click();
        await expect(page.locator('#tab-analise')).toHaveClass(/active/);

        // Por padrão mostra Despesas (Supermercado)
        await expect(page.locator('#analiseTableBody')).toContainText('Supermercado Mensal');
        await expect(page.locator('#analiseTableBody')).not.toContainText('Salário Empresa');
        await expect(page.locator('#an-kpi-total')).toContainText('650,00');

        // Filtra por 'Receitas'
        await page.locator('#an_tipo').selectOption('RECEITA');
        await expect(page.locator('#analiseTableBody')).toContainText('Salário Empresa');
        await expect(page.locator('#analiseTableBody')).not.toContainText('Supermercado Mensal');
        await expect(page.locator('#an-kpi-total')).toContainText('8.500,00');

        // Filtra por 'Investimentos'
        await page.locator('#an_tipo').selectOption('INVESTIMENTO');
        await expect(page.locator('#analiseTableBody')).toContainText('Aporte Tesouro IPCA');
        await expect(page.locator('#an-kpi-total')).toContainText('2.000,00');

        // Filtra por 'Saques'
        await page.locator('#an_tipo').selectOption('SAQUE');
        await expect(page.locator('#analiseTableBody')).toContainText('Saque Caixa 24h');
        await expect(page.locator('#an-kpi-total')).toContainText('300,00');

        // Filtra por 'Todos os Tipos'
        await page.locator('#an_tipo').selectOption('all');
        await expect(page.locator('#analiseTableBody')).toContainText('Supermercado Mensal');
        await expect(page.locator('#analiseTableBody')).toContainText('Salário Empresa');
        await expect(page.locator('#analiseTableBody')).toContainText('Aporte Tesouro IPCA');
        await expect(page.locator('#analiseTableBody')).toContainText('Saque Caixa 24h');
        await expect(page.locator('#an-kpi-qtd')).toHaveText('4');
    });

    test('5. Aba Análise de Gastos: Filtro por faixa de valores (Min/Max), busca rápida e reset', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-1',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-01',
                    descricao: 'Café Expresso Especial',
                    valor: 15.00,
                    pagamento: 'PIX',
                    categoria: 'Alimentação'
                },
                {
                    id: 'tx-2',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-02',
                    descricao: 'Aluguel Apartamento',
                    valor: 2500.00,
                    pagamento: 'PIX',
                    categoria: 'Moradia'
                },
                {
                    id: 'tx-3',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-03',
                    descricao: 'Conta de Energia Elétrica',
                    valor: 220.00,
                    pagamento: 'PIX',
                    categoria: 'Moradia'
                }
            ]
        });

        await page.getByRole('button', { name: /Análise de Gastos/i }).click();

        // Filtra valores entre R$ 50 e R$ 500
        await page.locator('#an_valor_min').fill('50');
        await page.locator('#an_valor_max').fill('500');

        await expect(page.locator('#analiseTableBody')).toContainText('Conta de Energia Elétrica');
        await expect(page.locator('#analiseTableBody')).not.toContainText('Café Expresso Especial');
        await expect(page.locator('#analiseTableBody')).not.toContainText('Aluguel Apartamento');
        await expect(page.locator('#an-kpi-total')).toContainText('220,00');

        // Busca rápida por 'Energia'
        await page.locator('#an_search').fill('Energia');
        await expect(page.locator('#analiseTableBody')).toContainText('Conta de Energia Elétrica');

        // Limpar Filtros
        await page.locator('#tab-analise button:has-text("Limpar Filtros")').click();
        await expect(page.locator('#an_valor_min')).toHaveValue('');
        await expect(page.locator('#an_valor_max')).toHaveValue('');
        await expect(page.locator('#an_search')).toHaveValue('');
        await expect(page.locator('#analiseTableBody')).toContainText('Café Expresso Especial');
        await expect(page.locator('#analiseTableBody')).toContainText('Aluguel Apartamento');
        await expect(page.locator('#analiseTableBody')).toContainText('Conta de Energia Elétrica');
        await expect(page.locator('#an-kpi-qtd')).toHaveText('3');
    });

    test('6. Aba Análise de Gastos: Intervalo de datas personalizado (Data Inicial e Final)', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-jul',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-07-15',
                    descricao: 'Compra Antiga Julho',
                    valor: 150.00,
                    pagamento: 'PIX',
                    categoria: 'Lazer'
                },
                {
                    id: 'tx-ago-1',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-05',
                    descricao: 'Compra Início Agosto',
                    valor: 300.00,
                    pagamento: 'PIX',
                    categoria: 'Alimentação'
                },
                {
                    id: 'tx-ago-2',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-25',
                    descricao: 'Compra Fim Agosto',
                    valor: 450.00,
                    pagamento: 'PIX',
                    categoria: 'Transporte'
                }
            ]
        });

        await page.getByRole('button', { name: /Análise de Gastos/i }).click();

        // Seleciona Intervalo Personalizado
        await page.locator('#an_mes').selectOption('custom');
        await expect(page.locator('#an_custom_date_container')).toBeVisible();

        // Define intervalo: 2026-08-01 a 2026-08-10
        await page.locator('#an_data_inicio').fill('2026-08-01');
        await page.locator('#an_data_fim').fill('2026-08-10');
        await page.locator('#an_data_fim').dispatchEvent('change');

        // Apenas 'Compra Início Agosto' deve aparecer
        await expect(page.locator('#analiseTableBody')).toContainText('Compra Início Agosto');
        await expect(page.locator('#analiseTableBody')).not.toContainText('Compra Antiga Julho');
        await expect(page.locator('#analiseTableBody')).not.toContainText('Compra Fim Agosto');
        await expect(page.locator('#an-kpi-total')).toContainText('300,00');
    });

    test('7. Aba Análise de Gastos: Painel de Médias Financeiras (Receitas, PIX, Cartão e Dinheiro)', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-rec-1',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Receita',
                    data: '2026-08-01',
                    descricao: 'Salário Mensal',
                    valor: 6000.00,
                    pagamento: 'PIX',
                    categoria: 'Salário'
                },
                {
                    id: 'tx-rec-2',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Receita',
                    data: '2026-08-15',
                    descricao: 'Freelance Design',
                    valor: 2000.00,
                    pagamento: 'PIX',
                    categoria: 'Extra'
                },
                {
                    id: 'tx-pix-1',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-05',
                    descricao: 'Aluguel Apartamento',
                    valor: 2000.00,
                    pagamento: 'PIX',
                    categoria: 'Moradia'
                },
                {
                    id: 'tx-pix-2',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-10',
                    descricao: 'Feira Orgânica',
                    valor: 200.00,
                    pagamento: 'PIX',
                    categoria: 'Alimentação'
                },
                {
                    id: 'tx-card-1',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-08',
                    descricao: 'Supermercado Mensal',
                    valor: 800.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Alimentação'
                },
                {
                    id: 'tx-card-2',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-12',
                    descricao: 'Restaurante Jantar',
                    valor: 300.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Alimentação'
                },
                {
                    id: 'tx-din-1',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-18',
                    descricao: 'Padaria Café da Manhã',
                    valor: 50.00,
                    pagamento: 'Dinheiro',
                    categoria: 'Alimentação'
                }
            ]
        });

        await page.getByRole('button', { name: /Análise de Gastos/i }).click();

        // 1 mês ativo: Médias Mensais (modo padrão)
        // Receitas totais: 6000 + 2000 = 8000
        // PIX total: 2000 + 200 = 2200
        // Cartão total: 800 + 300 = 1100
        // Dinheiro total: 50
        await expect(page.locator('#an-kpi-media-receita')).toContainText('8.000,00');
        await expect(page.locator('#an-kpi-media-pix')).toContainText('2.200,00');
        await expect(page.locator('#an-kpi-media-cartao')).toContainText('1.100,00');
        await expect(page.locator('#an-kpi-media-dinheiro')).toContainText('50,00');

        // Alterna para Médias por Operação (Lançamento)
        // Receitas: 8000 / 2 = 4000
        // PIX: 2200 / 2 = 1100
        // Cartão: 1100 / 2 = 550
        // Dinheiro: 50 / 1 = 50
        await page.locator('#an_modo_media').selectOption('operacao');
        await expect(page.locator('#an-kpi-media-receita')).toContainText('4.000,00');
        await expect(page.locator('#an-kpi-media-pix')).toContainText('1.100,00');
        await expect(page.locator('#an-kpi-media-cartao')).toContainText('550,00');
        await expect(page.locator('#an-kpi-media-dinheiro')).toContainText('50,00');
    });

    test('8. Aba Análise de Gastos: Médias por categoria e filtro interativo ao clicar no card', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-moradia',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-01',
                    descricao: 'Aluguel Casa',
                    valor: 2400.00,
                    pagamento: 'PIX',
                    categoria: 'Moradia'
                },
                {
                    id: 'tx-alim-1',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-05',
                    descricao: 'Compras Supermercado',
                    valor: 600.00,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    categoria: 'Alimentação'
                },
                {
                    id: 'tx-alim-2',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Despesa',
                    data: '2026-08-15',
                    descricao: 'Almoço Restaurante',
                    valor: 200.00,
                    pagamento: 'PIX',
                    categoria: 'Alimentação'
                }
            ]
        });

        await page.getByRole('button', { name: /Análise de Gastos/i }).click();

        // Cards de categoria aparecem com seus valores
        const catCards = page.locator('#an-category-averages-cards');
        await expect(catCards).toContainText('Moradia');
        await expect(catCards).toContainText('2.400,00');
        await expect(catCards).toContainText('Alimentação');
        await expect(catCards).toContainText('800,00');

        // Clica no card de 'Moradia' para filtrar apenas Moradia
        await catCards.locator('.kpi-card:has-text("Moradia")').click();
        await expect(page.locator('#an_categoria')).toHaveValue('Moradia');
        await expect(page.locator('#analiseTableBody')).toContainText('Aluguel Casa');
        await expect(page.locator('#analiseTableBody')).not.toContainText('Supermercado');
        await expect(page.locator('#an-kpi-total')).toContainText('2.400,00');
    });

});
