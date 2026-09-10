// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');
const {
    mockTransactions,
    mockCategorias,
    mockSubcategorias,
    mockCartoes
} = require('./fixtures/mockData');

test.describe('Fase 4.0 — M4.0-C: Evolução do Lançamento Mobile (Quick → Completo sem perda de dados)', () => {

    test('1. FAB (+) abre o Lançador Rápido sem alterar Hash da URL', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        await page.goto('#/dashboard');
        const initialUrl = page.url();

        await page.locator('#bnav-fab').click();

        const quickModal = page.locator('#mobileQuickView');
        await expect(quickModal).toBeVisible();
        expect(page.url()).toBe(initialUrl);

        await quickModal.getByRole('button', { name: /Fechar/i }).click();
        await expect(quickModal).toBeHidden();
    });

    test('2. Quick continua salvando despesa simples à vista (PIX) com sucesso', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        await page.locator('#bnav-fab').click();
        await page.locator('#m_descricao').fill('Almoço Executivo Mobile');
        await page.locator('#m_valor').fill('38.50');
        await page.locator('#m_categoria').selectOption('Alimentação');
        await page.locator('#m_pagamento').selectOption('PIX');

        await page.locator('#btnQuickSalvar').click();

        await expect(page.locator('#mobileQuickView')).toBeHidden();
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Almoço Executivo Mobile');
    });

    test('3. Quick continua suportando Salvar e Lançar Outro, limpando os campos e mantendo o modal aberto', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        await page.locator('#bnav-fab').click();
        await page.locator('#m_descricao').fill('Item 1 Lote');
        await page.locator('#m_valor').fill('10.00');
        await page.locator('#m_categoria').selectOption('Alimentação');

        await page.locator('#btnQuickSalvarOutro').click();

        // Modal permanece aberto
        await expect(page.locator('#mobileQuickView')).toBeVisible();

        // Campos foram limpos
        await expect(page.locator('#m_descricao')).toHaveValue('');
        await expect(page.locator('#m_valor')).toHaveValue('');

        // Lança o segundo item e fecha
        await page.locator('#m_descricao').fill('Item 2 Lote');
        await page.locator('#m_valor').fill('20.00');
        await page.locator('#btnQuickSalvar').click();

        await expect(page.locator('#mobileQuickView')).toBeHidden();
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Item 1 Lote');
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Item 2 Lote');
    });

    test('4. Clicar em Mais Opções no Quick NÃO salva automaticamente nada', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        await page.locator('#bnav-fab').click();
        await page.locator('#m_descricao').fill('Transação Rascunho Não Salva');
        await page.locator('#m_valor').fill('99.90');

        const txCountBefore = await page.evaluate(() => window.globalData ? window.globalData.length : 0);

        // Clica em Mais Opções
        await page.locator('#btnQuickMaisOpcoes').click();

        // Mudou para o formulário completo
        await expect(page.locator('#tab-novo')).toBeVisible();
        await expect(page).toHaveURL(/#\/novo/);

        // Quantidade de transações não mudou
        const txCountAfter = await page.evaluate(() => window.globalData ? window.globalData.length : 0);
        expect(txCountAfter).toBe(txCountBefore);
    });

    test('5. Preservação integral de campos simples (Descrição, Valor, Tags, Data) de Quick para Full', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        await page.locator('#bnav-fab').click();
        await page.locator('#m_descricao').fill('Supermercado Semanal');
        await page.locator('#m_valor').fill('245.80');
        await page.locator('#m_tags').fill('Família, Casa');
        await page.locator('#m_data').fill('2026-09-15');

        await page.locator('#btnQuickMaisOpcoes').click();

        await expect(page.locator('#tab-novo')).toBeVisible();
        await expect(page.locator('#i_descricao')).toHaveValue('Supermercado Semanal');
        await expect(page.locator('#i_valor')).toHaveValue('245.80');
        await expect(page.locator('#i_tags')).toHaveValue('Família, Casa');
        await expect(page.locator('#i_data')).toHaveValue('2026-09-15');
    });

    test('6. Preservação de Categoria e Subcategoria dinâmica de Quick para Full', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        await page.locator('#bnav-fab').click();
        await page.locator('#m_descricao').fill('Consulta Médica');
        await page.locator('#m_valor').fill('350.00');

        // Seleciona Categoria
        await page.locator('#m_categoria').selectOption('Saúde');
        await page.locator('#m_categoria').dispatchEvent('change');

        // Seleciona Subcategoria
        await page.locator('#m_subcategoria').selectOption('Farmácia');

        await page.locator('#btnQuickMaisOpcoes').click();

        await expect(page.locator('#tab-novo')).toBeVisible();
        await expect(page.locator('#i_categoria')).toHaveValue('Saúde');
        await expect(page.locator('#i_subcategoria')).toHaveValue('Farmácia');
    });

    test('7. Preservação de Cartão de Crédito, Fatura Destino e Parcelamento (ex: 1/3) de Quick para Full', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        await page.locator('#bnav-fab').click();
        await page.locator('#m_descricao').fill('Smart TV 4K');
        await page.locator('#m_valor').fill('800.00');
        await page.locator('#m_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#m_pagamento').dispatchEvent('change');

        await page.locator('#m_cartao').selectOption({ index: 1 });
        const selectedCartao = await page.locator('#m_cartao').inputValue();

        await page.locator('#m_parcela_select').selectOption('1/3');

        await page.locator('#btnQuickMaisOpcoes').click();

        await expect(page.locator('#tab-novo')).toBeVisible();
        await expect(page.locator('#i_pagamento')).toHaveValue('Cartão de Crédito');
        await expect(page.locator('#i_cartao')).toHaveValue(selectedCartao);
        await expect(page.locator('#i_parcela_select')).toHaveValue('1/3');
        await expect(page.locator('#i_parcela_custom')).toBeHidden();
    });

    test('8. Preservação de Parcela Customizada (CUSTOM ex: 1/12) de Quick para Full', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        await page.locator('#bnav-fab').click();
        await page.locator('#m_descricao').fill('Notebook Gamer');
        await page.locator('#m_valor').fill('500.00');
        await page.locator('#m_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#m_pagamento').dispatchEvent('change');

        await page.locator('#m_cartao').selectOption({ index: 1 });
        await page.locator('#m_parcela_select').selectOption('CUSTOM');
        await page.locator('#m_parcela_custom').fill('1/12');

        await page.locator('#btnQuickMaisOpcoes').click();

        await expect(page.locator('#tab-novo')).toBeVisible();
        await expect(page.locator('#i_pagamento')).toHaveValue('Cartão de Crédito');
        await expect(page.locator('#i_parcela_select')).toHaveValue('CUSTOM');
        await expect(page.locator('#i_parcela_custom')).toBeVisible();
        await expect(page.locator('#i_parcela_custom')).toHaveValue('1/12');
    });

    test('9. Preservação de Assinatura Recorrente no cartão de Quick para Full', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        await page.locator('#bnav-fab').click();
        await page.locator('#m_descricao').fill('Assinatura Cloud');
        await page.locator('#m_valor').fill('49.90');
        await page.locator('#m_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#m_pagamento').dispatchEvent('change');

        await page.locator('#m_cartao').selectOption({ index: 1 });
        await page.locator('#m_parcela_select').selectOption('RECORRENTE');

        await page.locator('#btnQuickMaisOpcoes').click();

        await expect(page.locator('#tab-novo')).toBeVisible();
        await expect(page.locator('#i_pagamento')).toHaveValue('Cartão de Crédito');
        await expect(page.locator('#i_parcela_select')).toHaveValue('RECORRENTE');
    });

    test('10. Full Form abre inicialmente como Despesa e permite ao usuário alterar para Receita ou Saque', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        await page.locator('#bnav-fab').click();
        await page.locator('#m_descricao').fill('Reembolso de Viagem');
        await page.locator('#m_valor').fill('120.00');

        await page.locator('#btnQuickMaisOpcoes').click();

        await expect(page.locator('#i_tipo')).toHaveValue('Despesa');

        // Usuário altera para Receita
        await page.locator('#i_tipo').selectOption('Receita');
        await page.locator('#i_tipo').dispatchEvent('change');
        await expect(page.locator('#i_tipo')).toHaveValue('Receita');

        // Submete a Receita
        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toBeVisible();
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Reembolso de Viagem');
    });

    test('11. Cancelar ou navegar para outra aba após transição Quick → Full não salva nada', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        const initialLength = await page.evaluate(() => window.globalData ? window.globalData.length : 0);

        await page.locator('#bnav-fab').click();
        await page.locator('#m_descricao').fill('Transação Descartada');
        await page.locator('#m_valor').fill('77.00');

        await page.locator('#btnQuickMaisOpcoes').click();

        // Usuário clica em Início na bottom nav sem salvar
        await page.locator('#bnav-resumo').click();
        await expect(page.locator('#tab-resumo')).toBeVisible();

        const currentLength = await page.evaluate(() => window.globalData ? window.globalData.length : 0);
        expect(currentLength).toBe(initialLength);
        await expect(page.locator('#resumoExtratoTableBody')).not.toContainText('Transação Descartada');
    });

    test('12. Edição no mobile abre o formulário Completo (#tab-novo), nunca o Quick', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        // Clica no botão editar da primeira transação da tabela
        const editBtn = page.locator('button[title="Editar"]').first();
        await expect(editBtn).toBeVisible();
        await editBtn.click();

        // Deve abrir a aba novo em modo de edição
        await expect(page.locator('#tab-novo')).toBeVisible();
        await expect(page.locator('#mobileQuickView')).toBeHidden();
        await expect(page.locator('#formTitle')).toContainText('Editar');
        await expect(page.locator('#btnCancelarEdicao')).toBeVisible();
    });

    test('13. Submissão bem-sucedida no Full limpa estado e redireciona', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        await page.locator('#bnav-fab').click();
        await page.locator('#m_descricao').fill('Manutenção Carro');
        await page.locator('#m_valor').fill('420.00');

        await page.locator('#btnQuickMaisOpcoes').click();

        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toBeVisible();
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Manutenção Carro');
    });

    test('14. Abrir um novo Quick após salvar ou transicionar inicia com campos limpos e estado zerado', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        // Abre quick e digita dados
        await page.locator('#bnav-fab').click();
        await page.locator('#m_descricao').fill('Teste Limpeza');
        await page.locator('#m_valor').fill('55.00');

        // Fecha pelo botão
        await page.locator('#mobileQuickView').getByRole('button', { name: /Fechar/i }).click();
        await expect(page.locator('#mobileQuickView')).toBeHidden();

        // Abre novamente o Quick
        await page.locator('#bnav-fab').click();
        await expect(page.locator('#m_descricao')).toHaveValue('');
        await expect(page.locator('#m_valor')).toHaveValue('');
        await expect(page.locator('#m_tags')).toHaveValue('');
    });

    test('15. Fechamento do Quick via tecla ESC e via clique no backdrop', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        // 15.1 Fechamento por tecla Escape
        await page.locator('#bnav-fab').click();
        await expect(page.locator('#mobileQuickView')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('#mobileQuickView')).toBeHidden();

        // 15.2 Fechamento por clique no overlay
        await page.locator('#bnav-fab').click();
        await expect(page.locator('#mobileQuickView')).toBeVisible();
        await page.locator('#mobileQuickOverlay').click({ position: { x: 5, y: 5 } });
        await expect(page.locator('#mobileQuickView')).toBeHidden();
    });

    test('16. Responsividade e ausência de overflow em 320px (Ultra Small)', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 568 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        await page.locator('#bnav-fab').click();
        await expect(page.locator('#mobileQuickView')).toBeVisible();

        const scroll = await page.evaluate(() => ({
            docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            bodyOverflow: document.body.scrollWidth > document.body.clientWidth + 1
        }));

        expect(scroll.docOverflow).toBe(false);
        expect(scroll.bodyOverflow).toBe(false);

        // Testa transição para Full em 320px
        await page.locator('#m_descricao').fill('Item 320px');
        await page.locator('#m_valor').fill('15.00');
        await page.locator('#btnQuickMaisOpcoes').click();

        await expect(page.locator('#tab-novo')).toBeVisible();
        await expect(page.locator('#i_descricao')).toHaveValue('Item 320px');
    });

    test('17. Experiência Desktop: botão Novo Registro abre diretamente o formulário completo', async ({ page }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        await page.locator('#tabNovoBtn').click();
        await expect(page.locator('#tab-novo')).toBeVisible();
        await expect(page.locator('#mobileQuickView')).toBeHidden();
        await expect(page).toHaveURL(/#\/novo/);
    });

    test('18. Bottom Nav indica estado ativo correto ao transicionar Quick → Full (Mais ativo)', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setupAuthenticatedApp(page, {
            transactions: mockTransactions,
            categorias: mockCategorias,
            subcategorias: mockSubcategorias,
            cartoes: mockCartoes
        });

        await page.locator('#bnav-fab').click();
        await page.locator('#btnQuickMaisOpcoes').click();

        await expect(page.locator('#tab-novo')).toBeVisible();
        // A aba 'novo' é uma rota secundária representada por 'Mais' na Bottom Nav
        await expect(page.locator('#bnav-mais')).toHaveClass(/active/);
    });

});
