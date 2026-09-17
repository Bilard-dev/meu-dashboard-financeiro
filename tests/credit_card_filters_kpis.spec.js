// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');

test.describe('HOTFIX 5-D - Filtros da Aba Cartão e Parcelas atualizam Cards e Resumos', () => {

    const testTransactions = [
        {
            id: 'tx-ml-parc',
            user_id: 'test-user-uuid-1234',
            tipo: 'Despesa',
            data: '2026-09-01',
            descricao: 'Notebook Dell',
            valor: 500.00,
            pagamento: 'Cartão de Crédito',
            cartao: 'ML CRÉDITO',
            parcela: '1/5',
            categoria: 'Eletrônicos'
        },
        {
            id: 'tx-ml-rec',
            user_id: 'test-user-uuid-1234',
            tipo: 'Despesa',
            data: '2026-09-05',
            descricao: 'Spotify Premium',
            valor: 30.00,
            pagamento: 'Cartão de Crédito',
            cartao: 'ML CRÉDITO',
            parcela: 'RECORRENTE',
            categoria: 'Lazer'
        },
        {
            id: 'tx-nu-av',
            user_id: 'test-user-uuid-1234',
            tipo: 'Despesa',
            data: '2026-09-10',
            descricao: 'Almoço Restaurante',
            valor: 70.00,
            pagamento: 'Cartão de Crédito',
            cartao: 'Nubank',
            parcela: '',
            categoria: 'Alimentação'
        },
        {
            id: 'tx-nu-parc',
            user_id: 'test-user-uuid-1234',
            tipo: 'Despesa',
            data: '2026-09-12',
            descricao: 'Celular Samsung',
            valor: 200.00,
            pagamento: 'Cartão de Crédito',
            cartao: 'Nubank',
            parcela: '1/3',
            categoria: 'Eletrônicos'
        }
    ];

    const testSchedules = [
        {
            id: 'sched-gym',
            user_id: 'test-user-uuid-1234',
            descricao: 'Gympass',
            valor_previsto: 100.00,
            categoria: 'Saúde',
            tipo: 'assinatura_cartao',
            cartao: 'ML CRÉDITO',
            dia_vencimento: 15,
            ativo: true
        }
    ];

    const testOccurrences = [
        {
            id: 'occ-gym-2026-09',
            agendamento_id: 'sched-gym',
            user_id: 'test-user-uuid-1234',
            descricao: 'Gympass',
            valor_previsto: 100.00,
            data_prevista: '2026-09-15',
            tipo: 'assinatura_cartao',
            status: 'PREVISTA',
            cartao: 'ML CRÉDITO',
            categoria: 'Saúde'
        }
    ];

    test('1. Cenário Base (Todos os Cartões) vs Filtro por Cartão ML CRÉDITO', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: testTransactions,
            schedules: testSchedules,
            occurrences: testOccurrences
        });

        await page.getByRole('button', { name: /Parcelas/i }).click();
        await expect(page.locator('#tab-parcelas')).toHaveClass(/active/);

        // Seleciona competência 2026-09 (Setembro/2026 => index '2026-8')
        await page.locator('#faturaMonthSelector').selectOption('2026-8');

        // Sem filtros:
        // Total Fatura: 500 + 30 + 70 + 200 = 800
        // Total Fatura Projetada: 800 + 100 = 900
        // Total Fatura Próxima: 500 (Notebook 2/5) + 30 (Spotify) + 200 (Celular 2/3) = 730
        // Total Futuro Restante: 4 * 500 (2000) + 2 * 200 (400) = 2400
        await expect(page.locator('#kpi-fatura-atual')).toContainText('800,00');
        await expect(page.locator('#kpi-fatura-projetada')).toContainText('900,00');
        await expect(page.locator('#kpi-fatura-proxima')).toContainText('730,00');
        await expect(page.locator('#kpi-parcela-total-restante')).toContainText('2.400,00');

        // Agora filtra por Cartão: ML CRÉDITO
        await page.locator('#parcelasCartaoFilter').selectOption('ML CRÉDITO');

        // O card de fatura atual DEVE refletir apenas ML CRÉDITO (500 + 30 = 530,00)
        // A Fatura Projetada DEVE refletir ML CRÉDITO (530 + 100 = 630,00)
        // A Fatura Próxima DEVE refletir apenas ML CRÉDITO (500 + 30 = 530,00)
        // O Total Futuro DEVE refletir apenas ML CRÉDITO (4 * 500 = 2000,00)
        await expect(page.locator('#kpi-fatura-atual')).toContainText('530,00');
        await expect(page.locator('#kpi-fatura-projetada')).toContainText('630,00');
        await expect(page.locator('#kpi-fatura-proxima')).toContainText('530,00');
        await expect(page.locator('#kpi-parcela-total-restante')).toContainText('2.000,00');

        // Gastos por Cartão deve exibir apenas ML CRÉDITO com 100% de participação
        const cartoesContainer = page.locator('#cartoesSummaryContainer');
        await expect(cartoesContainer).toContainText('ML CRÉDITO');
        await expect(cartoesContainer).toContainText('100.0%');
        await expect(cartoesContainer).not.toContainText('Nubank');

        // Limpar filtro de cartão (Todos os Cartões)
        await page.locator('#parcelasCartaoFilter').selectOption('all');
        await expect(page.locator('#kpi-fatura-atual')).toContainText('800,00');
        await expect(page.locator('#kpi-fatura-proxima')).toContainText('730,00');
        await expect(page.locator('#kpi-parcela-total-restante')).toContainText('2.400,00');
    });

    test('2. Filtro por Tipo de Compra: Parceladas vs Recorrentes vs À vista', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: testTransactions,
            schedules: testSchedules,
            occurrences: testOccurrences
        });

        await page.getByRole('button', { name: /Parcelas/i }).click();
        await page.locator('#faturaMonthSelector').selectOption('2026-8');

        // Filtro: Parceladas
        await page.locator('#parcelasTypeFilter').selectOption('parcelado');
        // Parceladas: Notebook (500) + Celular (200) = 700,00
        // Assinatura Gympass não é parcelada, logo Projetada = 700,00
        await expect(page.locator('#kpi-fatura-atual')).toContainText('700,00');
        await expect(page.locator('#kpi-fatura-projetada')).toContainText('700,00');

        // Filtro: Recorrentes
        await page.locator('#parcelasTypeFilter').selectOption('recorrente');
        // Recorrente: Spotify (30,00), Gympass previsto (100,00)
        await expect(page.locator('#kpi-fatura-atual')).toContainText('30,00');
        await expect(page.locator('#kpi-fatura-projetada')).toContainText('130,00');

        // Filtro: À vista
        await page.locator('#parcelasTypeFilter').selectOption('avista');
        // À vista: Almoço (70,00)
        await expect(page.locator('#kpi-fatura-atual')).toContainText('70,00');
        await expect(page.locator('#kpi-fatura-projetada')).toContainText('70,00');
    });

    test('3. Filtro por Categoria: Eletrônicos', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: testTransactions,
            schedules: testSchedules,
            occurrences: testOccurrences
        });

        await page.getByRole('button', { name: /Parcelas/i }).click();
        await page.locator('#faturaMonthSelector').selectOption('2026-8');

        await page.locator('#parcelasCategoryFilter').selectOption('Eletrônicos');
        // Eletrônicos: Notebook (500) + Celular (200) = 700,00
        await expect(page.locator('#kpi-fatura-atual')).toContainText('700,00');
        await expect(page.locator('#kpi-fatura-projetada')).toContainText('700,00');
    });

    test('4. Combinação: Cartão ML CRÉDITO + Tipo Parceladas', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: testTransactions,
            schedules: testSchedules,
            occurrences: testOccurrences
        });

        await page.getByRole('button', { name: /Parcelas/i }).click();
        await page.locator('#faturaMonthSelector').selectOption('2026-8');

        await page.locator('#parcelasCartaoFilter').selectOption('ML CRÉDITO');
        await page.locator('#parcelasTypeFilter').selectOption('parcelado');

        // ML CRÉDITO Parcelado: Notebook (500,00)
        await expect(page.locator('#kpi-fatura-atual')).toContainText('500,00');
        await expect(page.locator('#kpi-fatura-projetada')).toContainText('500,00');
    });

    test('5. Busca por Descrição: Spotify', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: testTransactions,
            schedules: testSchedules,
            occurrences: testOccurrences
        });

        await page.getByRole('button', { name: /Parcelas/i }).click();
        await page.locator('#faturaMonthSelector').selectOption('2026-8');

        await page.locator('#parcelasSearchInput').fill('Spotify');
        // Apenas Spotify: 30,00
        await expect(page.locator('#kpi-fatura-atual')).toContainText('30,00');
        await expect(page.locator('#kpi-fatura-projetada')).toContainText('30,00');
    });
});
