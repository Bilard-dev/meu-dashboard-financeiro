// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');

test.describe('Faturas e Parcelas - Geração Dinâmica e Projeção', () => {

    test('1. Seletor de Faturas exibe opções relativas corretas para Agosto/2026', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_pagamento').dispatchEvent('change');

        await page.locator('#i_data').fill('2026-08-18');
        await page.locator('#i_data').dispatchEvent('change');

        const select = page.locator('#i_fatura_destino');
        const optAtual = select.locator('option[value="ATUAL"]');
        const optProx = select.locator('option[value="PROXIMA"]');

        await expect(optAtual).toHaveText(/Agosto\/2026/);
        await expect(optProx).toHaveText(/Setembro\/2026/);
    });

    test('2. Virada de Ano Dezembro/2026 -> Janeiro/2027 calcula sem erro', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_pagamento').dispatchEvent('change');

        await page.locator('#i_data').fill('2026-12-20');
        await page.locator('#i_data').dispatchEvent('change');

        const select = page.locator('#i_fatura_destino');
        const optAtual = select.locator('option[value="ATUAL"]');
        const optProx = select.locator('option[value="PROXIMA"]');
        const optJan27 = select.locator('option[value="2027-0"]');

        await expect(optAtual).toHaveText(/Dezembro\/2026/);
        await expect(optProx).toHaveText(/Janeiro\/2027/);
        await expect(optJan27).toBeAttached();
    });

    test('3. Geração dinâmica em datas de 2027 (Ex: Maio/2027)', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_pagamento').dispatchEvent('change');

        await page.locator('#i_data').fill('2027-05-15');
        await page.locator('#i_data').dispatchEvent('change');

        const select = page.locator('#i_fatura_destino');
        const optAtual = select.locator('option[value="ATUAL"]');
        const optProx = select.locator('option[value="PROXIMA"]');

        await expect(optAtual).toHaveText(/Maio\/2027/);
        await expect(optProx).toHaveText(/Junho\/2027/);
    });

    test('4. Seleção e persistência de fatura específica YYYY-M', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_pagamento').dispatchEvent('change');

        await page.locator('#i_data').fill('2026-08-18');
        await page.locator('#i_data').dispatchEvent('change');

        const select = page.locator('#i_fatura_destino');
        await select.selectOption('2026-10'); // Novembro/2026
        await expect(select).toHaveValue('2026-10');
    });

    test('5. Aba Parcelas / Fatura Cartão projeta faturas e compras parceladas', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // Acessa a aba de parcelas
        await page.getByRole('button', { name: 'Parcelas / Fatura Cartão' }).click();
        await expect(page.locator('#tab-parcelas')).toHaveClass(/active/);

        // Verifica se os KPIs de fatura selecionada e seguinte são renderizados
        await expect(page.locator('#kpi-title-fatura-selecionada')).toBeVisible();
        await expect(page.locator('#kpi-fatura-atual')).toBeVisible();
        await expect(page.locator('#kpi-fatura-proxima')).toBeVisible();

        // Verifica se o seletor de mês da fatura contém opções
        const faturaSelector = page.locator('#faturaMonthSelector');
        await expect(faturaSelector).toBeVisible();
        const optionsCount = await faturaSelector.locator('option').count();
        expect(optionsCount).toBeGreaterThan(0);
    });

    test('6. [PARCELAMENTOS 2.0] Nova compra parcelada 1/3 recebe grupo_parcela_id UUID válido', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // Cadastra nova compra de R$ 150 em 1/3 no Cartão Nubank
        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_data').fill('2026-08-18');
        await page.locator('#i_descricao').fill('Fone Bluetooth');
        await page.locator('#i_valor').fill('150.00');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_cartao').selectOption('Nubank');

        await page.locator('#i_parcela_select').selectOption('CUSTOM');
        await page.locator('#i_parcela_custom').fill('1/3');
        await page.locator('#i_categoria').selectOption('Lazer');

        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Fone Bluetooth');

        // Verifica nos dados que a transação foi salva com UUID válido
        const txGrupoId = await page.evaluate(() => {
            const tx = typeof globalData !== 'undefined' ? globalData.find(d => d.desc.includes('Fone Bluetooth')) : null;
            return tx ? tx.grupo_parcela_id : null;
        });

        expect(txGrupoId).not.toBeNull();
        expect(txGrupoId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    test('7. [PARCELAMENTOS 2.0] Compra RECORRENTE e à vista ficam com grupo_parcela_id = null', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // 1. Cadastra compra recorrente
        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_data').fill('2026-08-18');
        await page.locator('#i_descricao').fill('Spotify Premium');
        await page.locator('#i_valor').fill('34.90');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_cartao').selectOption('Nubank');
        await page.locator('#i_parcela_select').selectOption('RECORRENTE');
        await page.locator('#i_categoria').selectOption('Lazer');
        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Spotify Premium');

        // 2. Cadastra compra à vista no cartão
        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_data').fill('2026-08-18');
        await page.locator('#i_descricao').fill('Café Expresso');
        await page.locator('#i_valor').fill('12.00');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_cartao').selectOption('Nubank');
        await page.locator('#i_parcela_select').selectOption('À vista');
        await page.locator('#i_categoria').selectOption('Alimentação');
        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Café Expresso');

        const resultados = await page.evaluate(() => {
            const spotify = typeof globalData !== 'undefined' ? globalData.find(d => d.desc.includes('Spotify Premium')) : null;
            const cafe = typeof globalData !== 'undefined' ? globalData.find(d => d.desc.includes('Café Expresso')) : null;
            return {
                spotifyGrupo: spotify ? spotify.grupo_parcela_id : 'NOT_FOUND',
                cafeGrupo: cafe ? cafe.grupo_parcela_id : 'NOT_FOUND'
            };
        });

        expect(resultados.spotifyGrupo).toBeNull();
        expect(resultados.cafeGrupo).toBeNull();
    });

    test('8. [PARCELAMENTOS 2.0] Edição de compra 2.0 preserva exatamente o mesmo grupo_parcela_id', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // 1. Cadastra nova compra parcelada
        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_data').fill('2026-08-18');
        await page.locator('#i_descricao').fill('Cadeira Ergonômica');
        await page.locator('#i_valor').fill('400.00');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_cartao').selectOption('Nubank');
        await page.locator('#i_parcela_select').selectOption('CUSTOM');
        await page.locator('#i_parcela_custom').fill('1/4');
        await page.locator('#i_categoria').selectOption('Trabalho');
        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Cadeira Ergonômica');

        // Captura o UUID gerado
        const uuidOriginal = await page.evaluate(() => {
            const tx = typeof globalData !== 'undefined' ? globalData.find(d => d.desc.includes('Cadeira Ergonômica')) : null;
            return tx ? tx.grupo_parcela_id : null;
        });
        expect(uuidOriginal).not.toBeNull();

        // 2. Edita a transação pelo fluxo de interface
        const rowCadeira = page.locator('#resumoExtratoTableBody tr:has-text("Cadeira Ergonômica")');
        await rowCadeira.locator('button[title="Editar"]').click();
        await expect(page.locator('#formTitle')).toHaveText(/Editar Transação/i);

        // Altera a descrição e salva
        await page.locator('#i_descricao').fill('Cadeira Ergonômica Office');
        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Cadeira Ergonômica Office');

        // Confirma que o grupo_parcela_id continuou rigorosamente o mesmo
        const uuidAposEdicao = await page.evaluate(() => {
            const tx = typeof globalData !== 'undefined' ? globalData.find(d => d.desc.includes('Cadeira Ergonômica Office')) : null;
            return tx ? tx.grupo_parcela_id : null;
        });

        expect(uuidAposEdicao).toBe(uuidOriginal);
    });

    test('9. [PARCELAMENTOS 2.0] Edição de registro legado mantém grupo_parcela_id = null', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // 'tx-005-parcelado' ('Notebook Trabalho') é um registro legado sem grupo_parcela_id
        const rowNotebook = page.locator('#resumoExtratoTableBody tr:has-text("Notebook Trabalho")');
        await rowNotebook.locator('button[title="Editar"]').click();
        await expect(page.locator('#formTitle')).toHaveText(/Editar Transação/i);

        // Edita a descrição e salva
        await page.locator('#i_descricao').fill('Notebook Trabalho Dell');
        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Notebook Trabalho Dell');

        const legadoAposEdicao = await page.evaluate(() => {
            const tx = typeof globalData !== 'undefined' ? globalData.find(d => d.id === 'tx-005-parcelado') : null;
            return tx ? tx.grupo_parcela_id : 'NOT_FOUND';
        });

        expect(legadoAposEdicao).toBeNull();
    });

    test('10. [PARCELAMENTOS 2.0] Duas compras idênticas recebem UUIDs diferentes e coexistem na projeção', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // 1. Cadastra Compra 1: "Mercado Livre", R$ 100.00, Nubank, 1/3
        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_data').fill('2026-08-18');
        await page.locator('#i_descricao').fill('Mercado Livre');
        await page.locator('#i_valor').fill('100.00');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_cartao').selectOption('Nubank');
        await page.locator('#i_parcela_select').selectOption('CUSTOM');
        await page.locator('#i_parcela_custom').fill('1/3');
        await page.locator('#i_categoria').selectOption('Lazer');
        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('Mercado Livre');

        // 2. Cadastra Compra 2: EXATAMENTE IDÊNTICA (mesmo nome, valor, cartão, data e parcela)
        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_data').fill('2026-08-18');
        await page.locator('#i_descricao').fill('Mercado Livre');
        await page.locator('#i_valor').fill('100.00');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_cartao').selectOption('Nubank');
        await page.locator('#i_parcela_select').selectOption('CUSTOM');
        await page.locator('#i_parcela_custom').fill('1/3');
        await page.locator('#i_categoria').selectOption('Lazer');
        await page.locator('#btnSalvar').click();

        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody tr:has-text("Mercado Livre")')).toHaveCount(2);

        // 3. Verifica no banco/dados que receberam UUIDs distintos
        const compras = await page.evaluate(() => {
            const txs = typeof globalData !== 'undefined' ? globalData.filter(d => d.desc === 'Mercado Livre') : [];
            return txs.map(t => t.grupo_parcela_id);
        });

        expect(compras.length).toBe(2);
        expect(compras[0]).not.toBeNull();
        expect(compras[1]).not.toBeNull();
        expect(compras[0]).not.toBe(compras[1]);

        // 4. Acessa a aba "Parcelas / Fatura Cartão" e confirma que AMBAS aparecem na tabela sem sobregravação
        await page.getByRole('button', { name: 'Parcelas / Fatura Cartão' }).click();
        await expect(page.locator('#tab-parcelas')).toHaveClass(/active/);

        const rowsML = page.locator('#parcelasTableBody tr:has-text("Mercado Livre")');
        await expect(rowsML).toHaveCount(2);
    });

});
