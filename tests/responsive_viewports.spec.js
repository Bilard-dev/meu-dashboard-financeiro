// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');
const {
    mockTransactions,
    mockCategorias,
    mockSubcategorias,
    mockCartoes
} = require('./fixtures/mockData');

/**
 * Matriz de Viewports Obrigatórios da Fase 4.0 — M4.0-A
 */
const REQUIRED_VIEWPORTS = [
    { name: 'Ultra Small (320x568 - iPhone SE 1st gen)', width: 320, height: 568 },
    { name: 'Mobile 360 (360x640 - Android Legacy)', width: 360, height: 640 },
    { name: 'Mobile 360 Modern (360x800 - Galaxy A)', width: 360, height: 800 },
    { name: 'Mobile 375 (375x667 - iPhone 8/SE2)', width: 375, height: 667 },
    { name: 'Mobile 390 (390x844 - iPhone 12/13/14)', width: 390, height: 844 },
    { name: 'Mobile 393 (393x873 - Pixel 7)', width: 393, height: 873 },
    { name: 'Mobile 412 (412x915 - Galaxy S20/S21)', width: 412, height: 915 },
    { name: 'Mobile 430 (430x932 - iPhone 14 Pro Max)', width: 430, height: 932 },
    { name: 'Tablet Portrait (768x1024 - iPad)', width: 768, height: 1024 },
    { name: 'Tablet Modern (820x1180 - iPad Air)', width: 820, height: 1180 },
    { name: 'Desktop HD (1366x768)', width: 1366, height: 768 },
    { name: 'Desktop FHD (1920x1080)', width: 1920, height: 1080 }
];

test.describe('Fase 4.0 — M4.0-A: Fundação Responsiva e Eliminação de Overflow', () => {

    test('1. Validação global de ausência de overflow horizontal em todas as 12 viewports obrigatórias', async ({ page }) => {
        for (const vp of REQUIRED_VIEWPORTS) {
            await page.setViewportSize({ width: vp.width, height: vp.height });

            await setupAuthenticatedApp(page, {
                transactions: mockTransactions,
                categorias: mockCategorias,
                subcategorias: mockSubcategorias,
                cartoes: mockCartoes
            });

            // Itera pelas rotas principais em cada viewport
            const primaryRoutes = ['#/dashboard', '#/analise', '#/faturas', '#/previsao', '#/investimentos', '#/configuracoes', '#/novo'];

            for (const route of primaryRoutes) {
                await page.goto(route);
                await page.waitForTimeout(100);

                const scrollState = await page.evaluate(() => {
                    const docEl = document.documentElement;
                    const body = document.body;
                    return {
                        docScrollWidth: docEl.scrollWidth,
                        docClientWidth: docEl.clientWidth,
                        bodyScrollWidth: body.scrollWidth,
                        bodyClientWidth: body.clientWidth,
                        docOverflow: docEl.scrollWidth > docEl.clientWidth + 1,
                        bodyOverflow: body.scrollWidth > body.clientWidth + 1
                    };
                });

                expect(
                    scrollState.docOverflow,
                    `Overflow horizontal no documento em ${vp.name} na rota ${route}: scrollWidth=${scrollState.docScrollWidth}px > clientWidth=${scrollState.docClientWidth}px`
                ).toBe(false);

                expect(
                    scrollState.bodyOverflow,
                    `Overflow horizontal no body em ${vp.name} na rota ${route}: bodyScrollWidth=${scrollState.bodyScrollWidth}px > bodyClientWidth=${scrollState.bodyClientWidth}px`
                ).toBe(false);
            }
        }
    });

    test('2. Tabelas largas de Extrato, Análise e Faturas são contidas em scroll isolado sem quebrar o layout', async ({ page }) => {
        // Testa no menor viewport mobile (320x568) e no mobile médio (390x844)
        for (const vp of [REQUIRED_VIEWPORTS[0], REQUIRED_VIEWPORTS[4]]) {
            await page.setViewportSize({ width: vp.width, height: vp.height });

            await setupAuthenticatedApp(page, {
                transactions: mockTransactions,
                categorias: mockCategorias,
                subcategorias: mockSubcategorias,
                cartoes: mockCartoes
            });

            // Aba Faturas
            await page.goto('#/faturas');
            const parcelasTable = page.locator('#parcelasTableBody');
            await expect(parcelasTable).toBeVisible();

            const isContained = await page.evaluate(() => {
                const table = document.querySelector('#tab-parcelas .data-table');
                if (!table) return false;
                const container = table.closest('.table-responsive');
                const docWidth = document.documentElement.clientWidth;
                const bodyWidth = document.body.clientWidth;
                return !!container && document.documentElement.scrollWidth <= docWidth + 1 && document.body.scrollWidth <= bodyWidth + 1;
            });

            expect(isContained, `Tabela de Faturas deve estar contida em .table-responsive em ${vp.name}`).toBe(true);

            // Aba Análise
            await page.goto('#/analise');
            const analiseTable = page.locator('#analiseTableBody');
            await expect(analiseTable).toBeVisible();

            const isAnaliseContained = await page.evaluate(() => {
                const table = document.querySelector('#tab-analise .data-table');
                if (!table) return false;
                const container = table.closest('.table-responsive');
                const docWidth = document.documentElement.clientWidth;
                return !!container && document.documentElement.scrollWidth <= docWidth + 1;
            });

            expect(isAnaliseContained, `Tabela de Análise deve estar contida em .table-responsive em ${vp.name}`).toBe(true);
        }
    });

    test('3. Modais essenciais permanecem responsivos e dentro da viewport no celular', async ({ page }) => {
        // Mobile 360x800
        await page.setViewportSize({ width: 360, height: 800 });

        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        // 3.1 Modal de Liquidação Antecipada (Fase 3.5)
        await page.goto('#/faturas');
        const settleBtn = page.locator('.settle-btn').first();
        if (await settleBtn.isVisible()) {
            await settleBtn.click();
            const modal = page.locator('#creditSettlementModal');
            await expect(modal).toBeVisible();

            const modalBox = await page.evaluate(() => {
                const card = document.querySelector('#creditSettlementModal .chart-card');
                if (!card) return null;
                const rect = card.getBoundingClientRect();
                return {
                    width: rect.width,
                    right: rect.right,
                    left: rect.left,
                    fitsViewportWidth: rect.right <= 360 && rect.left >= 0
                };
            });

            expect(modalBox?.fitsViewportWidth, 'Modal de Liquidação deve caber na largura da viewport 360px').toBe(true);

            // Fecha modal
            await page.locator('#creditSettlementModal button:has-text("Cancelar")').click();
            await expect(modal).toBeHidden();
        }

        // 3.2 Modal Lançador Rápido de Bolso
        await page.getByRole('button', { name: /Lançador Celular/i }).click();
        const quickModal = page.locator('#mobileQuickView');
        await expect(quickModal).toBeVisible();

        const quickBox = await page.evaluate(() => {
            const el = document.getElementById('mobileQuickView');
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return {
                right: rect.right,
                left: rect.left,
                fitsViewport: rect.right <= 360 + 1 && rect.left >= 0
            };
        });

        expect(quickBox?.fitsViewport, 'Lançador de Bolso deve estar dentro da tela de 360px').toBe(true);
        await page.locator('#mobileQuickView button:has-text("Fechar")').click();
        await expect(quickModal).toBeHidden();
    });

    test('4. Controles e navegação essenciais permanecem visíveis e operacionais em mobile e desktop', async ({ page }) => {
        // Mobile 390x844
        await page.setViewportSize({ width: 390, height: 844 });

        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        await page.goto('#/dashboard');

        // Controles de header essenciais em mobile
        await expect(page.locator('#syncBtn')).toBeVisible();
        await expect(page.locator('#privacyToggleBtn')).toBeVisible();
        await expect(page.locator('#monthSelector')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();

        // Bottom Navigation ativa em mobile
        const bottomNav = page.locator('#mobileBottomNav');
        await expect(bottomNav).toBeVisible();
        await expect(page.locator('#bnav-resumo')).toBeVisible();
        await expect(page.locator('#bnav-analise')).toBeVisible();
        await expect(page.locator('#bnav-fab')).toBeVisible();
        await expect(page.locator('#bnav-previsao')).toBeVisible();
        await expect(page.locator('#bnav-mais')).toBeVisible();

        // Abas tradicionais (.nav-tabs) ocultas em mobile
        const tabsContainer = page.locator('.nav-tabs');
        await expect(tabsContainer).toBeHidden();

        // Desktop 1366x768: Abas tradicionais visíveis e Bottom Nav oculta
        await page.setViewportSize({ width: 1366, height: 768 });
        await expect(tabsContainer).toBeVisible();
        await expect(page.locator('#tabNovoBtn')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Resumo Geral' })).toBeVisible();
        await expect(page.getByRole('button', { name: /Análise de Gastos/ })).toBeVisible();
        await expect(page.getByRole('button', { name: /Parcelas \/ Fatura Cartão/ })).toBeVisible();
        await expect(bottomNav).toBeHidden();
    });

    test('5. Preservação estrutural completa no Desktop (1366x768 e 1920x1080)', async ({ page }) => {
        for (const desktopVp of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
            await page.setViewportSize(desktopVp);

            await setupAuthenticatedApp(page, {
                transactions: mockTransactions,
                categorias: mockCategorias,
                subcategorias: mockSubcategorias,
                cartoes: mockCartoes
            });

            await page.goto('#/dashboard');

            // Verifica KPIs em grid multi-coluna
            const kpiGridCols = await page.evaluate(() => {
                const kpi = document.querySelector('.kpi-container');
                if (!kpi) return null;
                const style = window.getComputedStyle(kpi);
                return style.gridTemplateColumns.split(' ').length;
            });

            expect(kpiGridCols, `Desktop ${desktopVp.width}x${desktopVp.height} deve ter múltiplos cards de KPI lado a lado`).toBeGreaterThanOrEqual(3);

            // Verifica ausência de overflow global
            const scroll = await page.evaluate(() => ({
                overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
            }));
            expect(scroll.overflow, `Desktop ${desktopVp.width}x${desktopVp.height} não deve ter overflow`).toBe(false);
        }
    });

});
