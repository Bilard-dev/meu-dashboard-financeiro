// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');

test.describe('Transações - CRUD e Fluxo Real', () => {

    test('1. Cadastro de nova transação à vista (PIX)', async ({ page }) => {
        const state = await setupAuthenticatedApp(page);

        // Navega para aba Novo Registro
        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await expect(page.locator('#tab-novo')).toHaveClass(/active/);

        // Preenche o formulário
        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_data').fill('2026-08-18');
        await page.locator('#i_descricao').fill('Livro de Finanças');
        await page.locator('#i_valor').fill('79.90');
        await page.locator('#i_pagamento').selectOption('PIX');
        await page.locator('#i_categoria').selectOption('Alimentação');
        await page.locator('#i_custo').selectOption('Variável');

        // Submete o formulário
        await page.locator('#btnSalvar').click();

        // O sistema deve redirecionar para o Resumo e a transação deve estar no extrato
        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Livro de Finanças');
    });

    test('2. Cadastro de compra parcelada no Cartão de Crédito', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();

        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_data').fill('2026-08-18');
        await page.locator('#i_descricao').fill('Smartphone Parcelado');
        await page.locator('#i_valor').fill('250.00');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_cartao').selectOption('Nubank');
        await page.locator('#i_parcela_select').selectOption('CUSTOM');
        await page.locator('#i_parcela_custom').fill('1/10');
        await page.locator('#i_categoria').selectOption('Trabalho');

        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Smartphone Parcelado');
    });

    test('3. Edição de transação pelo fluxo real de interface', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // Localiza a linha do Supermercado Mensal e clica no botão de edição
        const editBtn = page.locator('tr:has-text("Supermercado Mensal") button[title="Editar"]').first();
        await editBtn.click();

        // Verifica se a aba mudou para Novo/Editar e o título mudou
        await expect(page.locator('#tab-novo')).toHaveClass(/active/);
        await expect(page.locator('#formTitle')).toHaveText(/Editar Transação/i);
        await expect(page.locator('#i_descricao')).toHaveValue('Supermercado Mensal');

        // Altera o valor e a descrição
        await page.locator('#i_descricao').fill('Supermercado Mensal Editado');
        await page.locator('#i_valor').fill('500.00');

        // Salva a alteração
        await page.locator('#btnSalvar').click();

        // Confirma atualização na tabela
        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Supermercado Mensal Editado');
    });

    test('4. Exclusão de transação pelo fluxo real', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Farmácia Remédios');

        // Clica no botão de exclusão
        const deleteBtn = page.locator('tr:has-text("Farmácia Remédios") button[title="Excluir"]').first();
        await deleteBtn.click();

        // Verifica que o item foi removido da listagem
        await expect(page.locator('#resumoExtratoTableBody')).not.toContainText('Farmácia Remédios');
    });

    test('5. [TESTE DE REGRESSÃO] Edição de transação com fatura antiga fora da faixa (2024-5)', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // Localiza e clica para editar a transação que possui fatura 2024-5
        const editBtn = page.locator('tr:has-text("Compra Antiga com Fatura 2024") button[title="Editar"]').first();
        await editBtn.click();

        await expect(page.locator('#tab-novo')).toHaveClass(/active/);

        const selectFatura = page.locator('#i_fatura_destino');
        // Confirma que a opção antiga foi criada dinamicamente no DOM
        const optAntiga = selectFatura.locator('option[value="2024-5"]');
        await expect(optAntiga).toBeAttached();
        await expect(optAntiga).toHaveText(/Junho\/2024/);

        // Confirma que o valor selecionado permaneceu 2024-5 e NÃO virou ATUAL ou vazio
        await expect(selectFatura).toHaveValue('2024-5');
    });

    test('6. Cálculo correto do Saldo em Dinheiro Físico (Espécie)', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // No mock: Saque R$ 200,00 - Gasto em Dinheiro R$ 60,00 = Saldo R$ 140,00
        const saldoEspecieText = await page.locator('#kpi-dinheiro-vivo').textContent();
        expect(saldoEspecieText).toMatch(/140,00/);
    });

});
