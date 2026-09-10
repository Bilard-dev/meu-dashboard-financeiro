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

    test('2. Exibição dinâmica de campos de cartão e opções de parcelamento no formulário mobile', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: /Lançador Celular/i }).click();

        // Inicialmente em PIX, campos de cartão devem estar ocultos
        await expect(page.locator('#m_cartao')).toBeHidden();
        await expect(page.locator('#m_fatura_destino')).toBeHidden();
        await expect(page.locator('#m_parcela_select')).toBeHidden();

        // Altera para Cartão de Crédito
        await page.locator('#m_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#m_pagamento').dispatchEvent('change');

        // Campos de cartão, fatura e parcelas devem aparecer
        await expect(page.locator('#m_cartao')).toBeVisible();
        await expect(page.locator('#m_fatura_destino')).toBeVisible();
        await expect(page.locator('#m_parcela_select')).toBeVisible();

        // Verifica opções de parcelamento no seletor mobile
        const parcelaSelect = page.locator('#m_parcela_select');
        await expect(parcelaSelect).toContainText('À vista');
        await expect(parcelaSelect).toContainText('2x (1/2)');
        await expect(parcelaSelect).toContainText('3x (1/3)');
        await expect(parcelaSelect).toContainText('12x (1/12)');
        await expect(parcelaSelect).toContainText('Recorrente');
        await expect(parcelaSelect).toContainText('Outro');
    });

    test('3. Lançamento rápido de despesa à vista via mobile', async ({ page }) => {
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

    test('4. Lançamento de compra parcelada (ex: 3x) via lançador mobile', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: /Lançador Celular/i }).click();

        await page.locator('#m_descricao').fill('Tênis Esportivo');
        await page.locator('#m_valor').fill('120.00');
        await page.locator('#m_categoria').selectOption('Alimentação');
        await page.locator('#m_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#m_pagamento').dispatchEvent('change');

        // Seleciona cartão e parcela 3x (1/3)
        await page.locator('#m_cartao').selectOption({ index: 1 });
        await page.locator('#m_parcela_select').selectOption('1/3');

        // Submete o gasto
        await page.getByRole('button', { name: 'Lançar Gasto Agora' }).click();

        await expect(page.locator('#mobileQuickView')).toBeHidden();
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Tênis Esportivo');

        // Verifica que a compra parcelada foi devidamente projetada na aba Parcelas
        await page.locator('#bnav-mais').click();
        await page.getByRole('button', { name: /Faturas & Parcelas/i }).click();
        await expect(page.locator('#parcelasTableBody')).toContainText('Tênis Esportivo');
        await expect(page.locator('#parcelasTableBody')).toContainText('1/3');
    });

    test('5. Lançamento de compra parcelada customizada (CUSTOM ex: 1/12) via mobile', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: /Lançador Celular/i }).click();

        await page.locator('#m_descricao').fill('Notebook Dell');
        await page.locator('#m_valor').fill('450.00');
        await page.locator('#m_categoria').selectOption('Alimentação');
        await page.locator('#m_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#m_pagamento').dispatchEvent('change');

        await page.locator('#m_cartao').selectOption({ index: 1 });
        await page.locator('#m_parcela_select').selectOption('CUSTOM');
        await expect(page.locator('#m_parcela_custom')).toBeVisible();
        await page.locator('#m_parcela_custom').fill('1/12');

        await page.getByRole('button', { name: 'Lançar Gasto Agora' }).click();

        await expect(page.locator('#mobileQuickView')).toBeHidden();
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Notebook Dell');

        // Verifica que a compra parcelada customizada consta na aba Parcelas
        await page.locator('#bnav-mais').click();
        await page.getByRole('button', { name: /Faturas & Parcelas/i }).click();
        await expect(page.locator('#parcelasTableBody')).toContainText('Notebook Dell');
        await expect(page.locator('#parcelasTableBody')).toContainText('1/12');
    });

    test('6. Lançamento de despesa recorrente / assinatura no cartão via mobile', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: /Lançador Celular/i }).click();

        await page.locator('#m_descricao').fill('Assinatura Spotify Duo');
        await page.locator('#m_valor').fill('34.90');
        await page.locator('#m_categoria').selectOption('Lazer');
        await page.locator('#m_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#m_pagamento').dispatchEvent('change');

        await page.locator('#m_cartao').selectOption({ index: 1 });
        await page.locator('#m_parcela_select').selectOption('RECORRENTE');

        await page.getByRole('button', { name: 'Lançar Gasto Agora' }).click();

        await expect(page.locator('#mobileQuickView')).toBeHidden();
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Assinatura Spotify Duo');

        // Verifica na aba Parcelas como recorrente
        await page.locator('#bnav-mais').click();
        await page.getByRole('button', { name: /Faturas & Parcelas/i }).click();
        await expect(page.locator('#parcelasTableBody')).toContainText('Assinatura Spotify Duo');
        await expect(page.locator('#parcelasTableBody')).toContainText('Recorrente');
    });

});
