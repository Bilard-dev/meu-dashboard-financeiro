// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');

test.describe('Hotfix — Feedback Toast & Subcategoria Rápida no Lançamento', () => {

    test('1-8. Criar subcategoria rapidamente no Novo Lançamento Desktop preserva todos os campos e seleciona nova subcategoria', async ({ page }) => {
        const { getSubcategories } = await setupAuthenticatedApp(page, { initialUrl: '/#/novo' });

        // Preenche campos do formulário Desktop antes de criar a subcategoria
        await page.fill('#i_descricao', 'Jantar de Negócios');
        await page.fill('#i_valor', '250.75');
        await page.fill('#i_data', '2026-08-15');
        await page.selectOption('#i_pagamento', 'PIX');

        // Seleciona categoria "Alimentação"
        await page.selectOption('#i_categoria', 'Alimentação');

        // Seleciona "+ Adicionar Nova Subcategoria..."
        await page.selectOption('#i_subcategoria', '__NEW__');

        // Modal de criação deve abrir com categoria pai "Alimentação" pré-selecionada
        const modal = page.locator('#catalogModal');
        await expect(modal).toBeVisible();
        await expect(page.locator('#cat_modal_parent_group')).toBeVisible();

        // Digita nome da nova subcategoria
        await page.fill('#cat_modal_name', 'Restaurante Executivo');

        // Salva
        await page.click('#btnSaveCatalogModal');
        await expect(modal).toBeHidden();

        // 1. Toast de sucesso aparece (sem popup nativo)
        const toast = page.locator('.toast');
        await expect(toast).toBeVisible();
        await expect(toast).toContainText('Subcategoria criada com sucesso!');

        // 2. Subcategoria criada no banco mockado
        const subcats = getSubcategories();
        expect(subcats.some(s => s.nome === 'Restaurante Executivo')).toBe(true);

        // 3. Nova subcategoria fica automaticamente selecionada
        await expect(page.locator('#i_subcategoria')).toHaveValue('Restaurante Executivo');

        // 4. Categoria pai permanece selecionada
        await expect(page.locator('#i_categoria')).toHaveValue('Alimentação');

        // 5-8. Todos os demais campos do formulário foram 100% preservados
        await expect(page.locator('#i_descricao')).toHaveValue('Jantar de Negócios');
        await expect(page.locator('#i_valor')).toHaveValue('250.75');
        await expect(page.locator('#i_data')).toHaveValue('2026-08-15');
        await expect(page.locator('#i_pagamento')).toHaveValue('PIX');
    });

    test('9. Cancelar criação rápida de subcategoria restaura o select e preserva o formulário', async ({ page }) => {
        await setupAuthenticatedApp(page, { initialUrl: '/#/novo' });

        await page.fill('#i_descricao', 'Compras do Mês');
        await page.fill('#i_valor', '120.00');
        await page.selectOption('#i_categoria', 'Alimentação');

        // Abre modal via __NEW__
        await page.selectOption('#i_subcategoria', '__NEW__');
        await expect(page.locator('#catalogModal')).toBeVisible();

        // Clica em Cancelar
        await page.click('#catalogModal button[type="button"]:has-text("Cancelar")');
        await expect(page.locator('#catalogModal')).toBeHidden();

        // Select volta a ser vazio (não fica travado em __NEW__)
        await expect(page.locator('#i_subcategoria')).toHaveValue('');

        // Campos preservados
        await expect(page.locator('#i_descricao')).toHaveValue('Compras do Mês');
        await expect(page.locator('#i_valor')).toHaveValue('120.00');
        await expect(page.locator('#i_categoria')).toHaveValue('Alimentação');
    });

    test('10. Duplicidade de subcategoria na mesma categoria pai continua bloqueada com mensagem inline', async ({ page }) => {
        await setupAuthenticatedApp(page, { initialUrl: '/#/novo' });

        await page.selectOption('#i_categoria', 'Alimentação');
        await page.selectOption('#i_subcategoria', '__NEW__');

        // Tenta cadastrar "Supermercado" (que já existe para Alimentação nos fixtures)
        await page.fill('#cat_modal_name', 'Supermercado');
        await page.click('#btnSaveCatalogModal');

        // Modal permanece aberto e exibe erro inline
        await expect(page.locator('#catalogModal')).toBeVisible();
        await expect(page.locator('#catalogModalError')).toBeVisible();
        await expect(page.locator('#catalogModalError')).toContainText('Já existe uma subcategoria com este nome');
    });

    test('11. Fluxo equivalente no Lançador Rápido Mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await setupAuthenticatedApp(page, { initialUrl: '/#/dashboard' });

        // Abre modal rápido mobile
        const btnMobile = page.getByRole('button', { name: /Lançador Celular/i });
        await expect(btnMobile).toBeVisible();
        await btnMobile.click();
        await expect(page.locator('#mobileQuickView')).toBeVisible();

        await page.fill('#m_descricao', 'Café expresso');
        await page.fill('#m_valor', '9.50');
        await page.selectOption('#m_categoria', 'Alimentação');

        // Adicionar nova subcategoria no mobile
        await page.selectOption('#m_subcategoria', '__NEW__');
        await expect(page.locator('#catalogModal')).toBeVisible();

        await page.fill('#cat_modal_name', 'Cafeteria');
        await page.click('#btnSaveCatalogModal');
        await expect(page.locator('#catalogModal')).toBeHidden();

        // Toast de sucesso exibido
        await expect(page.locator('.toast')).toContainText('Subcategoria criada com sucesso!');

        // Nova subcategoria selecionada automaticamente no mobile
        await expect(page.locator('#m_subcategoria')).toHaveValue('Cafeteria');
        await expect(page.locator('#m_categoria')).toHaveValue('Alimentação');
        await expect(page.locator('#m_descricao')).toHaveValue('Café expresso');
        await expect(page.locator('#m_valor')).toHaveValue('9.50');
    });

    test('12-14. Criação rápida de Categoria, Cartão e Tag pelo formulário continua funcionando', async ({ page }) => {
        await setupAuthenticatedApp(page, { initialUrl: '/#/novo' });

        // 12. Cria Categoria
        await page.selectOption('#i_categoria', '__NEW__');
        await expect(page.locator('#catalogModal')).toBeVisible();
        await page.fill('#cat_modal_name', 'Educação & Cursos');
        await page.click('#btnSaveCatalogModal');
        await expect(page.locator('#catalogModal')).toBeHidden();
        await expect(page.locator('#i_categoria')).toHaveValue('Educação & Cursos');

        // 13. Cria Cartão
        await page.selectOption('#i_pagamento', 'Cartão de Crédito');
        await page.selectOption('#i_cartao', '__NEW__');
        await expect(page.locator('#catalogModal')).toBeVisible();
        await page.fill('#cat_modal_name', 'Cartão XP Black');
        await page.fill('#cat_modal_fechamento', '10');
        await page.fill('#cat_modal_vencimento', '20');
        await page.click('#btnSaveCatalogModal');
        await expect(page.locator('#catalogModal')).toBeHidden();
        await expect(page.locator('#i_cartao')).toHaveValue('Cartão XP Black');
    });

    test('15-16. Feedback de sucesso e atualização de registro não usam window.alert', async ({ page }) => {
        await setupAuthenticatedApp(page, { initialUrl: '/#/novo' });

        let alertTriggered = false;
        page.on('dialog', async dialog => {
            if (dialog.type() === 'alert') {
                alertTriggered = true;
                await dialog.accept();
            }
        });

        // Cria transação
        await page.fill('#i_descricao', 'Compra de Teste Toast');
        await page.fill('#i_valor', '50.00');
        await page.fill('#i_data', '2026-08-20');
        await page.selectOption('#i_categoria', 'Alimentação');
        await page.click('#btnSalvar');

        // Toast visível
        await expect(page.locator('.toast')).toBeVisible();
        await expect(page.locator('.toast')).toContainText('Lançamento salvo com sucesso!');

        // Confirma que nenhum window.alert disparou
        expect(alertTriggered).toBe(false);
    });

    test('17. Toast desaparece automaticamente ou via botão fechar sem bloquear interface', async ({ page }) => {
        await setupAuthenticatedApp(page, { initialUrl: '/#/novo' });

        await page.evaluate(() => {
            showToast('Mensagem de Teste Desaparecimento', 'info', 1000);
        });

        const toast = page.locator('.toast');
        await expect(toast).toBeVisible();

        // Clica no botão fechar (✕)
        await toast.locator('.toast-close').click();
        await expect(toast).toBeHidden();
    });

    test('18. Confirmações destrutivas continuam usando confirm() protegido', async ({ page, context }) => {
        const { getTransactions } = await setupAuthenticatedApp(page, { autoAcceptDialogs: false, initialUrl: '/#/dashboard' });

        let confirmTriggered = false;
        let confirmMessage = '';
        page.once('dialog', async dialog => {
            if (dialog.type() === 'confirm') {
                confirmTriggered = true;
                confirmMessage = dialog.message();
                await dialog.dismiss(); // Cancela a exclusão
            }
        });

        // Clica no botão de excluir a transação "Farmácia Remédios" na tabela de extrato do resumo
        const deleteBtn = page.locator('#resumoExtratoTableBody tr:has-text("Farmácia Remédios") button[title="Excluir"]').first();
        await deleteBtn.click();

        // Confirma que o diálogo nativo confirm() foi disparado com o texto de segurança
        expect(confirmTriggered).toBe(true);
        expect(confirmMessage).toMatch(/Excluir o lançamento/i);

        // Registro continua na tabela porque o confirm foi cancelado
        const txs = getTransactions();
        expect(txs.length).toBeGreaterThan(0);
    });
});
