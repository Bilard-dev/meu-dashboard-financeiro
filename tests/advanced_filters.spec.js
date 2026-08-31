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

});
