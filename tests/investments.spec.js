// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');

test.describe('Investimentos - Visualização e KPIs', () => {

    test('1. Aba de Investimentos exibe KPIs calculados corretamente', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: 'Investimentos' }).click();
        await expect(page.locator('#tab-investimentos')).toHaveClass(/active/);

        // No mock: Aporte 1 = R$ 1500, Aporte 2 = R$ 1000 -> Total = R$ 2500,00
        const totalInvestido = await page.locator('#kpi-patrimonio-total').textContent();
        expect(totalInvestido).toMatch(/2\.500,00/);

        // Maior aporte: R$ 1500,00
        const maiorAporte = await page.locator('#kpi-maior-aporte').textContent();
        expect(maiorAporte).toMatch(/1\.500,00/);
    });

    test('2. Listagem de aportes de investimentos é renderizada', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: 'Investimentos' }).click();

        await expect(page.locator('#investTableBody')).toContainText('Aporte Tesouro Direto');
        await expect(page.locator('#investTableBody')).toContainText('Ações Dividendos');
    });

    test('3. Gráfico de alocação e cards por categoria são renderizados com percentuais corretos', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: 'Investimentos' }).click();
        await expect(page.locator('#tab-investimentos')).toHaveClass(/active/);

        // Verifica a presença do gráfico de rosca
        await expect(page.locator('#investCategoryChart')).toBeVisible();

        // Verifica cards de categoria renderizados
        const cards = page.locator('#investCategoryCards .invest-category-card');
        await expect(cards).toHaveCount(1); // No mock padrão, ambos têm categoria "Investimentos"

        // Verifica valor e percentual (100%)
        await expect(cards.first()).toContainText('Investimentos');
        await expect(cards.first()).toContainText('2.500,00');
        await expect(cards.first()).toContainText('100.0%');
    });

    test('4. Múltiplas categorias de investimento geram cards e fatias distintas com filtro interativo', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'inv-1',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Investimento',
                    data: '2026-08-01',
                    descricao: 'Tesouro Selic 2029',
                    valor: 6000.00,
                    categoria: 'Renda Fixa',
                    subcategoria: 'Tesouro Direto'
                },
                {
                    id: 'inv-2',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Investimento',
                    data: '2026-08-05',
                    descricao: 'Fundo Imobiliário XPML11',
                    valor: 4000.00,
                    categoria: 'FIIs',
                    subcategoria: 'Fundos Imobiliários'
                }
            ]
        });

        await page.getByRole('button', { name: 'Investimentos' }).click();

        // Total = 10.000,00
        await expect(page.locator('#kpi-patrimonio-total')).toContainText('10.000,00');
        await expect(page.locator('#kpi-qtd-categorias-invest')).toHaveText('2');

        // Verifica os 2 cards de categoria
        const cards = page.locator('#investCategoryCards .invest-category-card');
        await expect(cards).toHaveCount(2);

        // Renda Fixa = 6.000 (60.0%)
        await expect(cards.nth(0)).toContainText('Renda Fixa');
        await expect(cards.nth(0)).toContainText('6.000,00');
        await expect(cards.nth(0)).toContainText('60.0%');

        // FIIs = 4.000 (40.0%)
        await expect(cards.nth(1)).toContainText('FIIs');
        await expect(cards.nth(1)).toContainText('4.000,00');
        await expect(cards.nth(1)).toContainText('40.0%');

        // Clica no card "FIIs" para filtrar
        await cards.nth(1).click();

        // Valida que o filtro filtrou a tabela para exibir apenas FIIs
        await expect(page.locator('#investTableBody')).toContainText('Fundo Imobiliário XPML11');
        await expect(page.locator('#investTableBody')).not.toContainText('Tesouro Selic 2029');
        await expect(page.locator('#kpi-patrimonio-total')).toContainText('4.000,00');
    });

    test('5. Tabela consolidada por ativo/subcategoria e evolução mensal dos aportes', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: 'Investimentos' }).click();

        // Verifica a tabela consolidada
        const summaryRows = page.locator('#investSummaryTableBody tr');
        await expect(summaryRows).toHaveCount(2); // Renda Fixa e Renda Variável

        await expect(page.locator('#investSummaryTableBody')).toContainText('Renda Fixa');
        await expect(page.locator('#investSummaryTableBody')).toContainText('1.500,00');
        await expect(page.locator('#investSummaryTableBody')).toContainText('Renda Variável');
        await expect(page.locator('#investSummaryTableBody')).toContainText('1.000,00');

        // Verifica o gráfico de evolução
        await expect(page.locator('#investEvolutionChart')).toBeVisible();
    });

    test('6. Busca rápida e botão limpar filtros no histórico de investimentos', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: 'Investimentos' }).click();

        // Busca por "Dividendos"
        await page.locator('#investSearchInput').fill('Dividendos');
        await expect(page.locator('#investTableBody')).toContainText('Ações Dividendos');
        await expect(page.locator('#investTableBody')).not.toContainText('Tesouro Direto');
        await expect(page.locator('#kpi-patrimonio-total')).toContainText('1.000,00');

        // Clica no botão Limpar
        await page.getByRole('button', { name: 'Limpar' }).click();
        await expect(page.locator('#investTableBody')).toContainText('Aporte Tesouro Direto');
        await expect(page.locator('#investTableBody')).toContainText('Ações Dividendos');
        await expect(page.locator('#kpi-patrimonio-total')).toContainText('2.500,00');
    });

});
