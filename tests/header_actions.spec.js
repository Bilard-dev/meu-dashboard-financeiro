// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');

test.describe('Reorganização dos Botões do Cabeçalho & Aba Minha Conta', () => {

    test('1. Botão "➕ Novo Registro" está no cabeçalho e abre o formulário de cadastro', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // Verifica que o botão está dentro de header .header-controls
        const headerNovoBtn = page.locator('header .header-controls #tabNovoBtn');
        await expect(headerNovoBtn).toBeVisible();
        await expect(headerNovoBtn).toHaveText(/➕ Novo Registro/);

        // Verifica que o botão NÃO está mais dentro de .nav-tabs
        const navTabsNovoBtn = page.locator('.nav-tabs #tabNovoBtn');
        await expect(navTabsNovoBtn).toHaveCount(0);

        // Clica no botão e verifica que a aba #tab-novo é aberta
        await headerNovoBtn.click();
        await expect(page.locator('#tab-novo')).toHaveClass(/active/);
        await expect(page.locator('#formTitle')).toHaveText(/Cadastrar Nova Transação Individual/);
    });

    test('2. Botão Modo Escuro/Claro NÃO está no cabeçalho e está na aba Minha Conta', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // Verifica que o botão de tema NÃO está no cabeçalho
        const headerThemeBtn = page.locator('header .header-controls #themeToggleBtn');
        await expect(headerThemeBtn).toHaveCount(0);

        // Acessa a aba Minha Conta
        await page.click('button:has-text("🔒 Minha Conta")');
        await expect(page.locator('#tab-conta')).toHaveClass(/active/);

        // Verifica que o botão de tema está presente na aba Minha Conta
        const contaThemeBtn = page.locator('#tab-conta #themeToggleBtn');
        await expect(contaThemeBtn).toBeVisible();
        await expect(contaThemeBtn).toContainText(/Modo Escuro/);

        // Alterna para modo escuro
        await contaThemeBtn.click();
        await expect(page.locator('body')).toHaveClass(/dark-theme/);
        await expect(contaThemeBtn).toContainText(/Modo Claro/);

        // Alterna de volta para modo claro
        await contaThemeBtn.click();
        await expect(page.locator('body')).not.toHaveClass(/dark-theme/);
        await expect(contaThemeBtn).toContainText(/Modo Escuro/);
    });

    test('3. Botões Atualizar e Privacidade contêm apenas emojis e executam suas ações', async ({ page }) => {
        await setupAuthenticatedApp(page);

        const syncBtn = page.locator('header #syncBtn');
        const privacyBtn = page.locator('header #privacyToggleBtn');

        await expect(syncBtn).toBeVisible();
        await expect(privacyBtn).toBeVisible();

        // Verifica que o texto visível é exclusivamente o emoji
        await expect(syncBtn).toHaveText('🔄');
        await expect(privacyBtn).toHaveText('👁️');

        // Testa clique em Privacidade (ocultar valores)
        await privacyBtn.click();
        await expect(page.locator('#kpi-receitas')).toHaveText('R$ ****,**');

        // Testa clique em Privacidade novamente (exibir valores)
        await privacyBtn.click();
        await expect(page.locator('#kpi-receitas')).not.toHaveText('R$ ****,**');

        // Testa clique em Atualizar
        await syncBtn.click();
        await expect(syncBtn).toHaveAttribute('title', /Atualizado/);
    });

    test('4. Botões renomeados para "Metas" e "Categorias" e aba "Gastos Compartilhados" oculta', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // Verifica botão 🎯 Metas
        const metasBtn = page.getByRole('button', { name: '🎯 Metas' });
        await expect(metasBtn).toBeVisible();
        await metasBtn.click();
        await expect(page.locator('#tab-metas')).toHaveClass(/active/);

        // Verifica botão ⚙️ Categorias
        const categoriasBtn = page.getByRole('button', { name: '⚙️ Categorias' });
        await expect(categoriasBtn).toBeVisible();
        await categoriasBtn.click();
        await expect(page.locator('#tab-gerenciar-listas')).toHaveClass(/active/);

        // Verifica que o botão de Gastos Compartilhados está oculto (display: none)
        const divisaoBtn = page.locator('#tabDivisaoBtn');
        await expect(divisaoBtn).toBeHidden();
    });

});
