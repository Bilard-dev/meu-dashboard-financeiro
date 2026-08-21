// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');
const { mockUser } = require('./fixtures/mockData');

test.describe('Base 3.0 — SPA Hash Routing', () => {

    test('1. URL sem hash abre Dashboard por padrão e normaliza para #/dashboard', async ({ page }) => {
        await setupAuthenticatedApp(page);
        await expect(page.locator('#tab-resumo')).toBeVisible();
        await expect(page).toHaveURL(/#\/dashboard/);
    });

    test('2. #/dashboard abre a aba de Resumo Geral', async ({ page }) => {
        await setupAuthenticatedApp(page, { initialUrl: '/#/dashboard' });
        await expect(page.locator('#tab-resumo')).toBeVisible();
        await expect(page.locator('button.tab-btn.active')).toContainText('Resumo Geral');
    });

    test('3. #/extrato abre a aba de Análise de Gastos / Extrato', async ({ page }) => {
        await setupAuthenticatedApp(page, { initialUrl: '/#/extrato' });
        await expect(page.locator('#tab-analise')).toBeVisible();
        await expect(page.locator('button.tab-btn.active')).toContainText('Análise de Gastos');
    });

    test('4. #/faturas abre a aba de Parcelas / Fatura Cartão', async ({ page }) => {
        await setupAuthenticatedApp(page, { initialUrl: '/#/faturas' });
        await expect(page.locator('#tab-parcelas')).toBeVisible();
        await expect(page.locator('button.tab-btn.active')).toContainText('Parcelas / Fatura Cartão');
    });

    test('5. #/parcelas abre a aba de Parcelas / Fatura Cartão', async ({ page }) => {
        await setupAuthenticatedApp(page, { initialUrl: '/#/parcelas' });
        await expect(page.locator('#tab-parcelas')).toBeVisible();
        await expect(page.locator('button.tab-btn.active')).toContainText('Parcelas / Fatura Cartão');
    });

    test('6. #/metas abre a aba de Metas', async ({ page }) => {
        await setupAuthenticatedApp(page, { initialUrl: '/#/metas' });
        await expect(page.locator('#tab-metas')).toBeVisible();
        await expect(page.locator('button.tab-btn.active')).toContainText('Metas');
    });

    test('7. #/previsao abre a aba de Previsão Financeira 2.0', async ({ page }) => {
        await setupAuthenticatedApp(page, { initialUrl: '/#/previsao' });
        await expect(page.locator('#tab-previsao')).toBeVisible();
        await expect(page.locator('button.tab-btn.active')).toContainText('Previsão Financeira');
    });

    test('8. #/investimentos abre a aba de Investimentos', async ({ page }) => {
        await setupAuthenticatedApp(page, { initialUrl: '/#/investimentos' });
        await expect(page.locator('#tab-investimentos')).toBeVisible();
        await expect(page.locator('button.tab-btn.active')).toContainText('Investimentos');
    });

    test('9. #/configuracoes abre a aba de Categorias', async ({ page }) => {
        await setupAuthenticatedApp(page, { initialUrl: '/#/configuracoes' });
        await expect(page.locator('#tab-gerenciar-listas')).toBeVisible();
        await expect(page.locator('button.tab-btn.active')).toContainText('Categorias');
    });

    test('10. Rota inválida (#/batata) faz fallback suave para Dashboard e normaliza URL', async ({ page }) => {
        await setupAuthenticatedApp(page, { initialUrl: '/#/batata' });
        await expect(page.locator('#tab-resumo')).toBeVisible();
        await expect(page).toHaveURL(/#\/dashboard/);
    });

    test('11. Clique em abas atualiza dinamicamente o hash da URL', async ({ page }) => {
        await setupAuthenticatedApp(page);
        await expect(page.locator('#tab-resumo')).toBeVisible();

        await page.click('button:has-text("🔮 Previsão Financeira")');
        await expect(page.locator('#tab-previsao')).toBeVisible();
        await expect(page).toHaveURL(/#\/previsao/);

        await page.click('button:has-text("🎯 Metas")');
        await expect(page.locator('#tab-metas')).toBeVisible();
        await expect(page).toHaveURL(/#\/metas/);

        await page.click('button:has-text("⚙️ Categorias")');
        await expect(page.locator('#tab-gerenciar-listas')).toBeVisible();
        await expect(page).toHaveURL(/#\/configuracoes/);
    });

    test('12. Widget de resumo no Dashboard atualiza hash ao clicar em Ver Previsão Completa', async ({ page }) => {
        await setupAuthenticatedApp(page);
        await page.click('#dashboardForecastWidget button:has-text("Ver Previsão Completa")');
        await expect(page.locator('#tab-previsao')).toBeVisible();
        await expect(page).toHaveURL(/#\/previsao/);
    });

    test('13. Refresh (F5) mantém exatamente a mesma aba ativa', async ({ page }) => {
        await setupAuthenticatedApp(page, { initialUrl: '/#/faturas' });
        await expect(page.locator('#tab-parcelas')).toBeVisible();

        // Recarrega a página
        await page.reload();
        await expect(page.locator('#tab-parcelas')).toBeVisible();
        await expect(page.locator('button.tab-btn.active')).toContainText('Parcelas / Fatura Cartão');
        await expect(page).toHaveURL(/#\/parcelas/);
    });

    test('14. Histórico de navegação Voltar (Back) funciona corretamente', async ({ page }) => {
        await setupAuthenticatedApp(page);
        await expect(page.locator('#tab-resumo')).toBeVisible();

        // Vai para Extrato
        await page.click('button:has-text("📊 Análise de Gastos")');
        await expect(page.locator('#tab-analise')).toBeVisible();
        await expect(page).toHaveURL(/#\/extrato/);

        // Vai para Previsão
        await page.click('button:has-text("🔮 Previsão Financeira")');
        await expect(page.locator('#tab-previsao')).toBeVisible();
        await expect(page).toHaveURL(/#\/previsao/);

        // Voltar -> Extrato
        await page.goBack();
        await expect(page.locator('#tab-analise')).toBeVisible();
        await expect(page).toHaveURL(/#\/extrato/);

        // Voltar -> Dashboard
        await page.goBack();
        await expect(page.locator('#tab-resumo')).toBeVisible();
        await expect(page).toHaveURL(/#\/dashboard/);
    });

    test('15. Histórico de navegação Avançar (Forward) funciona corretamente', async ({ page }) => {
        await setupAuthenticatedApp(page);
        await expect(page.locator('#tab-resumo')).toBeVisible();

        await page.click('button:has-text("📊 Análise de Gastos")');
        await expect(page.locator('#tab-analise')).toBeVisible();
        await expect(page).toHaveURL(/#\/extrato/);

        await page.goBack();
        await expect(page.locator('#tab-resumo')).toBeVisible();
        await expect(page).toHaveURL(/#\/dashboard/);

        await page.goForward();
        await expect(page.locator('#tab-analise')).toBeVisible();
        await expect(page).toHaveURL(/#\/extrato/);
    });

    test('16. Alteração manual de hash no navegador dispara hashchange e abre aba correspondente', async ({ page }) => {
        await setupAuthenticatedApp(page);
        await expect(page.locator('#tab-resumo')).toBeVisible();

        await page.evaluate(() => { window.location.hash = '#/investimentos'; });
        await expect(page.locator('#tab-investimentos')).toBeVisible();
        await expect(page.locator('button.tab-btn.active')).toContainText('Investimentos');
    });

    test('17. Login com formulário e deep link inicial honra a rota solicitada após autenticação', async ({ page }) => {
        await setupAuthenticatedApp(page, { authenticated: false, initialUrl: '/#/metas' });
        await expect(page.locator('#loginView')).toBeVisible();

        await page.fill('#email', 'teste@financas.com');
        await page.fill('#senha', 'Senha@123');
        await page.click('#loginBtnText');

        await expect(page.locator('#appView')).toBeVisible();
        await expect(page.locator('#tab-metas')).toBeVisible();
        await expect(page.locator('button.tab-btn.active')).toContainText('Metas');
        await expect(page).toHaveURL(/#\/metas/);
    });

    test('18. Logout não quebra o routing e não expõe abas privadas para usuário deslogado', async ({ page }) => {
        await setupAuthenticatedApp(page, { authenticated: false, initialUrl: '/#/previsao' });
        await expect(page.locator('#loginView')).toBeVisible();
        await expect(page.locator('#appView')).not.toBeVisible();
        await expect(page.locator('#tab-previsao')).not.toBeVisible();
    });

    test('19. Navegação mobile (390x844) utiliza as mesmas rotas SPA', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, { initialUrl: '/#/previsao' });
        await expect(page.locator('#tab-previsao')).toBeVisible();
        await expect(page).toHaveURL(/#\/previsao/);
    });

    test('20. Nenhum loop de navegação entre switchTab e hashchange', async ({ page }) => {
        await setupAuthenticatedApp(page);
        let hashChanges = 0;
        await page.evaluate(() => {
            window.addEventListener('hashchange', () => { window._testHashChangeCount = (window._testHashChangeCount || 0) + 1; });
        });

        await page.click('button:has-text("🔮 Previsão Financeira")');
        await expect(page.locator('#tab-previsao')).toBeVisible();

        const count = await page.evaluate(() => window._testHashChangeCount || 0);
        // Exatamente 1 evento de hashchange, zero loop
        expect(count).toBeLessThanOrEqual(1);
    });

    test('21. Nenhum reload desnecessário de página ao trocar repetidamente de abas', async ({ page }) => {
        await setupAuthenticatedApp(page);
        await page.waitForLoadState('load');

        let reloadCount = 0;
        page.on('load', () => reloadCount++);

        for (let i = 0; i < 4; i++) {
            await page.click('button:has-text("🔮 Previsão Financeira")');
            await expect(page.locator('#tab-previsao')).toBeVisible();
            await page.click('button:has-text("🎯 Metas")');
            await expect(page.locator('#tab-metas')).toBeVisible();
            await page.click('button:has-text("Resumo Geral")');
            await expect(page.locator('#tab-resumo')).toBeVisible();
        }

        // Zero page reloads triggered
        expect(reloadCount).toBe(0);
    });

    test('22. Nenhuma regressão nas chamadas programáticas de switchTab', async ({ page }) => {
        await setupAuthenticatedApp(page);
        await page.evaluate(() => { switchTab('divisao'); });
        await expect(page.locator('#tab-divisao')).toBeVisible();
        await expect(page).toHaveURL(/#\/divisao/);

        await page.evaluate(() => { switchTab('novo'); });
        await expect(page.locator('#tab-novo')).toBeVisible();
        await expect(page).toHaveURL(/#\/novo/);
    });
});
