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

        // Localiza a linha do "Jantar Casal" na tabela de compartilhados
        const rowJantar = page.locator('#sharedTableBody tr:has-text("Jantar Casal")');
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
        const rowJantar = page.locator('#sharedTableBody tr:has-text("Jantar Casal")');
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
        const rowJantar = page.locator('#sharedTableBody tr:has-text("Jantar Casal")');
        await rowJantar.getByRole('button', { name: '👤 Lançar Meu Valor' }).click();
        await expect(rowJantar.getByRole('button', { name: '✅ Já Lançado' })).toBeVisible();

        // 2. Vai ao extrato no Resumo Geral e exclui a transação recém-criada
        await page.getByRole('button', { name: 'Resumo Geral' }).click();
        const deleteBtn = page.locator('#resumoExtratoTableBody tr:has-text("Jantar Casal (Divisão)") button[title="Excluir"]').first();
        await deleteBtn.click();
        await expect(page.locator('#resumoExtratoTableBody')).not.toContainText('Jantar Casal (Divisão)');

        // 3. Retorna à aba de Gastos Compartilhados e confirma que o botão voltou a "👤 Lançar Meu Valor"
        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();
        const rowJantarReativado = page.locator('#sharedTableBody tr:has-text("Jantar Casal")');
        const btnLancarReativado = rowJantarReativado.getByRole('button', { name: '👤 Lançar Meu Valor' });
        await expect(btnLancarReativado).toBeVisible();
        await expect(btnLancarReativado).toBeEnabled();
    });

    test('7. [GASTOS COMPARTILHADOS 2.0] Gasto antigo sem vínculo continua funcionando normalmente', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();

        // A conta "Contas Casa - Luz" (shared-002) não possui vínculo prévio
        const rowLuz = page.locator('#sharedTableBody tr:has-text("Contas Casa - Luz")');
        const btnLuz = rowLuz.getByRole('button', { name: '👤 Lançar Meu Valor' });
        await expect(btnLuz).toBeVisible();
        await expect(btnLuz).toBeEnabled();
    });

    test('8. [EDIÇÃO 2.0] Edição completa de descrição e categoria em gasto NÃO lançado', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();

        // Clica no botão de editar da conta "Contas Casa - Luz" (não lançada)
        const rowLuz = page.locator('#sharedTableBody tr:has-text("Contas Casa - Luz")');
        await rowLuz.locator('button[title="Editar"]').click();

        // Confirma que os campos foram carregados no formulário
        await expect(page.locator('#sharedFormTitle')).toHaveText(/Editar Conta Compartilhada/i);
        await expect(page.locator('#btnSalvarShared')).toHaveText(/Atualizar Conta/i);
        await expect(page.locator('#btnCancelarEdicaoShared')).toBeVisible();
        await expect(page.locator('#s_descricao')).toHaveValue('Contas Casa - Luz');

        // Altera a descrição e categoria
        await page.locator('#s_descricao').fill('Contas Casa - Luz e Energia');
        await page.locator('#s_categoria').fill('Moradia');

        // Salva a alteração
        await page.locator('#btnSalvarShared').click();

        // Confirma atualização na tabela
        await expect(page.locator('#sharedTableBody')).toContainText('Contas Casa - Luz e Energia');
        await expect(page.locator('#sharedFormTitle')).toHaveText(/Lançar Conta Compartilhada/i);
    });

    test('9. [EDIÇÃO 2.0] Edição de valores e regra de divisão em gasto NÃO lançado', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();

        // Clica para editar "Contas Casa - Luz"
        const rowLuz = page.locator('#sharedTableBody tr:has-text("Contas Casa - Luz")');
        await rowLuz.locator('button[title="Editar"]').click();

        // Altera valor total para 300 e recalcula
        await page.locator('#s_valor_total').fill('300.00');
        await page.locator('#s_regra').selectOption('50_50');
        await page.locator('#s_regra').dispatchEvent('change');

        await expect(page.locator('#s_valor_meu')).toHaveValue('150.00');
        await expect(page.locator('#s_valor_parceiro')).toHaveValue('150.00');

        await page.locator('#btnSalvarShared').click();

        // Confirma novos valores na tabela
        await expect(page.locator('#sharedTableBody')).toContainText('300,00');
        await expect(page.locator('#sharedTableBody')).toContainText('150,00');
    });

    test('10. [EDIÇÃO 2.0] Cancelamento de edição restaura formulário para modo de criação', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();

        // Clica para editar
        const rowLuz = page.locator('#sharedTableBody tr:has-text("Contas Casa - Luz")');
        await rowLuz.locator('button[title="Editar"]').click();
        await expect(page.locator('#btnCancelarEdicaoShared')).toBeVisible();

        // Clica em Cancelar
        await page.locator('#btnCancelarEdicaoShared').click();

        // Confirma restauração
        await expect(page.locator('#sharedFormTitle')).toHaveText(/Lançar Conta Compartilhada/i);
        await expect(page.locator('#btnSalvarShared')).toHaveText(/Salvar Gastos Divididos/i);
        await expect(page.locator('#btnCancelarEdicaoShared')).toBeHidden();
        await expect(page.locator('#edit_shared_id')).toHaveValue('');
    });

    test('11. [EDIÇÃO 2.0] Gasto JÁ lançado bloqueia edição financeira e exibe mensagem explicativa', async ({ page, context }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();

        // 1. Lança a conta "Jantar Casal"
        const rowJantar = page.locator('#sharedTableBody tr:has-text("Jantar Casal")');
        await rowJantar.getByRole('button', { name: '👤 Lançar Meu Valor' }).click();
        await expect(rowJantar.getByRole('button', { name: '✅ Já Lançado' })).toBeVisible();

        // 2. Intercepta a mensagem do alert
        let dialogMessage = '';
        page.on('dialog', async dialog => {
            dialogMessage = dialog.message();
            try { await dialog.accept(); } catch(e) {}
        });

        // 3. Tenta clicar no botão de editar da conta lançada
        await rowJantar.locator('button[title="Editar"]').click();

        // Confirma que a mensagem explicativa foi exibida e o formulário NÃO entrou em edição
        expect(dialogMessage).toMatch(/exclua primeiro a transação vinculada/i);
        await expect(page.locator('#edit_shared_id')).toHaveValue('');
        await expect(page.locator('#btnCancelarEdicaoShared')).toBeHidden();
    });

    test('12. [EXCLUSÃO 2.0] Exclusão de gasto NÃO lançado remove o registro da tabela', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();
        await expect(page.locator('#sharedTableBody')).toContainText('Contas Casa - Luz');

        // Clica para excluir
        const rowLuz = page.locator('#sharedTableBody tr:has-text("Contas Casa - Luz")');
        await rowLuz.locator('button[title="Excluir"]').click();

        // Confirma que a linha foi removida da tabela
        await expect(page.locator('#sharedTableBody')).not.toContainText('Contas Casa - Luz');
    });

    test('13. [EXCLUSÃO 2.0] Cancelar o diálogo de exclusão mantém o registro intacto', async ({ page }) => {
        await setupAuthenticatedApp(page, { autoAcceptDialogs: false });

        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();
        await expect(page.locator('#sharedTableBody')).toContainText('Contas Casa - Luz');

        // Rejeita a exclusão no diálogo de confirmação
        page.once('dialog', async dialog => {
            await dialog.dismiss();
        });

        const rowLuz = page.locator('#sharedTableBody tr:has-text("Contas Casa - Luz")');
        await rowLuz.locator('button[title="Excluir"]').click();

        // Confirma que o registro continuou na listagem
        await expect(page.locator('#sharedTableBody')).toContainText('Contas Casa - Luz');
    });

    test('14. [EXCLUSÃO 2.0] Exclusão de gasto JÁ lançado remove a conta compartilhada e PRESERVA a transação no extrato', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // 1. Lança a conta "Jantar Casal"
        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();
        const rowJantar = page.locator('#sharedTableBody tr:has-text("Jantar Casal")');
        await rowJantar.getByRole('button', { name: '👤 Lançar Meu Valor' }).click();
        await expect(rowJantar.getByRole('button', { name: '✅ Já Lançado' })).toBeVisible();

        // 2. Exclui a conta compartilhada "Jantar Casal"
        await rowJantar.locator('button[title="Excluir"]').click();
        await expect(page.locator('#sharedTableBody')).not.toContainText('Jantar Casal');

        // 3. Acessa o Resumo Geral e confirma que a despesa pessoal CONTINUA no extrato
        await page.getByRole('button', { name: 'Resumo Geral' }).click();
        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Jantar Casal (Divisão)');

        // 4. Confirma no objeto de dados que gasto_compartilhado_id da transação passou a ser NULL
        const transacaoVinculo = await page.evaluate(() => {
            const tx = typeof globalData !== 'undefined' ? globalData.find(d => d.desc.includes('Jantar Casal')) : null;
            return tx ? tx.gasto_compartilhado_id : 'NOT_FOUND';
        });
        expect(transacaoVinculo).toBeNull();
    });

    test('15. [STATUS 2.0] Alternância de status PENDENTE/PAGO não afeta o estado do botão de lançamento', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚖️ Gastos Compartilhados' }).click();

        const rowLuz = page.locator('#sharedTableBody tr:has-text("Contas Casa - Luz")');
        const statusBtn = rowLuz.locator('.action-btn');
        await expect(statusBtn).toContainText('Pendente');

        // Alterna para Pago
        await statusBtn.click();
        await expect(statusBtn).toContainText('Pago');

        // Confirma que o botão de lançamento continua sendo "👤 Lançar Meu Valor"
        await expect(rowLuz.getByRole('button', { name: '👤 Lançar Meu Valor' })).toBeVisible();
    });

});
