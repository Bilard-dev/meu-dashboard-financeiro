// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');

test.describe('Faturas e Parcelas - Geração Dinâmica e Projeção', () => {

    test('1. Seletor de Faturas exibe opções relativas corretas para Agosto/2026', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_pagamento').dispatchEvent('change');

        await page.locator('#i_data').fill('2026-08-18');
        await page.locator('#i_data').dispatchEvent('change');

        const select = page.locator('#i_fatura_destino');
        const optAtual = select.locator('option[value="ATUAL"]');
        const optProx = select.locator('option[value="PROXIMA"]');

        await expect(optAtual).toHaveText(/Agosto\/2026/);
        await expect(optProx).toHaveText(/Setembro\/2026/);
    });

    test('2. Virada de Ano Dezembro/2026 -> Janeiro/2027 calcula sem erro', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_pagamento').dispatchEvent('change');

        await page.locator('#i_data').fill('2026-12-20');
        await page.locator('#i_data').dispatchEvent('change');

        const select = page.locator('#i_fatura_destino');
        const optAtual = select.locator('option[value="ATUAL"]');
        const optProx = select.locator('option[value="PROXIMA"]');
        const optJan27 = select.locator('option[value="2027-0"]');

        await expect(optAtual).toHaveText(/Dezembro\/2026/);
        await expect(optProx).toHaveText(/Janeiro\/2027/);
        await expect(optJan27).toBeAttached();
    });

    test('3. Geração dinâmica em datas de 2027 (Ex: Maio/2027)', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_pagamento').dispatchEvent('change');

        await page.locator('#i_data').fill('2027-05-15');
        await page.locator('#i_data').dispatchEvent('change');

        const select = page.locator('#i_fatura_destino');
        const optAtual = select.locator('option[value="ATUAL"]');
        const optProx = select.locator('option[value="PROXIMA"]');

        await expect(optAtual).toHaveText(/Maio\/2027/);
        await expect(optProx).toHaveText(/Junho\/2027/);
    });

    test('4. Seleção e persistência de fatura específica YYYY-M', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_pagamento').dispatchEvent('change');

        await page.locator('#i_data').fill('2026-08-18');
        await page.locator('#i_data').dispatchEvent('change');

        const select = page.locator('#i_fatura_destino');
        await select.selectOption('2026-10'); // Novembro/2026
        await expect(select).toHaveValue('2026-10');
    });

    test('5. Aba Parcelas / Fatura Cartão projeta faturas e compras parceladas', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // Acessa a aba de parcelas
        await page.getByRole('button', { name: 'Parcelas / Fatura Cartão' }).click();
        await expect(page.locator('#tab-parcelas')).toHaveClass(/active/);

        // Verifica se os KPIs de fatura selecionada e seguinte são renderizados
        await expect(page.locator('#kpi-title-fatura-selecionada')).toBeVisible();
        await expect(page.locator('#kpi-fatura-atual')).toBeVisible();
        await expect(page.locator('#kpi-fatura-proxima')).toBeVisible();

        // Verifica se o seletor de mês da fatura contém opções
        const faturaSelector = page.locator('#faturaMonthSelector');
        await expect(faturaSelector).toBeVisible();
        const optionsCount = await faturaSelector.locator('option').count();
        expect(optionsCount).toBeGreaterThan(0);
    });

});
