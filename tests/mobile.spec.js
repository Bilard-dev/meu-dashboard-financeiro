// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');

test.describe('Mobile - Lançador Rápido de Bolso', () => {

    test.use({
        viewport: { width: 375, height: 667 } // Simulação de iPhone / Smartphone
    });

    test('1. Abertura e fechamento do Lançador Rápido', async ({ page }) => {
        await setupAuthenticatedApp(page);

        const btnMobile = page.getByRole('button', { name: /Lançador Celular/i });
        await expect(btnMobile).toBeVisible();
        await btnMobile.click();

        const modal = page.locator('#mobileQuickView');
        await expect(modal).toBeVisible();

        // Clica para fechar
        await modal.getByRole('button', { name: /Fechar/i }).click();
        await expect(modal).toBeHidden();
    });

    test('2. Exibição dinâmica de campos de cartão no formulário mobile', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: /Lançador Celular/i }).click();

        // Inicialmente em PIX, campos de cartão devem estar ocultos
        await expect(page.locator('#m_cartao')).toBeHidden();
        await expect(page.locator('#m_fatura_destino')).toBeHidden();

        // Altera para Cartão de Crédito
        await page.locator('#m_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#m_pagamento').dispatchEvent('change');

        // Campos de cartão e fatura devem aparecer
        await expect(page.locator('#m_cartao')).toBeVisible();
        await expect(page.locator('#m_fatura_destino')).toBeVisible();
    });

    test('3. Lançamento rápido de despesa via mobile', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: /Lançador Celular/i }).click();

        await page.locator('#m_descricao').fill('Café da Tarde Mobile');
        await page.locator('#m_valor').fill('15.50');
        await page.locator('#m_categoria').selectOption('Alimentação');
        await page.locator('#m_pagamento').selectOption('PIX');

        // Submete o gasto
        await page.getByRole('button', { name: 'Lançar Gasto Agora' }).click();

        // O modal deve fechar e a transação deve constar no extrato
        await expect(page.locator('#mobileQuickView')).toBeHidden();
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Café da Tarde Mobile');
    });

});
