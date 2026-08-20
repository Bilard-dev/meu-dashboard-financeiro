// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');
const { mockUser } = require('./fixtures/mockData');

test.describe('Descrições & Tags 2.0 - Prefixo Ancorado e Preservação de Colchetes', () => {

    test('1. Descrição simples sem tags', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page);

        // Abre a aba Novo
        await page.locator('#tabNovoBtn').click();
        await expect(page.locator('#tab-novo')).toHaveClass(/active/);

        // Preenche nova transação sem tags
        await page.locator('#i_descricao').fill('Mercado Sem Tags');
        await page.locator('#i_valor').fill('150.00');
        await page.locator('#i_categoria').selectOption('Alimentação');
        await page.locator('#i_tags').fill('');
        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Mercado Sem Tags');

        const txs = getTransactions();
        const created = txs.find(t => t.descricao === 'Mercado Sem Tags');
        expect(created).toBeDefined();
    });

    test('2. Descrição com uma tag inicial', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page);

        await page.locator('#tabNovoBtn').click();
        await expect(page.locator('#tab-novo')).toHaveClass(/active/);

        await page.locator('#i_descricao').fill('Farmácia Remédios');
        await page.locator('#i_valor').fill('80.00');
        await page.locator('#i_categoria').selectOption('Saúde');
        await page.locator('#i_tags').fill('Essencial');
        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('[Essencial] Farmácia Remédios');

        const txs = getTransactions();
        const created = txs.find(t => t.descricao.includes('Farmácia Remédios'));
        expect(created.descricao).toBe('[Essencial] Farmácia Remédios');
    });

    test('3. Descrição com múltiplas tags no início', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page);

        await page.locator('#tabNovoBtn').click();
        await expect(page.locator('#tab-novo')).toHaveClass(/active/);

        await page.locator('#i_descricao').fill('Supermercado Mensal');
        await page.locator('#i_valor').fill('450.00');
        await page.locator('#i_categoria').selectOption('Alimentação');
        await page.locator('#i_tags').fill('Essencial, Casa, Mensal');
        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('[Essencial, Casa, Mensal] Supermercado Mensal');

        const txs = getTransactions();
        const created = txs.find(t => t.descricao.includes('Supermercado Mensal'));
        expect(created.descricao).toBe('[Essencial, Casa, Mensal] Supermercado Mensal');
    });

    test('4. "Livro [Edição Especial]" preservado integralmente como descrição (sem tags)', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page);

        await page.locator('#tabNovoBtn').click();
        await expect(page.locator('#tab-novo')).toHaveClass(/active/);

        await page.locator('#i_descricao').fill('Livro [Edição Especial]');
        await page.locator('#i_valor').fill('120.00');
        await page.locator('#i_categoria').selectOption('Lazer');
        await page.locator('#i_tags').fill('');
        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Livro [Edição Especial]');

        const txs = getTransactions();
        const created = txs.find(t => t.descricao.includes('Livro'));
        expect(created.descricao).toBe('Livro [Edição Especial]');
    });

    test('5. "[Lazer] Jogo [Edição de Colecionador]" separa corretamente tag inicial e descrição', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page);

        await page.locator('#tabNovoBtn').click();
        await expect(page.locator('#tab-novo')).toHaveClass(/active/);

        await page.locator('#i_descricao').fill('Jogo [Edição de Colecionador]');
        await page.locator('#i_valor').fill('350.00');
        await page.locator('#i_categoria').selectOption('Lazer');
        await page.locator('#i_tags').fill('Lazer, Games');
        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('[Lazer, Games] Jogo [Edição de Colecionador]');

        const txs = getTransactions();
        const created = txs.find(t => t.descricao.includes('Edição de Colecionador'));
        expect(created.descricao).toBe('[Lazer, Games] Jogo [Edição de Colecionador]');
    });

    test('6. Edição de "Livro [Edição Especial]" preserva colchetes legítimos no formulário e no banco', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-livro-colchetes',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-01',
                    descricao: 'Livro [Edição Especial]',
                    valor: 120.00,
                    pagamento: 'PIX',
                    categoria: 'Lazer',
                    custo: 'Variável'
                }
            ]
        });

        // Clica em Editar
        await page.locator('#resumoExtratoTableBody tr').first().locator('button[title="Editar"]').click();

        // O campo descrição deve conter exatamente "Livro [Edição Especial]" e tags vazio
        await expect(page.locator('#i_descricao')).toHaveValue('Livro [Edição Especial]');
        await expect(page.locator('#i_tags')).toHaveValue('');

        // Altera apenas o valor
        await page.locator('#i_valor').fill('130.00');
        await page.locator('#btnSalvar').click();

        // Confirma que no resumo e no banco a descrição continua intacta com colchetes
        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Livro [Edição Especial]');

        const txs = getTransactions();
        const updated = txs.find(t => t.id === 'tx-livro-colchetes');
        expect(updated.descricao).toBe('Livro [Edição Especial]');
        expect(updated.valor).toBe(130);
    });

    test('7. Salvar novamente registro com tag não duplica prefixo de tags', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-jogo-tagged',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-01',
                    descricao: '[Lazer] Jogo [Edição de Colecionador]',
                    valor: 350.00,
                    pagamento: 'PIX',
                    categoria: 'Lazer',
                    custo: 'Variável'
                }
            ]
        });

        // Clica em Editar
        await page.locator('#resumoExtratoTableBody tr').first().locator('button[title="Editar"]').click();

        // O campo descrição deve conter "Jogo [Edição de Colecionador]" e tags "Lazer"
        await expect(page.locator('#i_descricao')).toHaveValue('Jogo [Edição de Colecionador]');
        await expect(page.locator('#i_tags')).toHaveValue('Lazer');

        // Salva sem alterações
        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('[Lazer] Jogo [Edição de Colecionador]');
        await expect(page.locator('#resumoExtratoTableBody')).not.toContainText('[Lazer] [Lazer]');

        const txs = getTransactions();
        const updated = txs.find(t => t.id === 'tx-jogo-tagged');
        expect(updated.descricao).toBe('[Lazer] Jogo [Edição de Colecionador]');
    });

    test('8. Remover tags ao editar preserva os colchetes legítimos da descrição', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-jogo-tagged',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-01',
                    descricao: '[Lazer] Jogo [Edição de Colecionador]',
                    valor: 350.00,
                    pagamento: 'PIX',
                    categoria: 'Lazer',
                    custo: 'Variável'
                }
            ]
        });

        await page.locator('#resumoExtratoTableBody tr').first().locator('button[title="Editar"]').click();

        // Limpa o campo de tags
        await page.locator('#i_tags').fill('');
        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Jogo [Edição de Colecionador]');
        await expect(page.locator('#resumoExtratoTableBody')).not.toContainText('[Lazer]');

        const txs = getTransactions();
        const updated = txs.find(t => t.id === 'tx-jogo-tagged');
        expect(updated.descricao).toBe('Jogo [Edição de Colecionador]');
    });

    test('9. Pesquisa na aba Resumo/Extrato encontra texto dentro de colchetes legítimos', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-1',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-01',
                    descricao: 'Livro [Edição Especial]',
                    valor: 120.00,
                    pagamento: 'PIX',
                    categoria: 'Lazer',
                    custo: 'Variável'
                },
                {
                    id: 'tx-2',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-02',
                    descricao: 'Supermercado Mensal',
                    valor: 200.00,
                    pagamento: 'PIX',
                    categoria: 'Alimentação',
                    custo: 'Variável'
                }
            ]
        });

        // Digita "Edição Especial" na busca do resumo
        await page.locator('#searchInput').fill('Edição Especial');

        const tbody = page.locator('#resumoExtratoTableBody');
        await expect(tbody).toContainText('Livro [Edição Especial]');
        await expect(tbody).not.toContainText('Supermercado Mensal');
    });

    test('10. Filtro dropdown por tag em Análise & Filtros reconhece apenas tags iniciais', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-1',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-01',
                    descricao: '[Trabalho] Teclado [RGB]',
                    valor: 250.00,
                    pagamento: 'PIX',
                    categoria: 'Eletrônicos',
                    custo: 'Variável'
                },
                {
                    id: 'tx-2',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-02',
                    descricao: 'Monitor [Dell]',
                    valor: 800.00,
                    pagamento: 'PIX',
                    categoria: 'Eletrônicos',
                    custo: 'Variável'
                }
            ]
        });

        // Navega para aba Análise de Gastos
        await page.getByRole('button', { name: /Análise de Gastos/i }).click();
        await expect(page.locator('#tab-analise')).toHaveClass(/active/);

        // O dropdown de tags #an_tag deve conter apenas "Trabalho" (e não "RGB" nem "Dell")
        const tagSelect = page.locator('#an_tag');
        await expect(tagSelect.locator('option[value="Trabalho"]')).toBeAttached();
        await expect(tagSelect.locator('option[value="RGB"]')).not.toBeAttached();
        await expect(tagSelect.locator('option[value="Dell"]')).not.toBeAttached();

        // Filtra por "Trabalho"
        await tagSelect.selectOption('Trabalho');

        const tbody = page.locator('#analiseTableBody');
        await expect(tbody).toContainText('Teclado [RGB]');
        await expect(tbody).not.toContainText('Monitor [Dell]');
    });

    test('11. Lançamento rápido Mobile preserva colchetes legítimos e tags', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page);

        // Abre o Lançador Rápido Celular
        const btnMobile = page.getByRole('button', { name: /Lançador Celular/i });
        await btnMobile.click();
        await expect(page.locator('#mobileQuickView')).toBeVisible();

        // Preenche dados no mobile
        await page.locator('#m_descricao').fill('Mousepad [Gamer XXL]');
        await page.locator('#m_valor').fill('90.00');
        await page.locator('#m_categoria').selectOption('Lazer');
        await page.locator('#m_tags').fill('Setup');

        await page.locator('#mobileQuickView button[type="submit"]').click();

        // Confirma que a modal mobile fechou
        await expect(page.locator('#mobileQuickView')).toBeHidden();

        // Verifica no resumo
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('[Setup] Mousepad [Gamer XXL]');

        const txs = getTransactions();
        const created = txs.find(t => t.descricao.includes('Gamer XXL'));
        expect(created.descricao).toBe('[Setup] Mousepad [Gamer XXL]');
    });

});
