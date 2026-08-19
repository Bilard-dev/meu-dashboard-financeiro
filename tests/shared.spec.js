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

    test('4. [GASTOS COMPARTILHADOS 2.0] Lançamento de valor pessoal cria transação vinculada e muda botão para Já Lançado', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();
        await expect(page.locator('#tab-divisao')).toHaveClass(/active/);

        // Localiza a linha do "Jantar Casal" (shared-001)
        const rowJantar = page.locator('tr:has-text("Jantar Casal")');
        const btnLancar = rowJantar.getByRole('button', { name: '👤 Lançar Meu Valor' });
        await expect(btnLancar).toBeVisible();
        await expect(btnLancar).toBeEnabled();

        // Clica para lançar o valor pessoal no extrato
        await btnLancar.click();

        // Confirma que o botão mudou de estado para "✅ Já Lançado" e está desabilitado
        const btnJaLancado = rowJantar.getByRole('button', { name: '✅ Já Lançado' });
        await expect(btnJaLancado).toBeVisible();
        await expect(btnJaLancado).toBeDisabled();

        // Vai para a aba Resumo Geral e confirma que a transação foi criada com sucesso no extrato
        await page.getByRole('button', { name: 'Resumo Geral' }).click();
        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Jantar Casal (Divisão)');
    });

    test('5. [GASTOS COMPARTILHADOS 2.0] Prevenção de duplicidade: botão permanece desabilitado e não cria segunda transação', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();

        // Lança o valor do Jantar Casal
        const rowJantar = page.locator('tr:has-text("Jantar Casal")');
        await rowJantar.getByRole('button', { name: '👤 Lançar Meu Valor' }).click();

        // O botão agora está desabilitado como "✅ Já Lançado"
        const btnJaLancado = rowJantar.getByRole('button', { name: '✅ Já Lançado' });
        await expect(btnJaLancado).toBeDisabled();

        // Confirma no extrato que há exatamente 1 ocorrência
        await page.getByRole('button', { name: 'Resumo Geral' }).click();
        const rows = page.locator('#resumoExtratoTableBody tr:has-text("Jantar Casal (Divisão)")');
        await expect(rows).toHaveCount(1);
    });

    test('6. [GASTOS COMPARTILHADOS 2.0] Exclusão da transação vinculada no extrato reativa automaticamente o botão de lançamento', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // 1. Lança a conta compartilhada
        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();
        const rowJantar = page.locator('tr:has-text("Jantar Casal")');
        await rowJantar.getByRole('button', { name: '👤 Lançar Meu Valor' }).click();
        await expect(rowJantar.getByRole('button', { name: '✅ Já Lançado' })).toBeVisible();

        // 2. Vai ao extrato no Resumo Geral e exclui a transação recém-criada
        await page.getByRole('button', { name: 'Resumo Geral' }).click();
        const deleteBtn = page.locator('tr:has-text("Jantar Casal (Divisão)") button[title="Excluir"]').first();
        await deleteBtn.click();
        await expect(page.locator('#resumoExtratoTableBody')).not.toContainText('Jantar Casal (Divisão)');

        // 3. Retorna à aba de Gastos Compartilhados e confirma que o botão voltou a "👤 Lançar Meu Valor"
        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();
        const rowJantarReativado = page.locator('tr:has-text("Jantar Casal")');
        const btnLancarReativado = rowJantarReativado.getByRole('button', { name: '👤 Lançar Meu Valor' });
        await expect(btnLancarReativado).toBeVisible();
        await expect(btnLancarReativado).toBeEnabled();
    });

    test('7. [GASTOS COMPARTILHADOS 2.0] Gasto antigo sem vínculo continua funcionando normalmente', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();

        // A conta "Contas Casa - Luz" (shared-002) não possui vínculo prévio
        const rowLuz = page.locator('tr:has-text("Contas Casa - Luz")');
        const btnLuz = rowLuz.getByRole('button', { name: '👤 Lançar Meu Valor' });
        await expect(btnLuz).toBeVisible();
        await expect(btnLuz).toBeEnabled();
    });

});
