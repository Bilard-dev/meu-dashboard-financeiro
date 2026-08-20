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

});
