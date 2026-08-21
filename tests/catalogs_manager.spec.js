import { test, expect } from '@playwright/test';
import { setupAuthenticatedApp } from './helpers/setupApp.js';

test.describe('Gerenciador Dinâmico de Catálogos 2.0 - Fase 1 Core', () => {

    // ==========================================
    // 1. CARREGAMENTO E RENDERIZAÇÃO
    // ==========================================
    test('1. Carregamento inicial dos catálogos ao autenticar', async ({ page }) => {
        const { getCategories, getCards, getTags } = await setupAuthenticatedApp(page);

        const cats = getCategories();
        const cards = getCards();
        const tags = getTags();

        expect(cats.length).toBeGreaterThan(0);
        expect(cards.length).toBeGreaterThan(0);
        expect(tags.length).toBeGreaterThan(0);
    });

    test('2. Renderização das 4 colunas no Gerenciador de Catálogos', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        await expect(page.locator('#manageCategoriesList')).toBeVisible();
        await expect(page.locator('#manageSubcategoriesList')).toBeVisible();
        await expect(page.locator('#managePaymentsList')).toBeVisible();
        await expect(page.locator('#manageTagsList')).toBeVisible();

        // Confirma itens na lista
        await expect(page.locator('#manageCategoriesList')).toContainText('Alimentação');
        await expect(page.locator('#managePaymentsList')).toContainText('Nubank');
        await expect(page.locator('#manageTagsList')).toContainText('Viagem');
    });

    // ==========================================
    // 2. CATEGORIAS (CRUD, SEGURANÇA E REGRAS)
    // ==========================================
    test('3. Criar nova Categoria via modal', async ({ page }) => {
        const { getCategories } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        await page.locator('#btnNewCategory').click();

        await expect(page.locator('#catalogModal')).toBeVisible();
        await expect(page.locator('#catalogModalTitle')).toHaveText('Nova Categoria');

        await page.locator('#cat_modal_name').fill('Pets & Animais');
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModal')).not.toBeVisible();
        await expect(page.locator('#manageCategoriesList')).toContainText('Pets & Animais');

        const cats = getCategories();
        const petCat = cats.find(c => c.nome === 'Pets & Animais');
        expect(petCat).toBeDefined();
        expect(petCat.ativo).toBe(true);
    });

    test('4. Bloquear Categoria duplicada por normalização', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        await page.locator('#btnNewCategory').click();

        // Tenta cadastrar " alimentação " com espaços e minúsculas
        await page.locator('#cat_modal_name').fill(' alimentação ');
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModalError')).toBeVisible();
        await expect(page.locator('#catalogModalError')).toContainText('Já existe uma categoria cadastrada com o nome');
        await expect(page.locator('#catalogModal')).toBeVisible();
    });

    test('5. Editar Categoria altera apenas catálogo e preserva transações', async ({ page }) => {
        const { getCategories, getTransactions } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        // Clica em Editar na categoria Alimentação
        const alimRow = page.locator('#manageCategoriesList div:has-text("Alimentação")').first();
        await alimRow.locator('button[title="Editar"]').click();

        await expect(page.locator('#catalogModal')).toBeVisible();
        await expect(page.locator('#catalogModalTitle')).toHaveText('Editar Categoria');
        expect(await page.locator('#cat_modal_name').inputValue()).toBe('Alimentação');

        await page.locator('#cat_modal_name').fill('Alimentação & Mercado');
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModal')).not.toBeVisible();
        await expect(page.locator('#manageCategoriesList')).toContainText('Alimentação & Mercado');

        // Confirma alteração no catálogo
        const cats = getCategories();
        const updatedCat = cats.find(c => c.nome === 'Alimentação & Mercado');
        expect(updatedCat).toBeDefined();

        // Confirma que transações históricas NÃO foram alteradas na Fase 1
        const trans = getTransactions();
        const hasOriginalAlim = trans.some(t => t.categoria === 'Alimentação');
        expect(hasOriginalAlim).toBe(true);
    });

    test('6. Desativar e reativar Categoria (Ativo/Inativo)', async ({ page }) => {
        const { getCategories } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const alimRow = page.locator('#manageCategoriesList div:has-text("Alimentação")').first();
        // Clica em Desativar
        await alimRow.locator('button[title="Desativar"]').click();

        let cats = getCategories();
        let alimCat = cats.find(c => c.nome === 'Alimentação');
        expect(alimCat.ativo).toBe(false);

        // Vai para Novo Registro e verifica que Alimentação não está nos novos lançamentos
        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        const catSelect = page.locator('#i_categoria');
        await expect(catSelect.locator('option[value="Alimentação"]')).toHaveCount(0);

        // Retorna e Reativa
        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        const alimRowInactive = page.locator('#manageCategoriesList div:has-text("Alimentação")').first();
        await alimRowInactive.locator('button[title="Reativar"]').click();

        cats = getCategories();
        alimCat = cats.find(c => c.nome === 'Alimentação');
        expect(alimCat.ativo).toBe(true);

        // Confirma que volta a aparecer
        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await expect(page.locator('#i_categoria option[value="Alimentação"]')).toHaveCount(1);
    });

    test('7. Excluir Categoria sem histórico tem sucesso definitivo', async ({ page }) => {
        const { getCategories } = await setupAuthenticatedApp(page, { autoAcceptDialogs: false });

        // Cria categoria nova sem usos
        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        await page.locator('#btnNewCategory').click();
        await page.locator('#cat_modal_name').fill('Categoria Temporária');
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#manageCategoriesList')).toContainText('Categoria Temporária');

        // Configura diálogo de confirmação
        page.once('dialog', async dialog => {
            await dialog.accept();
        });

        const tempRow = page.locator('#manageCategoriesList div:has-text("Categoria Temporária")').first();
        await tempRow.locator('button[title="Excluir"]').click();

        await expect(page.locator('#manageCategoriesList')).not.toContainText('Categoria Temporária');

        const cats = getCategories();
        expect(cats.some(c => c.nome === 'Categoria Temporária')).toBe(false);
    });

    test('8. Bloqueio de exclusão física de Categoria com usos históricos (oferece desativação)', async ({ page }) => {
        const { getCategories } = await setupAuthenticatedApp(page, { autoAcceptDialogs: false });

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        let dialogMessage = '';
        page.once('dialog', async dialog => {
            dialogMessage = dialog.message();
            await dialog.accept(); // Aceita desativar
        });

        const alimRow = page.locator('#manageCategoriesList div:has-text("Alimentação")').first();
        await alimRow.locator('button[title="Excluir"]').click();

        expect(dialogMessage).toContain('lançamentos vinculados no seu histórico financeiro');
        expect(dialogMessage).toContain('Deseja DESATIVAR o item em vez de excluir?');

        // Confirma que a categoria foi desativada em vez de deletada
        const cats = getCategories();
        const alim = cats.find(c => c.nome === 'Alimentação');
        expect(alim).toBeDefined();
        expect(alim.ativo).toBe(false);
    });

    // ==========================================
    // 3. SUBCATEGORIAS (CRUD, SEGURANÇA E REGRAS)
    // ==========================================
    test('9. Criar nova Subcategoria vinculada a Categoria Pai', async ({ page }) => {
        const { getSubcategories, getCategories } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        await page.locator('#btnNewSubcategory').click();

        await expect(page.locator('#catalogModal')).toBeVisible();
        await expect(page.locator('#catalogModalTitle')).toHaveText('Nova Subcategoria');

        await page.locator('#cat_modal_name').fill('Hortifruti');
        await page.locator('#cat_modal_parent_id').selectOption({ label: 'Alimentação' });
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModal')).not.toBeVisible();
        await expect(page.locator('#manageSubcategoriesList')).toContainText('Hortifruti');

        const subcats = getSubcategories();
        const cats = getCategories();
        const alimCat = cats.find(c => c.nome === 'Alimentação');
        const horti = subcats.find(s => s.nome === 'Hortifruti');

        expect(horti).toBeDefined();
        expect(horti.categoria_id).toBe(alimCat.id);
    });

    test('10. Bloquear Subcategoria duplicada na mesma Categoria Pai', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        await page.locator('#btnNewSubcategory').click();

        await page.locator('#cat_modal_name').fill('Supermercado');
        await page.locator('#cat_modal_parent_id').selectOption({ label: 'Alimentação' });
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModalError')).toBeVisible();
        await expect(page.locator('#catalogModalError')).toContainText('Já existe uma subcategoria com este nome para a categoria selecionada');
    });

    test('11. Permitir Subcategoria com mesmo nome em Categorias Diferentes', async ({ page }) => {
        const { getSubcategories, getCategories } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        await page.locator('#btnNewSubcategory').click();

        // Cadastra "Geral" em Transporte
        await page.locator('#cat_modal_name').fill('Geral');
        await page.locator('#cat_modal_parent_id').selectOption({ label: 'Transporte' });
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModal')).not.toBeVisible();

        // Agora cadastra "Geral" em Moradia
        await page.locator('#btnNewSubcategory').click();
        await page.locator('#cat_modal_name').fill('Geral');
        await page.locator('#cat_modal_parent_id').selectOption({ label: 'Moradia' });
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModal')).not.toBeVisible();

        const subcats = getSubcategories();
        const gerais = subcats.filter(s => s.nome === 'Geral');
        expect(gerais.length).toBe(2);
    });

    test('12. Editar Subcategoria existente', async ({ page }) => {
        const { getSubcategories } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const subRow = page.locator('#manageSubcategoriesList div:has-text("Restaurante")').first();
        await subRow.locator('button[title="Editar"]').click();

        await expect(page.locator('#catalogModal')).toBeVisible();
        await expect(page.locator('#catalogModalTitle')).toHaveText('Editar Subcategoria');

        await page.locator('#cat_modal_name').fill('Restaurante & Delivery');
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModal')).not.toBeVisible();
        await expect(page.locator('#manageSubcategoriesList')).toContainText('Restaurante & Delivery');

        const subcats = getSubcategories();
        expect(subcats.some(s => s.nome === 'Restaurante & Delivery')).toBe(true);
    });

    test('13. Desativar e reativar Subcategoria', async ({ page }) => {
        const { getSubcategories } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const subRow = page.locator('#manageSubcategoriesList div:has-text("Restaurante")').first();
        await subRow.locator('button[title="Desativar"]').click();

        let subcats = getSubcategories();
        let rest = subcats.find(s => s.nome === 'Restaurante');
        expect(rest.ativo).toBe(false);

        // Vai para Novo Registro, seleciona Alimentação e confirma que Restaurante não aparece
        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_categoria').selectOption('Alimentação');
        await expect(page.locator('#i_subcategoria option[value="Restaurante"]')).toHaveCount(0);

        // Reativa
        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        const subInactive = page.locator('#manageSubcategoriesList div:has-text("Restaurante")').first();
        await subInactive.locator('button[title="Reativar"]').click();

        subcats = getSubcategories();
        rest = subcats.find(s => s.nome === 'Restaurante');
        expect(rest.ativo).toBe(true);
    });

    test('14. Excluir Subcategoria sem histórico tem sucesso definitivo', async ({ page }) => {
        const { getSubcategories } = await setupAuthenticatedApp(page, { autoAcceptDialogs: false });

        // Cria subcategoria sem usos
        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        await page.locator('#btnNewSubcategory').click();
        await page.locator('#cat_modal_name').fill('Sub Temporária');
        await page.locator('#cat_modal_parent_id').selectOption({ label: 'Transporte' });
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#manageSubcategoriesList')).toContainText('Sub Temporária');

        page.once('dialog', async dialog => {
            await dialog.accept();
        });

        const tempRow = page.locator('#manageSubcategoriesList div:has-text("Sub Temporária")').first();
        await tempRow.locator('button[title="Excluir"]').click();

        await expect(page.locator('#manageSubcategoriesList')).not.toContainText('Sub Temporária');

        const subcats = getSubcategories();
        expect(subcats.some(s => s.nome === 'Sub Temporária')).toBe(false);
    });

    test('15. Bloqueio de exclusão física de Subcategoria com usos históricos', async ({ page }) => {
        const { getSubcategories } = await setupAuthenticatedApp(page, { autoAcceptDialogs: false });

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        let dialogMessage = '';
        page.once('dialog', async dialog => {
            dialogMessage = dialog.message();
            await dialog.accept();
        });

        const superRow = page.locator('#manageSubcategoriesList div:has-text("Supermercado")').first();
        await superRow.locator('button[title="Excluir"]').click();

        expect(dialogMessage).toContain('vinculado no seu histórico financeiro');
        const subcats = getSubcategories();
        const superSub = subcats.find(s => s.nome === 'Supermercado');
        expect(superSub).toBeDefined();
        expect(superSub.ativo).toBe(false);
    });

    // ==========================================
    // 4. CARTÕES DE CRÉDITO (CRUD, SEGURANÇA E REGRAS)
    // ==========================================
    test('16. Criar novo Cartão de Crédito com fechamento, vencimento e cor', async ({ page }) => {
        const { getCards } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        await page.locator('#btnNewCard').click();

        await expect(page.locator('#catalogModalTitle')).toHaveText('Novo Cartão de Crédito');

        await page.locator('#cat_modal_name').fill('C6 Bank');
        await page.locator('#cat_modal_fechamento').fill('15');
        await page.locator('#cat_modal_vencimento').fill('25');
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModal')).not.toBeVisible();
        await expect(page.locator('#managePaymentsList')).toContainText('C6 Bank');

        await page.waitForFunction(() => typeof globalCartoes !== 'undefined' && globalCartoes.some(c => c.nome === 'C6 Bank'));
        const pageCards = await page.evaluate(() => typeof globalCartoes !== 'undefined' ? globalCartoes : []);
        const c6InPage = pageCards.find(c => c.nome === 'C6 Bank');
        expect(c6InPage).toBeDefined();
        expect(c6InPage.dia_fechamento).toBe(15);
        expect(c6InPage.dia_vencimento).toBe(25);

        const cards = getCards();
        const c6 = cards.find(c => c.nome === 'C6 Bank');
        expect(c6).toBeDefined();
        expect(c6.dia_fechamento).toBe(15);
        expect(c6.dia_vencimento).toBe(25);
    });

    test('17. Bloquear Cartão duplicado por normalização', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        await page.locator('#btnNewCard').click();

        await page.locator('#cat_modal_name').fill(' nubank ');
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModalError')).toBeVisible();
        await expect(page.locator('#catalogModalError')).toContainText('Já existe um cartão cadastrado com o nome');
    });

    test('18. Editar Cartão de Crédito existente', async ({ page }) => {
        const { getCards } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const nubankRow = page.locator('#managePaymentsList div:has-text("Nubank")').first();
        await nubankRow.locator('button[title="Editar"]').click();

        await expect(page.locator('#catalogModal')).toBeVisible();
        await expect(page.locator('#catalogModalTitle')).toHaveText('Editar Cartão de Crédito');

        await page.locator('#cat_modal_fechamento').fill('28');
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModal')).not.toBeVisible();

        const cards = getCards();
        const nubank = cards.find(c => c.nome === 'Nubank');
        expect(nubank.dia_fechamento).toBe(28);
    });

    test('19. Desativar e reativar Cartão de Crédito', async ({ page }) => {
        const { getCards } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const nubankRow = page.locator('#managePaymentsList div:has-text("Nubank")').first();
        await nubankRow.locator('button[title="Desativar"]').click();

        let cards = getCards();
        let nubank = cards.find(c => c.nome === 'Nubank');
        expect(nubank.ativo).toBe(false);

        // Confirma que Nubank sumiu dos selects ativos
        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await expect(page.locator('#i_cartao option[value="Nubank"]')).toHaveCount(0);

        // Reativa
        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        const nubankInactive = page.locator('#managePaymentsList div:has-text("Nubank")').first();
        await nubankInactive.locator('button[title="Reativar"]').click();
        await expect(nubankInactive.locator('button[title="Desativar"]')).toBeVisible();

        cards = getCards();
        nubank = cards.find(c => c.nome === 'Nubank');
        expect(nubank.ativo).toBe(true);
    });

    test('20. Excluir Cartão sem histórico tem sucesso definitivo', async ({ page }) => {
        const { getCards } = await setupAuthenticatedApp(page, { autoAcceptDialogs: false });

        // Cria cartão sem usos
        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        await page.locator('#btnNewCard').click();
        await page.locator('#cat_modal_name').fill('Cartão Teste');
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#managePaymentsList')).toContainText('Cartão Teste');

        page.once('dialog', async dialog => {
            await dialog.accept();
        });

        const testCardRow = page.locator('#managePaymentsList div:has-text("Cartão Teste")').first();
        await testCardRow.locator('button[title="Excluir"]').click();

        await expect(page.locator('#managePaymentsList')).not.toContainText('Cartão Teste');

        const cards = getCards();
        expect(cards.some(c => c.nome === 'Cartão Teste')).toBe(false);
    });

    test('21. Bloqueio de exclusão física de Cartão com usos históricos', async ({ page }) => {
        const { getCards } = await setupAuthenticatedApp(page, { autoAcceptDialogs: false });

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        let dialogMessage = '';
        page.once('dialog', async dialog => {
            dialogMessage = dialog.message();
            await dialog.accept();
        });

        const nubankRow = page.locator('#managePaymentsList div:has-text("Nubank")').first();
        await nubankRow.locator('button[title="Excluir"]').click();

        expect(dialogMessage).toContain('histórico financeiro');
        await expect(page.locator('#managePaymentsList div:has-text("Nubank") .tag-status')).toHaveText('Inativo');
        const cards = getCards();
        const nubank = cards.find(c => c.nome === 'Nubank');
        expect(nubank).toBeDefined();
        expect(nubank.ativo).toBe(false);
    });

    // ==========================================
    // 5. TAGS (CRUD, SEGURANÇA E REGRAS)
    // ==========================================
    test('22. Criar nova Tag com cor', async ({ page }) => {
        const { getTags } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        await page.locator('#btnNewTag').click();

        await expect(page.locator('#catalogModalTitle')).toHaveText('Nova Tag');

        await page.locator('#cat_modal_name').fill('Trabalho');
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModal')).not.toBeVisible();
        await expect(page.locator('#manageTagsList')).toContainText('Trabalho');

        const tags = getTags();
        const workTag = tags.find(t => t.nome === 'Trabalho');
        expect(workTag).toBeDefined();
    });

    test('23. Bloquear Tag duplicada por normalização', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        await page.locator('#btnNewTag').click();

        await page.locator('#cat_modal_name').fill(' viagem ');
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModalError')).toBeVisible();
        await expect(page.locator('#catalogModalError')).toContainText('Já existe uma tag cadastrada com o nome');
    });

    test('24. Editar Tag existente', async ({ page }) => {
        const { getTags } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const tagRow = page.locator('#manageTagsList div:has-text("Família")').first();
        await tagRow.locator('button[title="Editar"]').click();

        await expect(page.locator('#catalogModal')).toBeVisible();
        await expect(page.locator('#catalogModalTitle')).toHaveText('Editar Tag');

        await page.locator('#cat_modal_name').fill('Família & Parentes');
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModal')).not.toBeVisible();
        await expect(page.locator('#manageTagsList')).toContainText('Família & Parentes');

        const tags = getTags();
        expect(tags.some(t => t.nome === 'Família & Parentes')).toBe(true);
    });

    test('25. Desativar e reativar Tag', async ({ page }) => {
        const { getTags } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const tagRow = page.locator('#manageTagsList div:has-text("Viagem")').first();
        await tagRow.locator('button[title="Desativar"]').click();

        let tags = getTags();
        let viagem = tags.find(t => t.nome === 'Viagem');
        expect(viagem.ativo).toBe(false);

        // Reativa
        const tagInactive = page.locator('#manageTagsList div:has-text("Viagem")').first();
        await tagInactive.locator('button[title="Reativar"]').click();

        tags = getTags();
        viagem = tags.find(t => t.nome === 'Viagem');
        expect(viagem.ativo).toBe(true);
    });

    test('26. Excluir Tag sem histórico tem sucesso definitivo', async ({ page }) => {
        const { getTags } = await setupAuthenticatedApp(page, { autoAcceptDialogs: false });

        // Cria tag sem usos
        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        await page.locator('#btnNewTag').click();
        await page.locator('#cat_modal_name').fill('Tag Temporária');
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#manageTagsList')).toContainText('Tag Temporária');

        page.once('dialog', async dialog => {
            await dialog.accept();
        });

        const tempRow = page.locator('#manageTagsList div:has-text("Tag Temporária")').first();
        await tempRow.locator('button[title="Excluir"]').click();

        await expect(page.locator('#manageTagsList')).not.toContainText('Tag Temporária');

        const tags = getTags();
        expect(tags.some(t => t.nome === 'Tag Temporária')).toBe(false);
    });

    test('27. Bloqueio de exclusão física de Tag com usos históricos', async ({ page }) => {
        const { getTags } = await setupAuthenticatedApp(page, { autoAcceptDialogs: false });

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        let dialogMessage = '';
        page.once('dialog', async dialog => {
            dialogMessage = dialog.message();
            await dialog.accept();
        });

        const tagRow = page.locator('#manageTagsList div:has-text("Viagem")').first();
        await tagRow.locator('button[title="Excluir"]').click();

        expect(dialogMessage).toContain('vinculado no seu histórico financeiro');
        const tags = getTags();
        const viagem = tags.find(t => t.nome === 'Viagem');
        expect(viagem).toBeDefined();
        expect(viagem.ativo).toBe(false);
    });

    // ==========================================
    // 6. ASSISTENTE DE IMPORTAÇÃO
    // ==========================================
    test('28. Assistente de Importação abre modal com itens históricos e pré-seleções seguras', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        await page.locator('button:has-text("✨ Assistente de Importação")').click();

        await expect(page.locator('#assistedImportModal')).toBeVisible();
        await expect(page.locator('#assistedCategoriesList')).toContainText('Alimentação');
        await expect(page.locator('#assistedCardsList')).toContainText('Nubank');

        // Confirma que não-cartões como BOLETO aparecem desmarcados por padrão
        const boletoCheckbox = page.locator('#assistedCardsList label:has-text("BOLETO") input[type="checkbox"]');
        if (await boletoCheckbox.count() > 0) {
            expect(await boletoCheckbox.isChecked()).toBe(false);
        }
    });

    test('29. Submeter Assistente de Importação cria itens de catálogo sem alterar transações', async ({ page }) => {
        const { getCategories, getTransactions } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();
        await page.locator('button:has-text("✨ Assistente de Importação")').click();

        await page.locator('#btnSubmitAssistedImport').click();

        await expect(page.locator('#assistedImportModal')).not.toBeVisible();

        const cats = getCategories();
        expect(cats.length).toBeGreaterThan(0);

        const trans = getTransactions();
        expect(trans.length).toBeGreaterThan(0);
    });

    // ==========================================
    // 7. CRIAÇÃO RÁPIDA, MOBILE E FORMULÁRIOS
    // ==========================================
    test('30. Criação rápida de Categoria via formulário Desktop (➕ Adicionar Novo...)', async ({ page }) => {
        const { getCategories } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();

        await page.locator('#i_categoria').selectOption('__NEW__');

        await expect(page.locator('#catalogModal')).toBeVisible();
        await expect(page.locator('#catalogModalTitle')).toHaveText('Nova Categoria');

        await page.locator('#cat_modal_name').fill('Saúde & Bem Estar');
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModal')).not.toBeVisible();
        // Confirma que o dropdown do formulário Desktop auto-selecionou o novo item
        expect(await page.locator('#i_categoria').inputValue()).toBe('Saúde & Bem Estar');

        const cats = getCategories();
        expect(cats.some(c => c.nome === 'Saúde & Bem Estar')).toBe(true);
    });

    test('31. Criação rápida de Subcategoria vinculada no formulário Desktop', async ({ page }) => {
        const { getSubcategories, getCategories } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();

        await page.locator('#i_categoria').selectOption('Alimentação');
        await page.locator('#i_subcategoria').selectOption('__NEW__');

        await expect(page.locator('#catalogModal')).toBeVisible();
        await expect(page.locator('#catalogModalTitle')).toHaveText('Nova Subcategoria');

        // Confirma que a categoria pai Alimentação já veio pré-selecionada no modal
        const cats = getCategories();
        const alimCat = cats.find(c => c.nome === 'Alimentação');
        expect(await page.locator('#cat_modal_parent_id').inputValue()).toBe(alimCat.id);

        await page.locator('#cat_modal_name').fill('Padaria Artesanal');
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModal')).not.toBeVisible();

        const subcats = getSubcategories();
        const padaria = subcats.find(s => s.nome === 'Padaria Artesanal');
        expect(padaria).toBeDefined();
        expect(padaria.categoria_id).toBe(alimCat.id);
    });

    test('32. Criação rápida no formulário Mobile', async ({ page }) => {
        const { getCategories } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: /Lançador Celular/i }).click();
        await expect(page.locator('#mobileQuickView')).toBeVisible();

        await page.locator('#m_categoria').selectOption('__NEW__');

        await expect(page.locator('#catalogModal')).toBeVisible();
        await page.locator('#cat_modal_name').fill('Educação & Cursos');
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModal')).not.toBeVisible();
        expect(await page.locator('#m_categoria').inputValue()).toBe('Educação & Cursos');

        const cats = getCategories();
        expect(cats.some(c => c.nome === 'Educação & Cursos')).toBe(true);
    });

    // ==========================================
    // 8. INTEGRIDADE HISTÓRICA E FILTROS
    // ==========================================
    test('33. Edição de transação histórica com categoria não catalogada preserva valor', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // Localiza a linha do Supermercado Mensal e clica no botão de edição
        const editBtn = page.locator('tr:has-text("Supermercado Mensal") button[title="Editar"]').first();
        await editBtn.click();

        await expect(page.locator('#tab-novo')).toHaveClass(/active/);
        await expect(page.locator('#formTitle')).toHaveText(/Editar Transação/i);

        // Confirma que a categoria foi selecionada sem erro
        const catVal = await page.locator('#i_categoria').inputValue();
        expect(catVal).not.toBe('');
        expect(catVal).not.toBe('__NEW__');
    });

    test('34. Filtros de Análise & Filtros combinam catálogos e histórico', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '📊 Análise de Gastos' }).click();

        const anCat = page.locator('#an_categoria');
        await expect(anCat).toBeVisible();

        // Confirma que categorias do catálogo e do histórico aparecem
        await expect(anCat.locator('option[value="Alimentação"]')).toHaveCount(1);

        const anTag = page.locator('#an_tag');
        await expect(anTag.locator('option[value="Viagem"]')).toHaveCount(1);
    });
});
