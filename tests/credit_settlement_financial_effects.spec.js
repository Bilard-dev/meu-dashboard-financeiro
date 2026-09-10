const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');
const { mockUser } = require('./fixtures/mockData');

test.describe('Fase 3.5 — Efeitos Financeiros da Liquidação Antecipada via PIX / Meios de Pagamento', () => {

    test('1. Compra de R$ 600 no Cartão quitada via PIX: Despesa total = 600, PIX = 600, Cartão = 0', async ({ page }) => {
        const transactions = [
            {
                id: 'tx-card-effect-1',
                user_id: mockUser.id,
                tipo: 'Despesa',
                data: '2026-08-10',
                descricao: 'Compra Monitor Cartão',
                categoria: 'Equipamentos',
                subcategoria: 'Hardware',
                valor: 600.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: 'À vista',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            }
        ];

        await setupAuthenticatedApp(page, { transactions, autoAcceptDialogs: true });
        await page.selectOption('#monthSelector', '2026-7');

        // Estado inicial no Resumo antes da quitação:
        // Despesas totais = R$ 600,00, Detalhe = Cartão de Crédito R$ 600,00
        await expect(page.locator('#kpi-despesas')).toHaveText(/600,00/);
        await expect(page.locator('#kpi-despesas-detalhes')).toContainText('Cartão de Crédito');
        await expect(page.locator('#kpi-despesas-detalhes')).toContainText('600,00');

        // Navega para aba de faturas
        await page.getByRole('button', { name: 'Parcelas / Fatura Cartão' }).click();
        await page.selectOption('#faturaMonthSelector', '2026-7');
        await expect(page.locator('#kpi-fatura-atual')).toHaveText(/600,00/);

        // Executa a quitação via PIX com data no mesmo mês da fatura (Agosto/2026)
        await page.locator('.settle-btn').click();
        await expect(page.locator('#creditSettlementModal')).toBeVisible();
        await expect(page.locator('#settleItemValor')).toHaveText(/600,00/);
        await page.locator('#settleDataLiquidacao').fill('2026-08-11');
        await expect(page.locator('#settleFormaLiquidacao')).toHaveValue('PIX');
        await page.click('#btnConfirmSettlement');
        await expect(page.locator('#creditSettlementModal')).toBeHidden();

        // Na fatura, o status é Quitada e a obrigação do cartão baixa para 0
        const row = page.locator('#parcelasTableBody tr').first();
        await expect(row.locator('.tag-done')).toHaveText(/Quitada \(PIX\)/);
        await expect(page.locator('#kpi-fatura-atual')).toHaveText(/0,00/);

        // Volta ao Resumo / Dashboard
        await page.getByRole('button', { name: 'Resumo' }).click();

        // Despesas totais continuam exatamente R$ 600,00 (NUNCA R$ 1.200,00 — imunidade contábil)
        await expect(page.locator('#kpi-despesas')).toHaveText(/600,00/);

        // Detalhes de despesas agora mostram PIX R$ 600,00 e Cartão de Crédito R$ 0,00 (ou ausente)
        await expect(page.locator('#kpi-despesas-detalhes')).toContainText('PIX');
        await expect(page.locator('#kpi-despesas-detalhes')).toContainText('600,00');
        await expect(page.locator('#kpi-despesas-detalhes')).not.toContainText('Cartão de Crédito');
    });

    test('2. Reversão da quitação restaura obrigação no Cartão e remove saída em PIX', async ({ page }) => {
        const transactions = [
            {
                id: 'tx-card-effect-2',
                user_id: mockUser.id,
                tipo: 'Despesa',
                data: '2026-08-10',
                descricao: 'Smartphone Teste',
                categoria: 'Eletrônicos',
                subcategoria: 'Celular',
                valor: 800.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'XP',
                parcela: 'À vista',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            }
        ];

        const settlements = [
            {
                id: 'settle-rev-test',
                user_id: mockUser.id,
                transacao_id: 'tx-card-effect-2',
                parcela_numero: 1,
                valor: 800.00,
                status: 'ATIVA',
                data_liquidacao: '2026-08-11',
                forma_liquidacao: 'PIX',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
        ];

        await setupAuthenticatedApp(page, { transactions, settlements, autoAcceptDialogs: true });
        await page.selectOption('#monthSelector', '2026-7');

        // Estado com quitação ativa: Despesa 800, PIX 800
        await expect(page.locator('#kpi-despesas')).toHaveText(/800,00/);
        await expect(page.locator('#kpi-despesas-detalhes')).toContainText('PIX');
        await expect(page.locator('#kpi-despesas-detalhes')).toContainText('800,00');

        // Navega para Fatura e reverte
        await page.getByRole('button', { name: 'Parcelas / Fatura Cartão' }).click();
        await page.selectOption('#faturaMonthSelector', '2026-7');
        await expect(page.locator('#kpi-fatura-atual')).toHaveText(/0,00/);

        await page.locator('.settle-revert-btn').click();

        // Fatura volta para R$ 800,00
        await expect(page.locator('#kpi-fatura-atual')).toHaveText(/800,00/);

        // Volta ao Resumo
        await page.getByRole('button', { name: 'Resumo' }).click();

        // Despesas = R$ 800,00, Detalhes = Cartão de Crédito R$ 800,00 e sem PIX
        await expect(page.locator('#kpi-despesas')).toHaveText(/800,00/);
        await expect(page.locator('#kpi-despesas-detalhes')).toContainText('Cartão de Crédito');
        await expect(page.locator('#kpi-despesas-detalhes')).toContainText('800,00');
        await expect(page.locator('#kpi-despesas-detalhes')).not.toContainText('PIX');
    });

    test('3. Quitação de 1 Parcela em compra 3x R$ 200: isolamento por competência e parcela', async ({ page }) => {
        const transactions = [
            {
                id: 'tx-parc-1',
                user_id: mockUser.id,
                grupo_parcela_id: 'grp-curso-3x',
                tipo: 'Despesa',
                data: '2026-08-01',
                descricao: 'Curso Design 3x',
                categoria: 'Educação',
                subcategoria: 'Cursos',
                valor: 200.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: '1/3',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            },
            {
                id: 'tx-parc-2',
                user_id: mockUser.id,
                grupo_parcela_id: 'grp-curso-3x',
                tipo: 'Despesa',
                data: '2026-09-01',
                descricao: 'Curso Design 3x',
                categoria: 'Educação',
                subcategoria: 'Cursos',
                valor: 200.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: '2/3',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            },
            {
                id: 'tx-parc-3',
                user_id: mockUser.id,
                grupo_parcela_id: 'grp-curso-3x',
                tipo: 'Despesa',
                data: '2026-10-01',
                descricao: 'Curso Design 3x',
                categoria: 'Educação',
                subcategoria: 'Cursos',
                valor: 200.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: '3/3',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            }
        ];

        // Quita apenas a parcela 1 em Agosto
        const settlements = [
            {
                id: 'settle-parc-1',
                user_id: mockUser.id,
                transacao_id: 'tx-parc-1',
                grupo_parcela_id: 'grp-curso-3x',
                parcela_numero: 1,
                valor: 200.00,
                status: 'ATIVA',
                data_liquidacao: '2026-08-05',
                forma_liquidacao: 'PIX',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
        ];

        await setupAuthenticatedApp(page, { transactions, settlements, autoAcceptDialogs: true });

        // Agosto (2026-7): Parcela 1/3 quitada via PIX -> Despesa 200, PIX 200, Cartão 0
        await page.selectOption('#monthSelector', '2026-7');
        await expect(page.locator('#kpi-despesas')).toHaveText(/200,00/);
        await expect(page.locator('#kpi-despesas-detalhes')).toContainText('PIX');
        await expect(page.locator('#kpi-despesas-detalhes')).toContainText('200,00');
        await expect(page.locator('#kpi-despesas-detalhes')).not.toContainText('Cartão de Crédito');

        // Setembro (2026-8): Parcela 2/3 pendente -> Despesa 200, Cartão 200, PIX 0
        await page.selectOption('#monthSelector', '2026-8');
        await expect(page.locator('#kpi-despesas')).toHaveText(/200,00/);
        await expect(page.locator('#kpi-despesas-detalhes')).toContainText('Cartão de Crédito');
        await expect(page.locator('#kpi-despesas-detalhes')).toContainText('200,00');
        await expect(page.locator('#kpi-despesas-detalhes')).not.toContainText('PIX');
    });

    test('4. Múltiplos cartões: quitação em um cartão não altera a obrigação do outro', async ({ page }) => {
        const transactions = [
            {
                id: 'tx-card-nu',
                user_id: mockUser.id,
                tipo: 'Despesa',
                data: '2026-08-10',
                descricao: 'Compra Nubank',
                categoria: 'Lazer',
                subcategoria: 'Cinema',
                valor: 300.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: 'À vista',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            },
            {
                id: 'tx-card-xp',
                user_id: mockUser.id,
                tipo: 'Despesa',
                data: '2026-08-12',
                descricao: 'Compra XP',
                categoria: 'Serviços',
                subcategoria: 'Assinaturas',
                valor: 200.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'XP',
                parcela: 'À vista',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            }
        ];

        // Quita apenas o Nubank via PIX
        const settlements = [
            {
                id: 'settle-nu',
                user_id: mockUser.id,
                transacao_id: 'tx-card-nu',
                parcela_numero: 1,
                valor: 300.00,
                status: 'ATIVA',
                data_liquidacao: '2026-08-15',
                forma_liquidacao: 'PIX',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
        ];

        await setupAuthenticatedApp(page, { transactions, settlements, autoAcceptDialogs: true });
        await page.selectOption('#monthSelector', '2026-7');

        // Total de Despesas = R$ 500,00
        await expect(page.locator('#kpi-despesas')).toHaveText(/500,00/);

        // Detalhes: PIX R$ 300,00 e Cartão de Crédito R$ 200,00 (referente à XP)
        const details = page.locator('#kpi-despesas-detalhes');
        await expect(details).toContainText('PIX');
        await expect(details).toContainText('300,00');
        await expect(details).toContainText('Cartão de Crédito');
        await expect(details).toContainText('200,00');
    });

    test('5. Quitação com outra forma de pagamento (Saldo em Conta / Transferência)', async ({ page }) => {
        const transactions = [
            {
                id: 'tx-card-transf',
                user_id: mockUser.id,
                tipo: 'Despesa',
                data: '2026-08-10',
                descricao: 'Compra com Quitação em Conta',
                categoria: 'Casa',
                subcategoria: 'Manutenção',
                valor: 450.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'Inter',
                parcela: 'À vista',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            }
        ];

        const settlements = [
            {
                id: 'settle-transf',
                user_id: mockUser.id,
                transacao_id: 'tx-card-transf',
                parcela_numero: 1,
                valor: 450.00,
                status: 'ATIVA',
                data_liquidacao: '2026-08-12',
                forma_liquidacao: 'Transferência Bancária',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
        ];

        await setupAuthenticatedApp(page, { transactions, settlements, autoAcceptDialogs: true });
        await page.selectOption('#monthSelector', '2026-7');

        await expect(page.locator('#kpi-despesas')).toHaveText(/450,00/);
        const details = page.locator('#kpi-despesas-detalhes');
        await expect(details).toContainText('Transferência Bancária');
        await expect(details).toContainText('450,00');
        await expect(details).not.toContainText('Cartão de Crédito');
    });

    test('6. Quitação em mês seguinte reflete saída PIX na competência da liquidação', async ({ page }) => {
        const transactions = [
            {
                id: 'tx-cross-month',
                user_id: mockUser.id,
                tipo: 'Despesa',
                data: '2026-08-20',
                descricao: 'Compra Fim de Agosto',
                categoria: 'Compras',
                subcategoria: 'Vestuário',
                valor: 500.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: 'À vista',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            }
        ];

        // Quitação ocorreu em 05 de Setembro de 2026
        const settlements = [
            {
                id: 'settle-cross',
                user_id: mockUser.id,
                transacao_id: 'tx-cross-month',
                parcela_numero: 1,
                valor: 500.00,
                status: 'ATIVA',
                data_liquidacao: '2026-09-05',
                forma_liquidacao: 'PIX',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
        ];

        await setupAuthenticatedApp(page, { transactions, settlements, autoAcceptDialogs: true });

        // Em Setembro (2026-8): saída efetiva de PIX no valor de R$ 500,00
        await page.selectOption('#monthSelector', '2026-8');
        const detailsSet = page.locator('#kpi-despesas-detalhes');
        await expect(detailsSet).toContainText('PIX');
        await expect(detailsSet).toContainText('500,00');
    });

    test('7. Aba Análise reflete métricas de PIX e Cartão considerando liquidações', async ({ page }) => {
        const transactions = [
            {
                id: 'tx-analise-card',
                user_id: mockUser.id,
                tipo: 'Despesa',
                data: '2026-08-10',
                descricao: 'Compra Analise Cartão Quitada',
                categoria: 'Transporte',
                subcategoria: 'Combustível',
                valor: 300.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: 'À vista',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            }
        ];

        const settlements = [
            {
                id: 'settle-analise',
                user_id: mockUser.id,
                transacao_id: 'tx-analise-card',
                parcela_numero: 1,
                valor: 300.00,
                status: 'ATIVA',
                data_liquidacao: '2026-08-11',
                forma_liquidacao: 'PIX',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
        ];

        await setupAuthenticatedApp(page, { transactions, settlements, autoAcceptDialogs: true });

        // Navega para aba Análise
        await page.getByRole('button', { name: 'Análise' }).click();
        await expect(page.locator('#tab-analise')).toHaveClass(/active/);

        // Valida que os cards de média na Análise refletem PIX e Cartão
        await expect(page.locator('#an-detail-media-pix')).toContainText('300,00');
        await expect(page.locator('#an-detail-media-cartao')).toContainText('0,00');
    });

    test('8. Cenário Obrigatório Seção 24: Compra Agosto R$ 600 Cartão quitada em Setembro (05/09/2026) via PIX -> Sem Reload -> Com Reload -> Reversão', async ({ page }) => {
        const transactions = [
            {
                id: 'tx-aug-card-600',
                user_id: mockUser.id,
                tipo: 'Despesa',
                data: '2026-08-10',
                descricao: 'Smartphone Teste Agosto',
                categoria: 'Eletrônicos',
                subcategoria: 'Celular',
                valor: 600.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: 'À vista',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            }
        ];

        await setupAuthenticatedApp(page, { transactions, autoAcceptDialogs: true });

        // 1. Estado Inicial em Agosto (2026-7): Despesa 600, Cartão 600, PIX 0
        await page.selectOption('#monthSelector', '2026-7');
        await expect(page.locator('#kpi-despesas')).toHaveText(/600,00/);
        await expect(page.locator('#kpi-despesas-detalhes')).toContainText('Cartão de Crédito');
        await expect(page.locator('#kpi-despesas-detalhes')).toContainText('600,00');

        // 2. Navega para a aba de Faturas e executa a quitação via PIX com data_liquidacao em SETEMBRO (2026-09-05)
        await page.getByRole('button', { name: 'Parcelas / Fatura Cartão' }).click();
        await page.selectOption('#faturaMonthSelector', '2026-7');
        await expect(page.locator('#kpi-fatura-atual')).toHaveText(/600,00/);

        await page.locator('.settle-btn').click();
        await expect(page.locator('#creditSettlementModal')).toBeVisible();
        await expect(page.locator('#settleItemValor')).toHaveText(/600,00/);

        // Preenche data_liquidacao explicitamente no mês seguinte (Setembro)
        await page.locator('#settleDataLiquidacao').fill('2026-09-05');
        await expect(page.locator('#settleFormaLiquidacao')).toHaveValue('PIX');
        await page.click('#btnConfirmSettlement');
        await expect(page.locator('#creditSettlementModal')).toBeHidden();

        // Na fatura, o status é Quitada e a fatura em aberto baixa para 0
        const row = page.locator('#parcelasTableBody tr').first();
        await expect(row.locator('.tag-done')).toHaveText(/Quitada \(PIX\)/);
        await expect(page.locator('#kpi-fatura-atual')).toHaveText(/0,00/);

        // 3. SEM RELOAD: Volta ao Resumo e seleciona SETEMBRO (2026-8)
        await page.getByRole('button', { name: 'Resumo' }).click();
        await page.selectOption('#monthSelector', '2026-8');

        // Em Setembro: KPI Despesas reflete R$ 600,00 e Saída PIX de R$ 600,00 deve aparecer imediatamente no detalhe e no extrato!
        await expect(page.locator('#kpi-despesas')).toHaveText(/600,00/);
        const detailsSetembroSemReload = page.locator('#kpi-despesas-detalhes');
        await expect(detailsSetembroSemReload).toContainText('PIX');
        await expect(detailsSetembroSemReload).toContainText('600,00');

        // Histórico do Período em Setembro exibe o evento financeiro derivado da quitação
        const extratoSetembroSemReload = page.locator('#resumoExtratoTableBody');
        await expect(extratoSetembroSemReload).toContainText('Liquidação de Cartão');
        await expect(extratoSetembroSemReload).toContainText('PIX');
        await expect(extratoSetembroSemReload).toContainText('600,00');

        // Ao voltar para Agosto (2026-7) sem reload:
        await page.selectOption('#monthSelector', '2026-7');
        await expect(page.locator('#kpi-despesas')).toHaveText(/600,00/);
        const detailsAgostoSemReload = page.locator('#kpi-despesas-detalhes');
        await expect(detailsAgostoSemReload).not.toContainText('PIX');

        // 4. COM RELOAD (F5): Recarrega a página e valida persistência
        await page.reload();
        await page.selectOption('#monthSelector', '2026-8');
        await expect(page.locator('#kpi-despesas')).toHaveText(/600,00/);
        const detailsSetembroComReload = page.locator('#kpi-despesas-detalhes');
        await expect(detailsSetembroComReload).toContainText('PIX');
        await expect(detailsSetembroComReload).toContainText('600,00');

        const extratoSetembroComReload = page.locator('#resumoExtratoTableBody');
        await expect(extratoSetembroComReload).toContainText('Liquidação de Cartão');
        await expect(extratoSetembroComReload).toContainText('PIX');
        await expect(extratoSetembroComReload).toContainText('600,00');

        // 5. REVERSÃO: Volta para faturas e reverte a quitação
        await page.getByRole('button', { name: 'Parcelas / Fatura Cartão' }).click();
        await page.selectOption('#faturaMonthSelector', '2026-7');
        await expect(page.locator('#kpi-fatura-atual')).toHaveText(/0,00/);

        await page.locator('.settle-revert-btn').click();
        await expect(page.locator('#kpi-fatura-atual')).toHaveText(/600,00/);

        // Volta ao Resumo e verifica Setembro (PIX e evento de extrato devem ter sido removidos)
        await page.getByRole('button', { name: 'Resumo' }).click();
        await page.selectOption('#monthSelector', '2026-8');
        await expect(page.locator('#kpi-despesas')).toHaveText(/0,00/);
        const detailsSetembroAposReversao = page.locator('#kpi-despesas-detalhes');
        await expect(detailsSetembroAposReversao).not.toContainText('PIX');

        const extratoSetembroAposReversao = page.locator('#resumoExtratoTableBody');
        await expect(extratoSetembroAposReversao).not.toContainText('Liquidação de Cartão');
        await expect(extratoSetembroAposReversao).not.toContainText('600,00');

        // Em Agosto, a obrigação de Cartão de Crédito volta a aparecer
        await page.selectOption('#monthSelector', '2026-7');
        const detailsAgostoAposReversao = page.locator('#kpi-despesas-detalhes');
        await expect(detailsAgostoAposReversao).toContainText('Cartão de Crédito');
        await expect(detailsAgostoAposReversao).toContainText('600,00');
    });

    test('9. Ações Rápidas no Histórico do Período para Evento de Quitação (Ir para Cartão e Desfazer)', async ({ page }) => {
        const transactions = [
            {
                id: 'tx-quick-action-card',
                user_id: mockUser.id,
                tipo: 'Despesa',
                data: '2026-08-10',
                descricao: 'Smartphone Teste Ações',
                categoria: 'Eletrônicos',
                subcategoria: 'Celular',
                valor: 450.00,
                pagamento: 'Cartão de Crédito',
                cartao: 'Nubank',
                parcela: 'À vista',
                fatura_destino: 'ATUAL',
                created_at: new Date().toISOString()
            }
        ];

        const settlements = [
            {
                id: 'settle-quick-action',
                user_id: mockUser.id,
                transacao_id: 'tx-quick-action-card',
                parcela_numero: 1,
                valor: 450.00,
                status: 'ATIVA',
                data_liquidacao: '2026-09-08',
                forma_liquidacao: 'PIX',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
        ];

        await setupAuthenticatedApp(page, { transactions, settlements, autoAcceptDialogs: true });
        await page.selectOption('#monthSelector', '2026-8');

        // Verifica o evento no extrato de Setembro
        const extrato = page.locator('#resumoExtratoTableBody');
        await expect(extrato).toContainText('Liquidação de Cartão');
        await expect(extrato).toContainText('450,00');

        // Clica no botão de desfazer quitação diretamente pelo extrato
        const revertBtnInExtrato = extrato.locator('button[title="Desfazer Quitação"]');
        await expect(revertBtnInExtrato).toBeVisible();
        await revertBtnInExtrato.click();

        // O evento de quitação desaparece imediatamente do extrato
        await expect(page.locator('#resumoExtratoTableBody')).not.toContainText('Liquidação de Cartão');
        await expect(page.locator('#kpi-despesas')).toHaveText(/0,00/);
    });

});
