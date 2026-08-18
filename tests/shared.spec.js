// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');

test.describe('Gastos Compartilhados e Divisão de Contas', () => {

    test('1. Aba de Divisão de Gastos carrega listagem e totais', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();
        await expect(page.locator('#tab-divisao')).toHaveClass(/active/);

        // Verifica a tabela de gastos compartilhados
        await expect(page.locator('#sharedTableBody')).toContainText('Jantar Casal');
        await expect(page.locator('#sharedTableBody')).toContainText('Contas Casa - Luz');
    });

    test('2. Cadastro de novo gasto compartilhado com divisão 50/50', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();

        await page.locator('#s_data').fill('2026-08-18');
        await page.locator('#s_descricao').fill('Supermercado Casal');
        await page.locator('#s_valor_total').fill('400.00');
        await page.locator('#s_regra').selectOption('50_50');
        await page.locator('#s_regra').dispatchEvent('change');

        // Confirma cálculo automático dos campos
        await expect(page.locator('#s_valor_meu')).toHaveValue('200.00');
        await expect(page.locator('#s_valor_parceiro')).toHaveValue('200.00');

        await page.locator('#s_categoria').fill('Alimentação');

        // Submete
        await page.locator('#btnSalvarShared').click();

        // Verifica inserção na tabela
        await expect(page.locator('#sharedTableBody')).toContainText('Supermercado Casal');
    });

    test('3. Cadastro com divisão personalizada (Ex: 60/40)', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();

        await page.locator('#s_data').fill('2026-08-18');
        await page.locator('#s_descricao').fill('Aluguel Compartilhado');
        await page.locator('#s_valor_total').fill('1000.00');
        await page.locator('#s_valor_meu').fill('600.00');
        await page.locator('#s_valor_meu').dispatchEvent('input');

        await expect(page.locator('#s_valor_parceiro')).toHaveValue('400.00');
        await page.locator('#s_categoria').fill('Casa');

        await page.locator('#btnSalvarShared').click();

        await expect(page.locator('#sharedTableBody')).toContainText('Aluguel Compartilhado');
    });

});
