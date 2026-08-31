// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');

test.describe('Investimentos - Visualização e KPIs', () => {

    test('1. Aba de Investimentos exibe KPIs calculados corretamente', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: 'Investimentos' }).click();
        await expect(page.locator('#tab-investimentos')).toHaveClass(/active/);

        // No mock: Aporte 1 = R$ 1500, Aporte 2 = R$ 1000 -> Total = R$ 2500,00
        const totalInvestido = await page.locator('#kpi-patrimonio-total').textContent();
        expect(totalInvestido).toMatch(/2\.500,00/);

        // Maior aporte: R$ 1500,00
        const maiorAporte = await page.locator('#kpi-maior-aporte').textContent();
        expect(maiorAporte).toMatch(/1\.500,00/);
    });

    test('2. Listagem de aportes de investimentos é renderizada', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: 'Investimentos' }).click();

        await expect(page.locator('#investTableBody')).toContainText('Aporte Tesouro Direto');
        await expect(page.locator('#investTableBody')).toContainText('Ações Dividendos');
    });

    test('3. Gráfico de alocação e cards por categoria são renderizados com percentuais corretos', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: 'Investimentos' }).click();
        await expect(page.locator('#tab-investimentos')).toHaveClass(/active/);

        // Verifica a presença do gráfico de rosca
        await expect(page.locator('#investCategoryChart')).toBeVisible();

        // Verifica cards de categoria renderizados
        const cards = page.locator('#investCategoryCards .invest-category-card');
        await expect(cards).toHaveCount(1); // No mock padrão, ambos têm categoria "Investimentos"

        // Verifica valor e percentual (100%)
        await expect(cards.first()).toContainText('Investimentos');
        await expect(cards.first()).toContainText('2.500,00');
        await expect(cards.first()).toContainText('100.0%');
    });

    test('4. Múltiplas categorias de investimento geram cards e fatias distintas com filtro interativo', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'inv-1',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Investimento',
                    data: '2026-08-01',
                    descricao: 'Tesouro Selic 2029',
                    valor: 6000.00,
                    categoria: 'Renda Fixa',
                    subcategoria: 'Tesouro Direto'
                },
                {
                    id: 'inv-2',
                    user_id: 'test-user-uuid-1234',
                    tipo: 'Investimento',
                    data: '2026-08-05',
                    descricao: 'Fundo Imobiliário XPML11',
                    valor: 4000.00,
                    categoria: 'FIIs',
                    subcategoria: 'Fundos Imobiliários'
                }
            ]
        });

        await page.getByRole('button', { name: 'Investimentos' }).click();

        // Total = 10.000,00
        await expect(page.locator('#kpi-patrimonio-total')).toContainText('10.000,00');
        await expect(page.locator('#kpi-qtd-categorias-invest')).toHaveText('2');

        // Verifica os 2 cards de categoria
        const cards = page.locator('#investCategoryCards .invest-category-card');
        await expect(cards).toHaveCount(2);

        // Renda Fixa = 6.000 (60.0%)
        await expect(cards.nth(0)).toContainText('Renda Fixa');
        await expect(cards.nth(0)).toContainText('6.000,00');
        await expect(cards.nth(0)).toContainText('60.0%');

        // FIIs = 4.000 (40.0%)
        await expect(cards.nth(1)).toContainText('FIIs');
        await expect(cards.nth(1)).toContainText('4.000,00');
        await expect(cards.nth(1)).toContainText('40.0%');

        // Clica no card "FIIs" para filtrar
        await cards.nth(1).click();

        // Valida que o filtro filtrou a tabela para exibir apenas FIIs
        await expect(page.locator('#investTableBody')).toContainText('Fundo Imobiliário XPML11');
        await expect(page.locator('#investTableBody')).not.toContainText('Tesouro Selic 2029');
        await expect(page.locator('#kpi-patrimonio-total')).toContainText('4.000,00');
    });

    test('5. Tabela consolidada por ativo/subcategoria e evolução mensal dos aportes', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: 'Investimentos' }).click();

        // Verifica a tabela consolidada
        const summaryRows = page.locator('#investSummaryTableBody tr');
        await expect(summaryRows).toHaveCount(2); // Renda Fixa e Renda Variável

        await expect(page.locator('#investSummaryTableBody')).toContainText('Renda Fixa');
        await expect(page.locator('#investSummaryTableBody')).toContainText('1.500,00');
        await expect(page.locator('#investSummaryTableBody')).toContainText('Renda Variável');
        await expect(page.locator('#investSummaryTableBody')).toContainText('1.000,00');

        // Verifica o gráfico de evolução
        await expect(page.locator('#investEvolutionChart')).toBeVisible();
    });

    test('6. Busca rápida e botão limpar filtros no histórico de investimentos', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: 'Investimentos' }).click();

        // Busca por "Dividendos"
        await page.locator('#investSearchInput').fill('Dividendos');
        await expect(page.locator('#investTableBody')).toContainText('Ações Dividendos');
        await expect(page.locator('#investTableBody')).not.toContainText('Tesouro Direto');
        await expect(page.locator('#kpi-patrimonio-total')).toContainText('1.000,00');

        // Clica no botão Limpar
        await page.getByRole('button', { name: 'Limpar' }).click();
        await expect(page.locator('#investTableBody')).toContainText('Aporte Tesouro Direto');
        await expect(page.locator('#investTableBody')).toContainText('Ações Dividendos');
        await expect(page.locator('#kpi-patrimonio-total')).toContainText('2.500,00');
    });

    test('7. Lançador próprio de investimentos cadastra novo aporte com Renda Fixa/Variável', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: 'Investimentos' }).click();
        await expect(page.locator('#investFormTitle')).toContainText('Lançar Novo Aporte');

        // Preenche o formulário próprio de investimentos
        await page.locator('#inv_data').fill('2026-08-20');
        await page.locator('#inv_descricao').fill('CDB 110% CDI Inter');
        await page.locator('#inv_valor').fill('3000.00');
        await page.locator('#inv_custo').selectOption('Renda Fixa');
        await page.locator('#inv_categoria').selectOption({ label: 'Investimentos' });

        await page.locator('#btnSalvarInvest').click();

        // Verifica inserção na tabela e KPIs
        await expect(page.locator('#investTableBody')).toContainText('CDB 110% CDI Inter');
        await expect(page.locator('#kpi-patrimonio-total')).toContainText('5.500,00');

        const txs = getTransactions();
        const newInv = txs.find(t => t.descricao === 'CDB 110% CDI Inter');
        expect(newInv).toBeDefined();
        expect(newInv.tipo).toBe('Investimento');
        expect(newInv.custo).toBe('Renda Fixa');
        expect(newInv.valor).toBe(3000);
    });

    test('8. Edição de aporte no histórico direciona para formulário próprio de investimentos', async ({ page }) => {
        const { getTransactions } = await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: 'Investimentos' }).click();

        // Clica em editar no primeiro registro (Aporte Tesouro Direto)
        const row = page.locator('#investTableBody tr', { hasText: 'Aporte Tesouro Direto' });
        await row.locator('button[title="Editar"]').click();

        // Verifica que o formulário próprio de investimentos entrou em modo edição
        await expect(page.locator('#investFormTitle')).toContainText('Editar Aporte de Investimento');
        await expect(page.locator('#btnSalvarInvest')).toHaveText('Atualizar Aporte');
        await expect(page.locator('#btnCancelarInvestEdit')).toBeVisible();
        await expect(page.locator('#inv_descricao')).toHaveValue('Aporte Tesouro Direto');
        await expect(page.locator('#inv_valor')).toHaveValue('1500');

        // Altera o valor e descrição
        await page.locator('#inv_descricao').fill('Tesouro IPCA+ 2035');
        await page.locator('#inv_valor').fill('2000.00');
        await page.locator('#btnSalvarInvest').click();

        // Verifica atualização
        await expect(page.locator('#investTableBody')).toContainText('Tesouro IPCA+ 2035');
        await expect(page.locator('#investTableBody')).not.toContainText('Aporte Tesouro Direto');
        await expect(page.locator('#kpi-patrimonio-total')).toContainText('3.000,00'); // 2000 + 1000

        const txs = getTransactions();
        const updated = txs.find(t => t.id === 'tx-008-investimento-1');
        expect(updated.descricao).toBe('Tesouro IPCA+ 2035');
        expect(updated.valor).toBe(2000);
    });

    test('9. Cancelar edição no lançador de investimentos restaura formulário para modo de criação', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: 'Investimentos' }).click();

        const row = page.locator('#investTableBody tr', { hasText: 'Aporte Tesouro Direto' });
        await row.locator('button[title="Editar"]').click();

        await expect(page.locator('#investFormTitle')).toContainText('Editar Aporte de Investimento');
        await expect(page.locator('#btnCancelarInvestEdit')).toBeVisible();

        // Clica em Cancelar
        await page.locator('#btnCancelarInvestEdit').click();

        await expect(page.locator('#investFormTitle')).toContainText('Lançar Novo Aporte');
        await expect(page.locator('#btnSalvarInvest')).toHaveText('Salvar Aporte');
        await expect(page.locator('#btnCancelarInvestEdit')).toBeHidden();
        await expect(page.locator('#inv_descricao')).toHaveValue('');
        await expect(page.locator('#inv_valor')).toHaveValue('');
    });

    test('10. Lançador geral de transações (#tab-novo) NÃO possui opção Investimento no tipo e não lista categorias de investimento', async ({ page }) => {
        await setupAuthenticatedApp(page);

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await expect(page.locator('#tab-novo')).toHaveClass(/active/);

        // Verifica que #i_tipo não possui a opção Investimento
        const tipoOptions = await page.locator('#i_tipo option').allTextContents();
        expect(tipoOptions).not.toContain('Investimento');
        expect(tipoOptions.some(opt => opt.includes('Despesa'))).toBe(true);
        expect(tipoOptions.some(opt => opt.includes('Receita'))).toBe(true);

        // Verifica que as categorias de investimento não estão presentes nas opções do lançador geral
        const catOptions = await page.locator('#i_categoria option').allTextContents();
        expect(catOptions).not.toContain('Investimentos');
    });

});
