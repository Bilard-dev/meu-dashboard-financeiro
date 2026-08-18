// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');

test.describe('Smoke Tests - Abertura e Autenticação', () => {

    test('1. Aplicação carrega com título correto', async ({ page }) => {
        await setupAuthenticatedApp(page, { authenticated: false });
        await expect(page).toHaveTitle(/Dashboard Financeiro/i);
    });

    test('2. Tela de login é exibida para usuário não autenticado', async ({ page }) => {
        await setupAuthenticatedApp(page, { authenticated: false });
        const loginView = page.locator('#loginView');
        await expect(loginView).toBeVisible();
        await expect(page.locator('#email')).toBeVisible();
        await expect(page.locator('#senha')).toBeVisible();
        await expect(page.locator('#loginBtnText')).toBeVisible();
    });

    test('3. Dashboard principal e KPIs carregam com usuário autenticado', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // Verifica visibilidade do app principal
        await expect(page.locator('#appView')).toBeVisible();
        await expect(page.locator('#loginView')).toBeHidden();

        // Verifica se os KPIs principais estão presentes
        await expect(page.locator('#kpi-receitas')).toBeVisible();
        await expect(page.locator('#kpi-despesas')).toBeVisible();
        await expect(page.locator('#kpi-investimentos')).toBeVisible();
        await expect(page.locator('#kpi-saldo')).toBeVisible();
        await expect(page.locator('#kpi-dinheiro-vivo')).toBeVisible();
    });

    test('4. Navegação entre abas funciona corretamente', async ({ page }) => {
        await setupAuthenticatedApp(page);

        const tabs = [
            { btn: 'Resumo Geral', panel: '#tab-resumo' },
            { btn: '📊 Análise de Gastos', panel: '#tab-analise' },
            { btn: 'Parcelas / Fatura Cartão', panel: '#tab-parcelas' },
            { btn: '🎯 Metas & Limites', panel: '#tab-metas' },
            { btn: 'Investimentos', panel: '#tab-investimentos' },
            { btn: '⚖️ Gastos Compartilhados', panel: '#tab-divisao' },
            { btn: '➕ Novo Registro', panel: '#tab-novo' },
            { btn: '⚙️ Categorias & Listas', panel: '#tab-gerenciar-listas' }
        ];

        for (const { btn, panel } of tabs) {
            await page.getByRole('button', { name: btn }).click();
            await expect(page.locator(panel)).toHaveClass(/active/);
        }
    });

});
