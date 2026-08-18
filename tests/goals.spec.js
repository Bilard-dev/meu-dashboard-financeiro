// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');

test.describe('Metas e Limites de Gastos', () => {

    test('1. Aba de Metas renderiza orçamentos e barras de progresso', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '🎯 Metas & Limites' }).click();
        await expect(page.locator('#tab-metas')).toHaveClass(/active/);

        const container = page.locator('#budgetsListContainer');
        // No mockData: Alimentação tem teto de R$ 1.000,00
        await expect(container).toContainText('Alimentação');
        await expect(container).toContainText('1.000,00');

        // Saúde tem teto de R$ 300,00
        await expect(container).toContainText('Saúde');
        await expect(container).toContainText('300,00');
    });

    test('2. Definição de nova meta via interface', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '🎯 Metas & Limites' }).click();

        // Preenche o formulário de nova meta
        await page.locator('#b_target').fill('Transporte');
        await page.locator('#b_limit').fill('500.00');

        await page.getByRole('button', { name: 'Salvar Meta' }).click();

        // Confirma que a meta de Transporte aparece na listagem
        const container = page.locator('#budgetsListContainer');
        await expect(container).toContainText('Transporte');
        await expect(container).toContainText('500,00');
    });

});
