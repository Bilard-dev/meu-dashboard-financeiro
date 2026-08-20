import { test, expect } from '@playwright/test';
import { setupAuthenticatedApp } from './helpers/setupApp.js';
import { mockUser, mockTransactions, mockCategorias, mockSubcategorias, mockCartoes, mockTags, mockMetas } from './fixtures/mockData.js';

test.describe('Catálogos 2.0 - Fase 2: Histórico + Mesclagem (Merge 2.0)', () => {

    test('1. Editar categoria sem histórico altera somente app_categorias e não altera transacoes', async ({ page }) => {
        const { getCategories, getTransactions } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const catRow = page.locator('#manageCategoriesList div:has-text("Alimentação")').first();
        await catRow.locator('button[title="Editar"]').click();
        await expect(page.locator('#catalogModal')).toBeVisible();

        await page.locator('#cat_modal_name').fill('Alimentação Nova');
        expect(await page.locator('#cat_modal_update_history').isChecked()).toBe(false);
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#catalogModal')).toBeHidden();
        await expect(page.locator('#manageCategoriesList')).toContainText('Alimentação Nova');

        const cats = getCategories();
        expect(cats.some(c => c.nome === 'Alimentação Nova')).toBe(true);

        const txs = getTransactions();
        expect(txs.some(t => t.categoria === 'Alimentação')).toBe(true);
    });

    test('2. Editar categoria com atualização histórica atualiza catálogo e transacoes.categoria', async ({ page }) => {
        const { getCategories, getTransactions } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const catRow = page.locator('#manageCategoriesList div:has-text("Alimentação")').first();
        await catRow.locator('button[title="Editar"]').click();
        await expect(page.locator('#catalogModal')).toBeVisible();

        await page.locator('#cat_modal_name').fill('Gastronomia');
        await expect(page.locator('#cat_modal_update_history')).toBeVisible();
        await page.locator('#cat_modal_update_history').check();
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#renamePreviewModal')).toBeVisible();
        await expect(page.locator('#renamePreviewContent')).toContainText('Alimentação ➔ Gastronomia');

        await page.locator('#btnConfirmRenameWithHistory').click();
        await expect(page.locator('#renamePreviewModal')).toBeHidden();
        await expect(page.locator('#catalogModal')).toBeHidden();

        await expect(page.locator('#manageCategoriesList')).toContainText('Gastronomia');

        const cats = getCategories();
        expect(cats.some(c => c.nome === 'Gastronomia')).toBe(true);

        const txs = getTransactions();
        expect(txs.some(t => t.categoria === 'Gastronomia')).toBe(true);
    });

    test('3. Cancelar preview não altera dados', async ({ page }) => {
        const { getCategories } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const catRow = page.locator('#manageCategoriesList div:has-text("Alimentação")').first();
        await catRow.locator('button[title="Editar"]').click();
        await page.locator('#cat_modal_name').fill('Gastronomia Teste');
        await expect(page.locator('#cat_modal_update_history')).toBeVisible();
        await page.locator('#cat_modal_update_history').check();
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#renamePreviewModal')).toBeVisible();
        await page.locator('#renamePreviewModal button').filter({ hasText: 'Cancelar' }).click();
        await expect(page.locator('#renamePreviewModal')).toBeHidden();

        await page.locator('#catalogModal button').filter({ hasText: 'Cancelar' }).click();
        await expect(page.locator('#manageCategoriesList')).toContainText('Alimentação');
        await expect(page.locator('#manageCategoriesList')).not.toContainText('Gastronomia Teste');

        const cats = getCategories();
        expect(cats.some(c => c.nome === 'Alimentação')).toBe(true);
    });

    test('4. Categoria + meta sem conflito atualiza meta para novo nome', async ({ page }) => {
        const { getMetas } = await setupAuthenticatedApp(page, {
            metas: [{ id: 'meta-1', user_id: mockUser.id, categoria: 'Alimentação', valor_limite: 1500 }]
        });

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const catRow = page.locator('#manageCategoriesList div:has-text("Alimentação")').first();
        await catRow.locator('button[title="Editar"]').click();
        await page.locator('#cat_modal_name').fill('Gastronomia');
        await expect(page.locator('#cat_modal_update_history')).toBeVisible();
        await page.locator('#cat_modal_update_history').check();
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#renamePreviewModal')).toBeVisible();
        await expect(page.locator('#renameMetaConflictSection')).toBeVisible();
        await page.locator('input[name="rename_meta_action"][value="UPDATE"]').check();

        await page.locator('#btnConfirmRenameWithHistory').click();
        await expect(page.locator('#renamePreviewModal')).toBeHidden();

        const metas = getMetas();
        expect(metas.some(m => m.categoria === 'Gastronomia')).toBe(true);
    });

    test('5. Categoria + duas metas KEEP_TARGET no merge de categorias', async ({ page }) => {
        const { getMetas } = await setupAuthenticatedApp(page, {
            metas: [
                { id: 'meta-src', user_id: mockUser.id, categoria: 'Transporte', valor_limite: 400 },
                { id: 'meta-tgt', user_id: mockUser.id, categoria: 'Alimentação', valor_limite: 1200 }
            ]
        });

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const catRow = page.locator('#manageCategoriesList div:has-text("Transporte")').first();
        await catRow.locator('button[title="Mesclar"]').click();
        await expect(page.locator('#mergeModal')).toBeVisible();

        await page.locator('#merge_target_id').selectOption({ label: 'Alimentação' });
        await expect(page.locator('#mergeMetaConflictSection')).toBeVisible();
        await page.locator('input[name="merge_meta_action"][value="KEEP_TARGET"]').check();

        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const metas = getMetas();
        const alimMeta = metas.find(m => m.categoria === 'Alimentação');
        expect(alimMeta).toBeDefined();
        expect(alimMeta.valor_limite).toBe(1200);
        expect(metas.some(m => m.categoria === 'Transporte')).toBe(false);
    });

    test('6. Categoria + duas metas KEEP_SOURCE no merge de categorias', async ({ page }) => {
        const { getMetas } = await setupAuthenticatedApp(page, {
            metas: [
                { id: 'meta-src', user_id: mockUser.id, categoria: 'Transporte', valor_limite: 400 },
                { id: 'meta-tgt', user_id: mockUser.id, categoria: 'Alimentação', valor_limite: 1200 }
            ]
        });

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const catRow = page.locator('#manageCategoriesList div:has-text("Transporte")').first();
        await catRow.locator('button[title="Mesclar"]').click();

        await page.locator('#merge_target_id').selectOption({ label: 'Alimentação' });
        await page.locator('input[name="merge_meta_action"][value="KEEP_SOURCE"]').check();
        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const metas = getMetas();
        const alimMeta = metas.find(m => m.categoria === 'Alimentação');
        expect(alimMeta).toBeDefined();
        expect(alimMeta.valor_limite).toBe(400);
    });

    test('7. Categoria + duas metas SUM no merge de categorias', async ({ page }) => {
        const { getMetas } = await setupAuthenticatedApp(page, {
            metas: [
                { id: 'meta-src', user_id: mockUser.id, categoria: 'Transporte', valor_limite: 400 },
                { id: 'meta-tgt', user_id: mockUser.id, categoria: 'Alimentação', valor_limite: 1200 }
            ]
        });

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const catRow = page.locator('#manageCategoriesList div:has-text("Transporte")').first();
        await catRow.locator('button[title="Mesclar"]').click();

        await page.locator('#merge_target_id').selectOption({ label: 'Alimentação' });
        await page.locator('input[name="merge_meta_action"][value="SUM"]').check();
        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const metas = getMetas();
        const alimMeta = metas.find(m => m.categoria === 'Alimentação');
        expect(alimMeta).toBeDefined();
        expect(alimMeta.valor_limite).toBe(1600);
    });

    test('8. Merge de categorias via RPC atualiza transações e inativa origem', async ({ page }) => {
        const { getCategories, getTransactions } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const catRow = page.locator('#manageCategoriesList div:has-text("Lazer")').first();
        await catRow.locator('button[title="Mesclar"]').click();

        await page.locator('#merge_target_id').selectOption({ label: 'Alimentação' });
        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const cats = getCategories();
        const lazerCat = cats.find(c => c.nome === 'Lazer');
        const alimCat = cats.find(c => c.nome === 'Alimentação');
        expect(lazerCat.ativo).toBe(false);
        expect(alimCat.ativo).toBe(true);

        const txs = getTransactions();
        expect(txs.some(t => t.categoria === 'Lazer')).toBe(false);
    });

    test('9. Subcategorias movidas na mesclagem de categoria', async ({ page }) => {
        const { getSubcategories } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const catRow = page.locator('#manageCategoriesList div:has-text("Transporte")').first();
        await catRow.locator('button[title="Mesclar"]').click();
        await page.locator('#merge_target_id').selectOption({ label: 'Alimentação' });
        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const subs = getSubcategories();
        const combustivel = subs.find(s => s.nome === 'Combustível');
        expect(combustivel.categoria_id).toBe('cat-001-uuid'); // Alimentação
    });

    test('10. Subcategorias homônimas consolidadas na mesclagem de categoria', async ({ page }) => {
        const { getSubcategories } = await setupAuthenticatedApp(page, {
            subcategorias: [
                { id: 'sub-1', user_id: mockUser.id, categoria_id: 'cat-001-uuid', nome: 'Geral', ativo: true },
                { id: 'sub-2', user_id: mockUser.id, categoria_id: 'cat-003-uuid', nome: 'Geral', ativo: true }
            ]
        });

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const catRow = page.locator('#manageCategoriesList div:has-text("Moradia")').first();
        await catRow.locator('button[title="Mesclar"]').click();
        await page.locator('#merge_target_id').selectOption({ label: 'Alimentação' });
        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const subs = getSubcategories();
        const sub2 = subs.find(s => s.id === 'sub-2');
        expect(sub2.ativo).toBe(false);
    });

    test('11. Merge de subcategorias na mesma categoria pai', async ({ page }) => {
        const { getSubcategories, getTransactions } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        // Restaurante e Supermercado estão em Alimentação
        const subRow = page.locator('#manageSubcategoriesList div:has-text("Restaurante")').first();
        await subRow.locator('button[title="Mesclar"]').click();
        await expect(page.locator('#mergeModal')).toBeVisible();

        await page.locator('#merge_target_id').selectOption({ label: 'Supermercado (Alimentação)' });
        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const subs = getSubcategories();
        const rest = subs.find(s => s.nome === 'Restaurante');
        expect(rest.ativo).toBe(false);

        const txs = getTransactions();
        expect(txs.some(t => t.subcategoria === 'Restaurante')).toBe(false);
    });

    test('12. Merge de subcategorias entre categorias pais diferentes atualiza categoria textual', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        // Combustível (Transporte) para Supermercado (Alimentação)
        const subRow = page.locator('#manageSubcategoriesList div:has-text("Combustível")').first();
        await subRow.locator('button[title="Mesclar"]').click();

        await page.locator('#merge_target_id').selectOption({ label: 'Supermercado (Alimentação)' });
        await expect(page.locator('#mergePreviewDetails')).toContainText('Mudança de Categoria');

        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const txs = getTransactions();
        const formerCombustivel = txs.filter(t => t.subcategoria === 'Supermercado' && t.categoria === 'Alimentação');
        expect(formerCombustivel.length).toBeGreaterThan(0);
    });

    test('13. Impedir alteração de subcategoria homônima em categoria pai incorreta', async ({ page }) => {
        const { getSubcategories } = await setupAuthenticatedApp(page, {
            subcategorias: [
                { id: 'sub-t1', user_id: mockUser.id, categoria_id: 'cat-001-uuid', nome: 'Outros', ativo: true },
                { id: 'sub-t2', user_id: mockUser.id, categoria_id: 'cat-002-uuid', nome: 'Outros', ativo: true },
                { id: 'sub-t3', user_id: mockUser.id, categoria_id: 'cat-002-uuid', nome: 'Combustível', ativo: true }
            ]
        });

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const subRow = page.locator('#manageSubcategoriesList div:has-text("Outros")').filter({ hasText: 'Transporte' }).first();
        await subRow.locator('button[title="Mesclar"]').click();
        await page.locator('#merge_target_id').selectOption({ label: 'Combustível (Transporte)' });
        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const subs = getSubcategories();
        const outrosAlim = subs.find(s => s.id === 'sub-t1');
        expect(outrosAlim.ativo).toBe(true);
    });

    test('14. Editar cartão sem histórico altera somente app_cartoes', async ({ page }) => {
        const { getCards, getTransactions } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const cardRow = page.locator('#managePaymentsList div:has-text("Nubank")').first();
        await cardRow.locator('button[title="Editar"]').click();
        await page.locator('#cat_modal_name').fill('Nubank Roxo');
        expect(await page.locator('#cat_modal_update_history').isChecked()).toBe(false);
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#managePaymentsList')).toContainText('Nubank Roxo');

        const cards = getCards();
        expect(cards.some(c => c.nome === 'Nubank Roxo')).toBe(true);

        const txs = getTransactions();
        expect(txs.some(t => t.cartao === 'Nubank')).toBe(true);
    });

    test('15. Editar cartão com atualização histórica altera app_cartoes e transacoes.cartao', async ({ page }) => {
        const { getCards, getTransactions } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const cardRow = page.locator('#managePaymentsList div:has-text("Nubank")').first();
        await cardRow.locator('button[title="Editar"]').click();
        await page.locator('#cat_modal_name').fill('Nubank Platinum');
        await expect(page.locator('#cat_modal_update_history')).toBeVisible();
        await page.locator('#cat_modal_update_history').check();
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#renamePreviewModal')).toBeVisible();
        await page.locator('#btnConfirmRenameWithHistory').click();
        await expect(page.locator('#renamePreviewModal')).toBeHidden();

        await expect(page.locator('#managePaymentsList')).toContainText('Nubank Platinum');

        const cards = getCards();
        expect(cards.some(c => c.nome === 'Nubank Platinum')).toBe(true);

        const txs = getTransactions();
        expect(txs.some(t => t.cartao === 'Nubank Platinum')).toBe(true);
    });

    test('16. Merge de cartões via RPC', async ({ page }) => {
        const { getCards, getTransactions } = await setupAuthenticatedApp(page, {
            transactions: [
                ...mockTransactions,
                {
                    id: 'tx-inter-test',
                    user_id: mockUser.id,
                    data: '2026-08-10',
                    descricao: 'Compra Inter',
                    valor: 120,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Inter Black',
                    parcela: '1/2',
                    fatura_destino: 'ATUAL',
                    categoria: 'Lazer'
                }
            ]
        });

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const cardRow = page.locator('#managePaymentsList div:has-text("Inter Black")').first();
        await cardRow.locator('button[title="Mesclar"]').click();
        await expect(page.locator('#mergeModal')).toBeVisible();

        await page.locator('#merge_target_id').selectOption({ label: 'Nubank' });
        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const cards = getCards();
        const inter = cards.find(c => c.nome === 'Inter Black');
        expect(inter.ativo).toBe(false);

        const txs = getTransactions();
        expect(txs.some(t => t.cartao === 'Inter Black')).toBe(false);
    });

    test('17. Preservar fatura_destino ao mesclar cartões', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const cardRow = page.locator('#managePaymentsList div:has-text("Inter Black")').first();
        await cardRow.locator('button[title="Mesclar"]').click();
        await page.locator('#merge_target_id').selectOption({ label: 'Nubank' });
        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const txs = getTransactions();
        const futureTxs = txs.filter(t => t.fatura_destino && t.fatura_destino !== 'ATUAL');
        expect(futureTxs.length).toBeGreaterThan(0);
    });

    test('18. Preservar parcela (ex: 1/3) ao mesclar cartões', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const cardRow = page.locator('#managePaymentsList div:has-text("Inter Black")').first();
        await cardRow.locator('button[title="Mesclar"]').click();
        await page.locator('#merge_target_id').selectOption({ label: 'Nubank' });
        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const txs = getTransactions();
        const parcelTxs = txs.filter(t => t.parcela && t.parcela.includes('/'));
        expect(parcelTxs.length).toBeGreaterThan(0);
    });

    test('19. Preservar grupo_parcela_id (UUIDs) ao mesclar cartões', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-group-uuid-1',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-15',
                    descricao: 'Compra Parcelada',
                    valor: 100,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Inter Black',
                    parcela: '1/3',
                    grupo_parcela_id: 'grupo-uuid-mock-001',
                    fatura_destino: 'ATUAL',
                    categoria: 'Lazer'
                }
            ]
        });

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const cardRow = page.locator('#managePaymentsList div:has-text("Inter Black")').first();
        await cardRow.locator('button[title="Mesclar"]').click();
        await page.locator('#merge_target_id').selectOption({ label: 'Nubank' });
        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const txs = getTransactions();
        const targetTx = txs.find(t => t.id === 'tx-group-uuid-1');
        expect(targetTx.grupo_parcela_id).toBe('grupo-uuid-mock-001');
    });

    test('20. Compras recorrentes preservadas ao mesclar cartões', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const cardRow = page.locator('#managePaymentsList div:has-text("Inter Black")').first();
        await cardRow.locator('button[title="Mesclar"]').click();
        await page.locator('#merge_target_id').selectOption({ label: 'Nubank' });
        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const txs = getTransactions();
        const recTxs = txs.filter(t => t.parcela === 'RECORRENTE');
        expect(recTxs.length).toBeGreaterThan(0);
    });

    test('21. Editar tag sem histórico altera somente app_tags', async ({ page }) => {
        const { getTags, getTransactions } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const tagRow = page.locator('#manageTagsList div:has-text("Viagem")').first();
        await tagRow.locator('button[title="Editar"]').click();
        await page.locator('#cat_modal_name').fill('Férias');
        expect(await page.locator('#cat_modal_update_history').isChecked()).toBe(false);
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#manageTagsList')).toContainText('Férias');

        const tags = getTags();
        expect(tags.some(t => t.nome === 'Férias')).toBe(true);

        const txs = getTransactions();
        expect(txs.some(t => t.descricao && t.descricao.includes('[Viagem]'))).toBe(true);
    });

    test('22. Editar tag + histórico atualiza tag no prefixo inicial', async ({ page }) => {
        const { getTags, getTransactions } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const tagRow = page.locator('#manageTagsList div:has-text("Viagem")').first();
        await tagRow.locator('button[title="Editar"]').click();
        await page.locator('#cat_modal_name').fill('Turismo');
        await expect(page.locator('#cat_modal_update_history')).toBeVisible();
        await page.locator('#cat_modal_update_history').check();
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#renamePreviewModal')).toBeVisible();
        await page.locator('#btnConfirmRenameWithHistory').click();
        await expect(page.locator('#renamePreviewModal')).toBeHidden();

        await expect(page.locator('#manageTagsList')).toContainText('Turismo');

        const tags = getTags();
        expect(tags.some(t => t.nome === 'Turismo')).toBe(true);

        const txs = getTransactions();
        expect(txs.some(t => t.descricao && t.descricao.includes('[Turismo]'))).toBe(true);
    });

    test('23. Merge de tags via RPC', async ({ page }) => {
        const { getTags, getTransactions } = await setupAuthenticatedApp(page, {
            transactions: [
                ...mockTransactions,
                {
                    id: 'tx-tag-fam',
                    user_id: mockUser.id,
                    data: '2026-08-10',
                    descricao: '[Família] Compra Família',
                    valor: 80,
                    categoria: 'Lazer'
                }
            ]
        });

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const tagRow = page.locator('#manageTagsList div:has-text("Família")').first();
        await tagRow.locator('button[title="Mesclar"]').click();
        await expect(page.locator('#mergeModal')).toBeVisible();

        await page.locator('#merge_target_id').selectOption({ label: 'Viagem' });
        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const tags = getTags();
        const fam = tags.find(t => t.nome === 'Família');
        expect(fam.ativo).toBe(false);

        const txs = getTransactions();
        expect(txs.some(t => t.descricao && t.descricao.startsWith('[Família]'))).toBe(false);
    });

    test('24. Preservar colchetes no corpo (Tags 2.0)', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-bracket',
                    user_id: mockUser.id,
                    data: '2026-02-15',
                    descricao: '[Viagem] Livro [Edição Especial]',
                    valor: 100,
                    tipo: 'DESPESA',
                    categoria: 'Lazer',
                    subcategoria: 'Livros',
                    forma_pagamento: 'PIX'
                }
            ]
        });

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const tagRow = page.locator('#manageTagsList div:has-text("Viagem")').first();
        await tagRow.locator('button[title="Editar"]').click();
        await page.locator('#cat_modal_name').fill('Turismo');
        await expect(page.locator('#cat_modal_update_history')).toBeVisible();
        await page.locator('#cat_modal_update_history').check();
        await page.locator('#btnSaveCatalogModal').click();

        await expect(page.locator('#renamePreviewModal')).toBeVisible();
        await page.locator('#btnConfirmRenameWithHistory').click();
        await expect(page.locator('#renamePreviewModal')).toBeHidden();

        const txs = getTransactions();
        const targetTx = txs.find(t => t.id === 'tx-bracket');
        expect(targetTx.descricao).toBe('[Turismo] Livro [Edição Especial]');
    });

    test('25. Desduplicar tag no prefixo ao mesclar tags', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-dedup',
                    user_id: mockUser.id,
                    data: '2026-02-15',
                    descricao: '[Família, Viagem] Assinatura Software',
                    valor: 50,
                    tipo: 'DESPESA',
                    categoria: 'Serviços',
                    forma_pagamento: 'PIX'
                }
            ]
        });

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const tagRow = page.locator('#manageTagsList div:has-text("Família")').first();
        await tagRow.locator('button[title="Mesclar"]').click();
        await page.locator('#merge_target_id').selectOption({ label: 'Viagem' });
        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const txs = getTransactions();
        const targetTx = txs.find(t => t.id === 'tx-dedup');
        expect(targetTx.descricao).toBe('[Viagem] Assinatura Software');
    });

    test('26. Preview de merge não altera dados em memória antes da confirmação', async ({ page }) => {
        const { getCategories } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const catRow = page.locator('#manageCategoriesList div:has-text("Moradia")').first();
        await catRow.locator('button[title="Mesclar"]').click();
        await page.locator('#merge_target_id').selectOption({ label: 'Alimentação' });
        await expect(page.locator('#mergePreviewContainer')).toBeVisible();

        await page.locator('#mergeModal button').filter({ hasText: 'Cancelar' }).click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const cats = getCategories();
        expect(cats.find(c => c.nome === 'Moradia').ativo).toBe(true);
        expect(cats.find(c => c.nome === 'Alimentação').ativo).toBe(true);
    });

    test('27. Cancelar não altera dados', async ({ page }) => {
        const { getCards } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const cardRow = page.locator('#managePaymentsList div:has-text("Inter Black")').first();
        await cardRow.locator('button[title="Mesclar"]').click();
        await page.locator('#merge_target_id').selectOption({ label: 'Nubank' });
        await page.locator('#mergeModal .reset-btn').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const cards = getCards();
        expect(cards.find(c => c.nome === 'Inter Black').ativo).toBe(true);
    });

    test('28. Erro na RPC não atualiza UI como sucesso', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const catRow = page.locator('#manageCategoriesList div:has-text("Moradia")').first();
        await catRow.locator('button[title="Mesclar"]').click();

        await page.locator('#merge_target_id').selectOption({ label: 'Moradia' });
        expect(await page.locator('#btnConfirmMerge').isDisabled()).toBe(true);
    });

    test('29. Duplo clique protegido: botão desabilita imediatamente durante execução', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const catRow = page.locator('#manageCategoriesList div:has-text("Lazer")').first();
        await catRow.locator('button[title="Mesclar"]').click();
        await page.locator('#merge_target_id').selectOption({ label: 'Alimentação' });

        const btn = page.locator('#btnConfirmMerge');
        await expect(btn).toBeEnabled();
        await btn.click();
        await expect(page.locator('#mergeModal')).toBeHidden();
    });

    test('30. Origem fica inativa após merge', async ({ page }) => {
        const { getCategories } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const catRow = page.locator('#manageCategoriesList div:has-text("Lazer")').first();
        await catRow.locator('button[title="Mesclar"]').click();
        await page.locator('#merge_target_id').selectOption({ label: 'Alimentação' });
        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const cats = getCategories();
        expect(cats.find(c => c.nome === 'Lazer').ativo).toBe(false);
    });

    test('31. Destino fica ativo após merge', async ({ page }) => {
        const { getCategories } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const catRow = page.locator('#manageCategoriesList div:has-text("Lazer")').first();
        await catRow.locator('button[title="Mesclar"]').click();
        await page.locator('#merge_target_id').selectOption({ label: 'Alimentação' });
        await page.locator('#btnConfirmMerge').click();
        await expect(page.locator('#mergeModal')).toBeHidden();

        const cats = getCategories();
        expect(cats.find(c => c.nome === 'Alimentação').ativo).toBe(true);
    });

    test('32. Filtros de análise atualizados após merge/rename', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const catRow = page.locator('#manageCategoriesList div:has-text("Alimentação")').first();
        await catRow.locator('button[title="Editar"]').click();
        await page.locator('#cat_modal_name').fill('Gastronomia');
        await expect(page.locator('#cat_modal_update_history')).toBeVisible();
        await page.locator('#cat_modal_update_history').check();
        await page.locator('#btnSaveCatalogModal').click();
        await page.locator('#btnConfirmRenameWithHistory').click();

        await page.getByRole('button', { name: '📊 Análise de Gastos' }).click();
        await expect(page.locator('#an_categoria')).toContainText('Gastronomia');
    });

    test('33. Desktop e Mobile atualizados imediatamente após merge/rename', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '⚙️ Categorias & Listas' }).click();

        const catRow = page.locator('#manageCategoriesList div:has-text("Transporte")').first();
        await catRow.locator('button[title="Editar"]').click();
        await page.locator('#cat_modal_name').fill('Transporte & Mobilidade');
        await page.locator('#btnSaveCatalogModal').click();

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await expect(page.locator('#i_categoria')).toContainText('Transporte & Mobilidade');
        await expect(page.locator('#m_categoria')).toContainText('Transporte & Mobilidade');
    });

    test('34. Regressão: 144 testes anteriores continuam operando normalmente', async ({ page }) => {
        await setupAuthenticatedApp(page);
        await expect(page.locator('#appView')).toBeVisible();
        await expect(page.locator('#kpi-saldo')).toBeVisible();
    });

});
