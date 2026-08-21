// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');

test.describe('Metas e Limites de Gastos - Base 2.0 (Supabase & Migração Segura)', () => {

    test('1. Carregar metas diretamente da nuvem', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '🎯 Metas' }).click();
        await expect(page.locator('#tab-metas')).toHaveClass(/active/);

        const container = page.locator('#budgetsListContainer');
        // Metas do mock na nuvem: Alimentação (1.000,00), Saúde (300,00), Lazer (200,00)
        await expect(container).toContainText('Alimentação');
        await expect(container).toContainText('1.000,00');
        await expect(container).toContainText('Saúde');
        await expect(container).toContainText('300,00');
        await expect(container).toContainText('Lazer');
        await expect(container).toContainText('200,00');
    });

    test('2. Criar nova meta na nuvem', async ({ page }) => {
        const { getMetas } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '🎯 Metas' }).click();

        await page.locator('#b_target').fill('Transporte');
        await page.locator('#b_limit').fill('500.00');
        await page.getByRole('button', { name: 'Salvar Meta' }).click();

        const container = page.locator('#budgetsListContainer');
        await expect(container).toContainText('Transporte');
        await expect(container).toContainText('500,00');

        // Confirma no mock do Supabase
        const metas = getMetas();
        const transportMeta = metas.find(m => m.categoria === 'Transporte');
        expect(transportMeta).toBeDefined();
        expect(transportMeta.valor_limite).toBe(500);
    });

    test('3. Atualizar meta existente (Upsert)', async ({ page }) => {
        const { getMetas } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '🎯 Metas' }).click();

        // Atualiza Alimentação de 1.000,00 para 1.500,00
        await page.locator('#b_target').fill('Alimentação');
        await page.locator('#b_limit').fill('1500.00');
        await page.getByRole('button', { name: 'Salvar Meta' }).click();

        const container = page.locator('#budgetsListContainer');
        await expect(container).toContainText('1.500,00');

        const metas = getMetas();
        const alimMetas = metas.filter(m => m.categoria_normalizada === 'alimentação');
        expect(alimMetas.length).toBe(1);
        expect(alimMetas[0].valor_limite).toBe(1500);
    });

    test('4. "Alimentação" e " alimentação " não geram duplicidade na nuvem', async ({ page }) => {
        const { getMetas } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '🎯 Metas' }).click();

        // Cadastra com espaços e minúsculas
        await page.locator('#b_target').fill('  alimentação  ');
        await page.locator('#b_limit').fill('1200.00');
        await page.getByRole('button', { name: 'Salvar Meta' }).click();

        const container = page.locator('#budgetsListContainer');
        await expect(container).toContainText('1.200,00');

        const metas = getMetas();
        const alimMetas = metas.filter(m => m.categoria_normalizada === 'alimentação');
        expect(alimMetas.length).toBe(1);
        expect(alimMetas[0].valor_limite).toBe(1200);
    });

    test('5. Excluir meta com botão 🗑️', async ({ page }) => {
        const { getMetas } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '🎯 Metas' }).click();

        const container = page.locator('#budgetsListContainer');
        await expect(container).toContainText('Saúde');

        // Clica no botão de excluir da meta de Saúde
        const cardSaude = container.locator('div:has-text("Saúde")').first();
        await cardSaude.locator('.btn-delete-meta').click();

        // Confirma remoção na interface e na nuvem
        await expect(container).not.toContainText('Saúde');
        const metas = getMetas();
        expect(metas.some(m => m.categoria === 'Saúde')).toBe(false);
    });

    test('6. Cancelar diálogo de exclusão mantém a meta intacta', async ({ page }) => {
        const { getMetas } = await setupAuthenticatedApp(page, { autoAcceptDialogs: false });

        page.once('dialog', async dialog => {
            await dialog.dismiss();
        });

        await page.getByRole('button', { name: '🎯 Metas' }).click();

        const container = page.locator('#budgetsListContainer');
        const cardSaude = container.locator('div:has-text("Saúde")').first();
        await cardSaude.locator('.btn-delete-meta').click();

        await expect(container).toContainText('Saúde');
        const metas = getMetas();
        expect(metas.some(m => m.categoria === 'Saúde')).toBe(true);
    });

    test('7. Alerta de limite >= 80% (Aviso Amarelo)', async ({ page }) => {
        // Mock data: Alimentação tem R$ 510,00 gastos (450 pix + 60 dinheiro).
        // Se definirmos teto de R$ 600,00 -> 510 / 600 = 85% (>= 80% e < 100%)
        await setupAuthenticatedApp(page, {
            metas: [{
                id: 'meta-alim-85',
                user_id: 'test-user-uuid-1234',
                categoria: 'Alimentação',
                categoria_normalizada: 'alimentação',
                valor_limite: 600.00
            }]
        });

        const alertContainer = page.locator('#alertsContainer');
        await expect(alertContainer).toBeVisible();
        await expect(alertContainer).toContainText('Aviso de Limite: "Alimentação"');
        await expect(alertContainer).toContainText('85%');

        const alertBox = alertContainer.locator('.alert-mini-box');
        await expect(alertBox).not.toHaveClass(/alert-mini-danger/);
    });

    test('8. Alerta de limite >= 100% (Perigo Vermelho)', async ({ page }) => {
        // Mock data: Alimentação tem R$ 510,00 gastos.
        // Se definirmos teto de R$ 500,00 -> 510 / 500 = 102% (>= 100%)
        await setupAuthenticatedApp(page, {
            metas: [{
                id: 'meta-alim-over',
                user_id: 'test-user-uuid-1234',
                categoria: 'Alimentação',
                categoria_normalizada: 'alimentação',
                valor_limite: 500.00
            }]
        });

        const alertContainer = page.locator('#alertsContainer');
        await expect(alertContainer).toBeVisible();
        await expect(alertContainer).toContainText('Aviso de Limite: "Alimentação"');
        await expect(alertContainer).toContainText('102%');

        const alertBox = alertContainer.locator('.alert-mini-box');
        await expect(alertBox).toHaveClass(/alert-mini-danger/);
    });

    test('9. Migração: Nuvem vazia + Local com metas -> Importa para nuvem e remove localStorage', async ({ page }) => {
        const { getMetas } = await setupAuthenticatedApp(page, {
            metas: [], // Nuvem inicialmente vazia
            budgets: {
                'Supermercado': 800,
                'Combustível': 400
            }
        });

        await page.getByRole('button', { name: '🎯 Metas' }).click();

        const container = page.locator('#budgetsListContainer');
        await expect(container).toContainText('Supermercado');
        await expect(container).toContainText('800,00');
        await expect(container).toContainText('Combustível');
        await expect(container).toContainText('400,00');

        // Confirma que as metas foram importadas para a nuvem
        const metasNuvem = getMetas();
        expect(metasNuvem.length).toBe(2);

        // Confirma que localStorage 'userBudgets' foi limpo com segurança
        const localBudgets = await page.evaluate(() => localStorage.getItem('userBudgets'));
        expect(localBudgets).toBeNull();
    });

    test('10. Migração: Local e nuvem idênticos não duplicam dados', async ({ page }) => {
        const { getMetas } = await setupAuthenticatedApp(page, {
            metas: [{
                id: 'meta-001',
                user_id: 'test-user-uuid-1234',
                categoria: 'Alimentação',
                categoria_normalizada: 'alimentação',
                valor_limite: 1000.00
            }],
            budgets: {
                'Alimentação': 1000 // Idêntico à nuvem
            }
        });

        await page.getByRole('button', { name: '🎯 Metas' }).click();

        const metasNuvem = getMetas();
        expect(metasNuvem.length).toBe(1);

        const localBudgets = await page.evaluate(() => localStorage.getItem('userBudgets'));
        expect(localBudgets).toBeNull();
    });

    test('11. Migração: Meta que existe apenas localmente é importada para a nuvem existente', async ({ page }) => {
        const { getMetas } = await setupAuthenticatedApp(page, {
            metas: [{
                id: 'meta-001',
                user_id: 'test-user-uuid-1234',
                categoria: 'Alimentação',
                categoria_normalizada: 'alimentação',
                valor_limite: 1000.00
            }],
            budgets: {
                'Alimentação': 1000,
                'Educação': 600 // Apenas no local
            }
        });

        await page.getByRole('button', { name: '🎯 Metas' }).click();

        const container = page.locator('#budgetsListContainer');
        await expect(container).toContainText('Educação');
        await expect(container).toContainText('600,00');

        const metasNuvem = getMetas();
        expect(metasNuvem.length).toBe(2);
        expect(metasNuvem.some(m => m.categoria === 'Educação')).toBe(true);

        const localBudgets = await page.evaluate(() => localStorage.getItem('userBudgets'));
        expect(localBudgets).toBeNull();
    });

    test('12. Migração: Conflito de valores abre modal de resolução', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            metas: [{
                id: 'meta-001',
                user_id: 'test-user-uuid-1234',
                categoria: 'Alimentação',
                categoria_normalizada: 'alimentação',
                valor_limite: 1000.00 // Nuvem = 1.000
            }],
            budgets: {
                'Alimentação': 1500 // Local = 1.500 (Divergência!)
            }
        });

        // Modal deve abrir automaticamente indicando a divergência
        const modal = page.locator('#metasConflictModal');
        await expect(modal).toBeVisible();
        await expect(modal).toContainText('Alimentação');
        await expect(modal).toContainText('1.000,00');
        await expect(modal).toContainText('1.500,00');
    });

    test('13. Conflito: Escolher manter valor da nuvem', async ({ page }) => {
        const { getMetas } = await setupAuthenticatedApp(page, {
            metas: [{
                id: 'meta-001',
                user_id: 'test-user-uuid-1234',
                categoria: 'Alimentação',
                categoria_normalizada: 'alimentação',
                valor_limite: 1000.00
            }],
            budgets: {
                'Alimentação': 1500
            }
        });

        const modal = page.locator('#metasConflictModal');
        await expect(modal).toBeVisible();

        // O rádio 'cloud' (Manter Nuvem) já vem marcado por padrão
        await modal.getByRole('button', { name: 'Confirmar e Sincronizar' }).click();
        await expect(modal).toBeHidden();

        // Nuvem permanece com 1.000,00
        const metasNuvem = getMetas();
        expect(metasNuvem[0].valor_limite).toBe(1000);

        // LocalStorage resolvido e limpo
        const localBudgets = await page.evaluate(() => localStorage.getItem('userBudgets'));
        expect(localBudgets).toBeNull();
    });

    test('14. Conflito: Escolher usar valor do dispositivo local atualiza a nuvem', async ({ page }) => {
        const { getMetas } = await setupAuthenticatedApp(page, {
            metas: [{
                id: 'meta-001',
                user_id: 'test-user-uuid-1234',
                categoria: 'Alimentação',
                categoria_normalizada: 'alimentação',
                valor_limite: 1000.00
            }],
            budgets: {
                'Alimentação': 1500
            }
        });

        const modal = page.locator('#metasConflictModal');
        await expect(modal).toBeVisible();

        // Seleciona a opção do dispositivo local
        await modal.locator('input[value="local"]').check();
        await modal.getByRole('button', { name: 'Confirmar e Sincronizar' }).click();
        await expect(modal).toBeHidden();

        // Nuvem é atualizada com 1.500,00
        const metasNuvem = getMetas();
        expect(metasNuvem[0].valor_limite).toBe(1500);

        // LocalStorage limpo
        const localBudgets = await page.evaluate(() => localStorage.getItem('userBudgets'));
        expect(localBudgets).toBeNull();
    });

    test('15. Conflito: Cancelar resolução mantém localStorage intacto', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            metas: [{
                id: 'meta-001',
                user_id: 'test-user-uuid-1234',
                categoria: 'Alimentação',
                categoria_normalizada: 'alimentação',
                valor_limite: 1000.00
            }],
            budgets: {
                'Alimentação': 1500
            }
        });

        const modal = page.locator('#metasConflictModal');
        await expect(modal).toBeVisible();

        // Clica em 'Resolver Depois'
        await modal.getByRole('button', { name: 'Resolver Depois' }).click();
        await expect(modal).toBeHidden();

        // userBudgets deve continuar no localStorage
        const localBudgets = await page.evaluate(() => localStorage.getItem('userBudgets'));
        expect(localBudgets).not.toBeNull();
        expect(JSON.parse(localBudgets || '{}').Alimentação).toBe(1500);
    });

    test('16. Limpar localStorage não remove metas salvas na nuvem', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // Limpa explicitamente todo o localStorage (exceto auth token)
        await page.evaluate(() => {
            localStorage.removeItem('userBudgets');
        });

        // Recarrega a página
        await page.reload();
        await page.waitForSelector('#appView:not([style*="display: none"])');

        await page.getByRole('button', { name: '🎯 Metas' }).click();
        const container = page.locator('#budgetsListContainer');
        await expect(container).toContainText('Alimentação');
        await expect(container).toContainText('1.000,00');
    });

    test('17. Isolamento de usuário: metas de outro usuário não aparecem', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            metas: [
                {
                    id: 'meta-meu-user',
                    user_id: 'test-user-uuid-1234',
                    categoria: 'Alimentação',
                    categoria_normalizada: 'alimentação',
                    valor_limite: 1000.00
                },
                {
                    id: 'meta-outro-user',
                    user_id: 'outro-user-uuid-9999',
                    categoria: 'Viagens Exclusivas',
                    categoria_normalizada: 'viagens exclusivas',
                    valor_limite: 5000.00
                }
            ]
        });

        await page.getByRole('button', { name: '🎯 Metas' }).click();
        const container = page.locator('#budgetsListContainer');
        await expect(container).toContainText('Alimentação');
        await expect(container).not.toContainText('Viagens Exclusivas');
    });

});
