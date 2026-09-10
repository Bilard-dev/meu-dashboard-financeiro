// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');
const {
    mockTransactions,
    mockCategorias,
    mockSubcategorias,
    mockCartoes
} = require('./fixtures/mockData');

test.describe('Fase 4.0 — M4.0-B: Navegação Mobile e Bottom Navigation', () => {

    test('1. Bottom Navigation é visível em viewports mobile (<= 768px)', async ({ page }) => {
        const mobileViewports = [
            { width: 320, height: 568 },
            { width: 360, height: 800 },
            { width: 375, height: 667 },
            { width: 390, height: 844 },
            { width: 412, height: 915 },
            { width: 768, height: 1024 }
        ];

        for (const vp of mobileViewports) {
            await page.setViewportSize(vp);
            await setupAuthenticatedApp(page, {
                transactions: mockTransactions,
                categorias: mockCategorias,
                subcategorias: mockSubcategorias,
                cartoes: mockCartoes
            });

            const bottomNav = page.locator('#mobileBottomNav');
            await expect(bottomNav, `Bottom nav deve ser visível em ${vp.width}x${vp.height}`).toBeVisible();
        }
    });

    test('2. Bottom Navigation é oculta em viewports desktop (> 768px)', async ({ page }) => {
        const desktopViewports = [
            { width: 820, height: 1180 },
            { width: 1366, height: 768 },
            { width: 1920, height: 1080 }
        ];

        for (const vp of desktopViewports) {
            await page.setViewportSize(vp);
            await setupAuthenticatedApp(page, {
                transactions: mockTransactions,
                categorias: mockCategorias,
                subcategorias: mockSubcategorias,
                cartoes: mockCartoes
            });

            const bottomNav = page.locator('#mobileBottomNav');
            await expect(bottomNav, `Bottom nav deve ser oculta em ${vp.width}x${vp.height}`).toBeHidden();
        }
    });

    test('3. Bottom Navigation exibe exatamente as 5 posições canônicas estruturadas', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        await expect(page.locator('#bnav-resumo')).toBeVisible();
        await expect(page.locator('#bnav-resumo')).toContainText('Início');

        await expect(page.locator('#bnav-parcelas')).toBeVisible();
        await expect(page.locator('#bnav-parcelas')).toContainText('Faturas');

        await expect(page.locator('#bnav-fab')).toBeVisible();
        await expect(page.locator('#bnav-fab')).toContainText('➕');

        await expect(page.locator('#bnav-investimentos')).toBeVisible();
        await expect(page.locator('#bnav-investimentos')).toContainText('Investimentos');

        await expect(page.locator('#bnav-mais')).toBeVisible();
        await expect(page.locator('#bnav-mais')).toContainText('Mais');
    });

    test('4. Sincronização de estado ativo com carregamento inicial por Hash SPA', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });

        // Carrega direto em #/dashboard
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });
        await page.goto('#/dashboard');
        await expect(page.locator('#bnav-resumo')).toHaveClass(/active/);
        await expect(page.locator('#bnav-resumo')).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('#bnav-parcelas')).not.toHaveClass(/active/);

        // Carrega direto em #/faturas
        await page.goto('#/faturas');
        await expect(page.locator('#bnav-parcelas')).toHaveClass(/active/);
        await expect(page.locator('#bnav-parcelas')).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('#bnav-resumo')).not.toHaveClass(/active/);

        // Carrega direto em #/investimentos
        await page.goto('#/investimentos');
        await expect(page.locator('#bnav-investimentos')).toHaveClass(/active/);
        await expect(page.locator('#bnav-investimentos')).toHaveAttribute('aria-current', 'page');
    });

    test('5. Navegação direta via itens do Bottom Nav altera abas e atualiza Hash URL', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        // Clica em Faturas
        await page.locator('#bnav-parcelas').click();
        await expect(page.locator('#tab-parcelas')).toBeVisible();
        await expect(page).toHaveURL(/#\/(parcelas|faturas)/);
        await expect(page.locator('#bnav-parcelas')).toHaveClass(/active/);

        // Clica em Investimentos
        await page.locator('#bnav-investimentos').click();
        await expect(page.locator('#tab-investimentos')).toBeVisible();
        await expect(page).toHaveURL(/#\/investimentos/);
        await expect(page.locator('#bnav-investimentos')).toHaveClass(/active/);

        // Retorna para Início
        await page.locator('#bnav-resumo').click();
        await expect(page.locator('#tab-resumo')).toBeVisible();
        await expect(page).toHaveURL(/#\/dashboard/);
        await expect(page.locator('#bnav-resumo')).toHaveClass(/active/);
    });

    test('6. FAB Central (+) aciona Lançador Rápido sem alterar Hash nem receber classe active', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        await page.goto('#/dashboard');
        const initialUrl = page.url();

        // Clica no botão central '+'
        await page.locator('#bnav-fab').click();

        // Modal do lançador rápido abre
        const quickModal = page.locator('#mobileQuickView');
        await expect(quickModal).toBeVisible();

        // URL não foi alterada e FAB não possui classe active
        expect(page.url()).toBe(initialUrl);
        await expect(page.locator('#bnav-fab')).not.toHaveClass(/active/);
        await expect(page.locator('#bnav-resumo')).toHaveClass(/active/);

        // Fecha o lançador rápido
        await quickModal.getByRole('button', { name: /Fechar/i }).click();
        await expect(quickModal).toBeHidden();
        await expect(page.locator('#tab-resumo')).toBeVisible();
    });

    test('7. Fechamento do Lançador Rápido preserva a aba ativa anterior', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        // Abre aba de Faturas
        await page.goto('#/faturas');
        await expect(page.locator('#bnav-parcelas')).toHaveClass(/active/);

        // Abre Lançador Rápido
        await page.locator('#bnav-fab').click();
        const quickModal = page.locator('#mobileQuickView');
        await expect(quickModal).toBeVisible();

        // Fecha Lançador Rápido
        await quickModal.getByRole('button', { name: /Fechar/i }).click();
        await expect(quickModal).toBeHidden();

        // Permanece na aba Faturas com estado ativo intacto
        await expect(page.locator('#tab-parcelas')).toBeVisible();
        await expect(page.locator('#bnav-parcelas')).toHaveClass(/active/);
        await expect(page).toHaveURL(/#\/(parcelas|faturas)/);
    });

    test('8. Botão Mais abre Bottom Sheet e exibe overlay com acessibilidade correta', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        const maisBtn = page.locator('#bnav-mais');
        const sheet = page.locator('#mobileMoreSheet');
        const overlay = page.locator('#mobileMoreSheetOverlay');

        await expect(sheet).toBeHidden();
        await expect(overlay).toBeHidden();
        await expect(maisBtn).toHaveAttribute('aria-expanded', 'false');

        // Clica em Mais
        await maisBtn.click();

        await expect(sheet).toBeVisible();
        await expect(overlay).toBeVisible();
        await expect(maisBtn).toHaveAttribute('aria-expanded', 'true');
    });

    test('9. Rotas secundárias no menu Mais navegam para abas corretas e ativam o item Mais', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        // 9.1 Extrato & Análise
        await page.locator('#bnav-mais').click();
        await page.getByRole('button', { name: /Extrato/i }).click();
        await expect(page.locator('#tab-analise')).toBeVisible();
        await expect(page).toHaveURL(/#\/(analise|extrato)/);
        await expect(page.locator('#bnav-mais')).toHaveClass(/active/);
        await expect(page.locator('#mobileMoreSheet')).toBeHidden();

        // 9.2 Previsão
        await page.locator('#bnav-mais').click();
        await page.getByRole('button', { name: /Previsão/i }).click();
        await expect(page.locator('#tab-previsao')).toBeVisible();
        await expect(page).toHaveURL(/#\/previsao/);
        await expect(page.locator('#bnav-mais')).toHaveClass(/active/);
        await expect(page.locator('#mobileMoreSheet')).toBeHidden();

        // 9.3 Categorias
        await page.locator('#bnav-mais').click();
        await page.getByRole('button', { name: /Categorias/i }).click();
        await expect(page.locator('#tab-gerenciar-listas')).toBeVisible();
        await expect(page).toHaveURL(/#\/configuracoes/);
        await expect(page.locator('#bnav-mais')).toHaveClass(/active/);
        await expect(page.locator('#mobileMoreSheet')).toBeHidden();

        // 9.4 Minha Conta
        await page.locator('#bnav-mais').click();
        await page.getByRole('button', { name: /Minha Conta/i }).click();
        await expect(page.locator('#tab-conta')).toBeVisible();
        await expect(page).toHaveURL(/#\/conta/);
        await expect(page.locator('#bnav-mais')).toHaveClass(/active/);
        await expect(page.locator('#mobileMoreSheet')).toBeHidden();

        // 9.5 Confirma exatamente 6 atalhos no menu Mais Opções (Metas e Novo Registro Completo removidos)
        await page.locator('#bnav-mais').click();
        await expect(page.locator('#mobileMoreSheet .mobile-more-grid .mobile-more-btn')).toHaveCount(6);
        await expect(page.locator('#mobileMoreSheet').getByRole('button', { name: /Metas/i })).toHaveCount(0);
        await expect(page.locator('#mobileMoreSheet').getByRole('button', { name: /Novo Registro Completo/i })).toHaveCount(0);
        await page.locator('#mobileMoreSheetOverlay').click({ position: { x: 5, y: 5 } });
    });

    test('10. Fechamento do Bottom Sheet por clique no botão Fechar (✕), clique no overlay e tecla ESC', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        const sheet = page.locator('#mobileMoreSheet');
        const overlay = page.locator('#mobileMoreSheetOverlay');

        // 10.1 Fechamento por botão ✕
        await page.locator('#bnav-mais').click();
        await expect(sheet).toBeVisible();
        await sheet.getByRole('button', { name: /Fechar menu/i }).click();
        await expect(sheet).toBeHidden();
        await expect(overlay).toBeHidden();

        // 10.2 Fechamento por clique no overlay
        await page.locator('#bnav-mais').click();
        await expect(sheet).toBeVisible();
        await overlay.click({ position: { x: 10, y: 10 } });
        await expect(sheet).toBeHidden();
        await expect(overlay).toBeHidden();

        // 10.3 Fechamento por tecla Escape
        await page.locator('#bnav-mais').click();
        await expect(sheet).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(sheet).toBeHidden();
        await expect(overlay).toBeHidden();
    });

    test('11. Ações Rápidas no menu Mais: Modo Privacidade e Sincronização funcionam e fecham o menu', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        // 11.1 Alternar Modo Privacidade
        await page.locator('#bnav-mais').click();
        await page.getByRole('button', { name: /Alternar Modo Privacidade/i }).click();
        await expect(page.locator('#mobileMoreSheet')).toBeHidden();
        const isPrivacyActive = await page.evaluate(() => window.getPrivacyMode ? window.getPrivacyMode() : false);
        expect(isPrivacyActive).toBe(true);

        // 11.2 Sincronização manual fecha o menu
        await page.locator('#bnav-mais').click();
        await page.getByRole('button', { name: /Sincronizar com Nuvem/i }).click();
        await expect(page.locator('#mobileMoreSheet')).toBeHidden();
    });

    test('12. Acessibilidade e Atributos ARIA estruturados', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        // Bottom nav
        const bottomNav = page.locator('#mobileBottomNav');
        await expect(bottomNav).toHaveAttribute('aria-label', /Navegação/i);

        // Item ativo possui aria-current="page"
        await page.goto('#/dashboard');
        await expect(page.locator('#bnav-resumo')).toHaveAttribute('aria-current', 'page');

        // Botão Mais possui aria-haspopup="dialog"
        await expect(page.locator('#bnav-mais')).toHaveAttribute('aria-haspopup', 'dialog');

        // Sheet possui role="dialog" e aria-modal="true"
        const sheet = page.locator('#mobileMoreSheet');
        await expect(sheet).toHaveAttribute('role', 'dialog');
        await expect(sheet).toHaveAttribute('aria-modal', 'true');
    });

    test('13. Touch Targets atendem às dimensões mínimas recomendadas (>= 44x44px)', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        const targets = ['#bnav-resumo', '#bnav-parcelas', '#bnav-fab', '#bnav-investimentos', '#bnav-mais'];
        for (const selector of targets) {
            const box = await page.locator(selector).boundingBox();
            expect(box, `Elemento ${selector} deve ter boundingBox`).not.toBeNull();
            if (box) {
                expect(box.height, `Altura de ${selector} (${box.height}px) deve ser >= 44px`).toBeGreaterThanOrEqual(44);
                expect(box.width, `Largura de ${selector} (${box.width}px) deve ser >= 44px`).toBeGreaterThanOrEqual(44);
            }
        }
    });

    test('14. Simplificação do Header Mobile em telas <= 768px', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        // Botões de header redundantes estão ocultos no mobile
        await expect(page.locator('#tabNovoBtn')).toBeHidden();

        // Barra de abas tradicional oculta no mobile
        await expect(page.locator('.nav-tabs')).toBeHidden();

        // Controles essenciais permanecem visíveis
        await expect(page.locator('#syncBtn')).toBeVisible();
        await expect(page.locator('#privacyToggleBtn')).toBeVisible();
        await expect(page.locator('#monthSelector')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
    });

    test('15. Preservação integral da experiência desktop (> 768px)', async ({ page }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        // Bottom nav oculta no desktop
        await expect(page.locator('#mobileBottomNav')).toBeHidden();

        // Barra de abas tradicional visível
        await expect(page.locator('.nav-tabs')).toBeVisible();
        await expect(page.locator('#tabNovoBtn')).toBeVisible();

        // Navegação por abas tradicional funciona normalmente
        await page.getByRole('button', { name: /Análise de Gastos/i }).click();
        await expect(page.locator('#tab-analise')).toBeVisible();
        await expect(page).toHaveURL(/#\/extrato/);

        await page.getByRole('button', { name: 'Resumo Geral' }).click();
        await expect(page.locator('#tab-resumo')).toBeVisible();
        await expect(page).toHaveURL(/#\/dashboard/);
    });

    test('16. Safe-Area e espaçamento inferior do container garantem que conteúdo não fique coberto', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        // Verifica que o body possui padding-bottom aplicado para a barra fixa
        const bodyPaddingBottom = await page.evaluate(() => {
            const style = window.getComputedStyle(document.body);
            return parseFloat(style.paddingBottom) || 0;
        });

        expect(bodyPaddingBottom, 'Body deve ter padding-bottom >= 60px para acomodar bottom nav').toBeGreaterThanOrEqual(60);
    });

    test('17. Histórico de navegação do navegador (Back / Forward) sincroniza estado ativo da Bottom Nav', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        // Navega para Faturas
        await page.locator('#bnav-parcelas').click();
        await expect(page.locator('#bnav-parcelas')).toHaveClass(/active/);

        // Navega para Investimentos
        await page.locator('#bnav-investimentos').click();
        await expect(page.locator('#bnav-investimentos')).toHaveClass(/active/);

        // Volta (Back)
        await page.goBack();
        await expect(page).toHaveURL(/#\/(parcelas|faturas)/);
        await expect(page.locator('#bnav-parcelas')).toHaveClass(/active/);
        await expect(page.locator('#bnav-investimentos')).not.toHaveClass(/active/);

        // Avança (Forward)
        await page.goForward();
        await expect(page).toHaveURL(/#\/investimentos/);
        await expect(page.locator('#bnav-investimentos')).toHaveClass(/active/);
        await expect(page.locator('#bnav-parcelas')).not.toHaveClass(/active/);
    });

});
