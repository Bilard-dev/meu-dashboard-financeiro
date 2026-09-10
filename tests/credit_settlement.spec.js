const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');
const { mockUser } = require('./fixtures/mockData');

test.describe('Fase 3.5 — Liquidação Antecipada do Crédito (Early Credit Settlement)', () => {

    test('1. Deve renderizar botão de quitação antecipada para lançamentos em aberto no cartão', async ({ page }) => {
        const transactions = [
            {
                id: 'tx-card-1',
                user_id: mockUser.id,
                tipo: 'Despesa',
                data: '2026-08-10',
                descricao: 'Compra Mercado Cartão',
                categoria: 'Alimentação',
                subcategoria: 'Supermercado',
                valor: 350.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: 'À vista',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            }
        ];

        await setupAuthenticatedApp(page, { transactions });

        // Navega para aba de faturas
        await page.getByRole('button', { name: 'Parcelas / Fatura Cartão' }).click();
        await expect(page.locator('#tab-parcelas')).toHaveClass(/active/);

        // Seleciona competência 2026-7 (Agosto/2026)
        await page.selectOption('#faturaMonthSelector', '2026-7');

        // Valida presença da linha com status aberto e botão de quitação
        const row = page.locator('#parcelasTableBody tr').first();
        await expect(row).toBeVisible();
        await expect(row.locator('.tag-open')).toHaveText(/Fatura Agosto\/2026/);
        await expect(row.locator('.settle-btn')).toBeVisible();
    });

    test('2. Deve abrir o modal de quitação, preencher dados e liquidar compra à vista via PIX', async ({ page }) => {
        const transactions = [
            {
                id: 'tx-card-2',
                user_id: mockUser.id,
                tipo: 'Despesa',
                data: '2026-08-15',
                descricao: 'Smartphone Loja X',
                categoria: 'Eletrônicos',
                subcategoria: 'Celular',
                valor: 1200.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'XP',
                parcela: 'À vista',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            }
        ];

        await setupAuthenticatedApp(page, { transactions });

        await page.getByRole('button', { name: 'Parcelas / Fatura Cartão' }).click();
        await page.selectOption('#faturaMonthSelector', '2026-7');

        // KPI inicial: R$ 1.200,00 aberto
        await expect(page.locator('#kpi-fatura-atual')).toHaveText(/1\.200,00/);

        // Clica no botão de quitação
        await page.locator('.settle-btn').click();

        // Modal deve estar visível com dados preenchidos
        await expect(page.locator('#creditSettlementModal')).toBeVisible();
        await expect(page.locator('#settleItemDesc')).toHaveText('Smartphone Loja X');
        await expect(page.locator('#settleItemValor')).toHaveText(/1\.200,00/);
        await expect(page.locator('#settleFormaLiquidacao')).toHaveValue('PIX');

        // Confirma a quitação
        await page.click('#btnConfirmSettlement');

        // Modal fecha e status atualiza
        await expect(page.locator('#creditSettlementModal')).toBeHidden();
        const row = page.locator('#parcelasTableBody tr').first();
        await expect(row.locator('.tag-done')).toHaveText(/Quitada \(PIX\)/);
        await expect(row.locator('.settle-revert-btn')).toBeVisible();

        // KPI de fatura atual deve baixar para R$ 0,00
        await expect(page.locator('#kpi-fatura-atual')).toHaveText(/0,00/);
    });

    test('3. Deve reverter a quitação e restaurar a obrigação como pendente', async ({ page }) => {
        const transactions = [
            {
                id: 'tx-card-3',
                user_id: mockUser.id,
                tipo: 'Despesa',
                data: '2026-08-10',
                descricao: 'Mesa de Escritório',
                categoria: 'Casa',
                subcategoria: 'Móveis',
                valor: 500.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: 'À vista',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            }
        ];

        const settlements = [
            {
                id: 'settle-mesa',
                user_id: mockUser.id,
                transacao_id: 'tx-card-3',
                parcela_numero: 1,
                valor: 500.00,
                data_liquidacao: '2026-08-11',
                forma_liquidacao: 'PIX',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
        ];

        await setupAuthenticatedApp(page, { transactions, settlements });

        await page.getByRole('button', { name: 'Parcelas / Fatura Cartão' }).click();
        await page.selectOption('#faturaMonthSelector', '2026-7');

        // Inicialmente quitada
        const row = page.locator('#parcelasTableBody tr').first();
        await expect(row.locator('.tag-done')).toHaveText(/Quitada \(PIX\)/);
        await expect(page.locator('#kpi-fatura-atual')).toHaveText(/0,00/);

        // Clica para reverter
        await page.locator('.settle-revert-btn').click();

        // Volta a constar como pendente
        await expect(row.locator('.tag-open')).toHaveText(/Fatura Agosto\/2026/);
        await expect(row.locator('.settle-btn')).toBeVisible();
        await expect(page.locator('#kpi-fatura-atual')).toHaveText(/500,00/);
    });

    test('4. Deve persistir quitações pré-existentes no carregamento da aplicação', async ({ page }) => {
        const transactions = [
            {
                id: 'tx-parc-4',
                user_id: mockUser.id,
                tipo: 'Despesa',
                data: '2026-08-01',
                descricao: 'Curso Online',
                categoria: 'Educação',
                subcategoria: 'Cursos',
                valor: 200.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'Inter',
                parcela: '1/3',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            }
        ];

        const settlements = [
            {
                id: 'settle-curso-1',
                user_id: mockUser.id,
                transacao_id: 'tx-parc-4',
                parcela_numero: 1,
                valor: 200.00,
                data_liquidacao: '2026-08-02',
                forma_liquidacao: 'PIX',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
        ];

        await setupAuthenticatedApp(page, { transactions, settlements });

        await page.getByRole('button', { name: 'Parcelas / Fatura Cartão' }).click();
        await page.selectOption('#faturaMonthSelector', '2026-7');

        // Parcela 1/3 quitada em Agosto
        const rowAgo = page.locator('#parcelasTableBody tr').first();
        await expect(rowAgo.locator('.tag-done')).toHaveText(/Quitada \(PIX\)/);
        await expect(page.locator('#kpi-fatura-atual')).toHaveText(/0,00/);
        await expect(page.locator('#kpi-fatura-proxima')).toHaveText(/200,00/); // 2/3 pendente

        // Seleciona Setembro/2026 (2/3 pendente)
        await page.selectOption('#faturaMonthSelector', '2026-8');
        const rowSet = page.locator('#parcelasTableBody tr').first();
        await expect(rowSet.locator('.tag-open')).toHaveText(/Fatura Setembro\/2026/);
        await expect(rowSet.locator('.settle-btn')).toBeVisible();
        await expect(page.locator('#kpi-fatura-atual')).toHaveText(/200,00/);
    });

    test('5. Bloquear alteração de valor e dados financeiros em transação com liquidação ativa', async ({ page }) => {
        const transactions = [
            {
                id: 'tx-card-guard',
                user_id: mockUser.id,
                tipo: 'Despesa',
                data: '2026-08-10',
                descricao: 'Monitor Gamer',
                categoria: 'Trabalho',
                subcategoria: 'Equipamentos',
                valor: 800.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: 'À vista',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            }
        ];
        const settlements = [
            {
                id: 'settle-mon',
                user_id: mockUser.id,
                transacao_id: 'tx-card-guard',
                parcela_numero: 1,
                valor: 800.00,
                status: 'ATIVA',
                data_liquidacao: '2026-08-11',
                forma_liquidacao: 'PIX',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
        ];

        await setupAuthenticatedApp(page, { transactions, settlements });
        await page.selectOption('#monthSelector', '2026-7');

        // Localiza a transação na tabela do Resumo e clica em Editar
        const editBtn = page.locator('tr:has-text("Monitor Gamer") button[title="Editar"]').first();
        await editBtn.click();
        await expect(page.locator('#tab-novo')).toHaveClass(/active/);

        // Tenta alterar valor de 800 para 900
        await page.locator('#i_valor').fill('900');
        await page.locator('#btnSalvar').click();

        // Toast de erro informando que precisa desfazer a quitação
        await expect(page.locator('.toast')).toContainText('Esta compra possui parcelas quitadas antecipadamente');
    });

    test('6. Bloquear exclusão direta de transação com liquidação ativa', async ({ page }) => {
        const transactions = [
            {
                id: 'tx-card-del-guard',
                user_id: mockUser.id,
                tipo: 'Despesa',
                data: '2026-08-10',
                descricao: 'Headset Pro',
                categoria: 'Trabalho',
                subcategoria: 'Equipamentos',
                valor: 400.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: 'À vista',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            }
        ];
        const settlements = [
            {
                id: 'settle-head',
                user_id: mockUser.id,
                transacao_id: 'tx-card-del-guard',
                parcela_numero: 1,
                valor: 400.00,
                status: 'ATIVA',
                data_liquidacao: '2026-08-11',
                forma_liquidacao: 'PIX',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
        ];

        await setupAuthenticatedApp(page, { transactions, settlements, autoAcceptDialogs: true });
        await page.selectOption('#monthSelector', '2026-7');

        // Localiza a transação na tabela do Resumo e clica em Excluir
        const delBtn = page.locator('tr:has-text("Headset Pro") button[title="Excluir"]').first();
        await delBtn.click();

        // Toast de bloqueio de exclusão
        await expect(page.locator('.toast')).toContainText('Não é possível excluir esta compra pois ela possui quitações antecipadas ativas');
    });

});
