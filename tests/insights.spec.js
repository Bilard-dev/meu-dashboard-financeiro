// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');
const { mockUser } = require('./fixtures/mockData');

test.describe('Assistente Financeiro de Insights Automáticos 🧠', () => {

    test('1. Container do Assistente de Insights deve estar visível no Resumo Geral', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: []
        });

        const section = page.locator('#smartInsightsSection');
        await expect(section).toBeVisible();

        const title = page.locator('#smartInsightsSection h3');
        await expect(title).toHaveText('Assistente de Insights');

        const pill = page.locator('.smart-insights-pill');
        await expect(pill).toHaveText('Inteligência Financeira');
    });

    test('2. Deve renderizar alerta de subida de gastos em Alimentação (+18% vs média de 3 meses)', async ({ page }) => {
        // Simula histórico dos 3 meses anteriores (R$ 1.000 / mês) e mês atual com R$ 1.180 (+18%)
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        const ymCurrent = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
        const d1 = new Date(currentYear, currentMonth - 1, 15);
        const d2 = new Date(currentYear, currentMonth - 2, 15);
        const d3 = new Date(currentYear, currentMonth - 3, 15);

        const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-hist-1',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: formatDate(d3),
                    descricao: 'Mercado M-3',
                    valor: 1000.00,
                    pagamento: 'PIX',
                    categoria: 'Alimentação'
                },
                {
                    id: 'tx-hist-2',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: formatDate(d2),
                    descricao: 'Mercado M-2',
                    valor: 1000.00,
                    pagamento: 'PIX',
                    categoria: 'Alimentação'
                },
                {
                    id: 'tx-hist-3',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: formatDate(d1),
                    descricao: 'Mercado M-1',
                    valor: 1000.00,
                    pagamento: 'PIX',
                    categoria: 'Alimentação'
                },
                {
                    id: 'tx-current',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: `${ymCurrent}-10`,
                    descricao: 'Supermercado Atual',
                    valor: 1180.00,
                    pagamento: 'PIX',
                    categoria: 'Alimentação'
                }
            ]
        });

        const spikeCard = page.locator('#smartInsightsContainer [data-id^="insight-cat-spike-Alimentação"]');
        await expect(spikeCard).toBeVisible();

        const message = spikeCard.locator('.smart-insight-message');
        await expect(message).toContainText('Alimentação');
        await expect(message).toContainText('18%');
        await expect(message).toContainText('últimos 3 meses');
    });

    test('3. Deve parabenizar economia no mês em relação ao mês anterior (R$ 850 economizados)', async ({ page }) => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        const ymCurrent = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
        const prevDate = new Date(currentYear, currentMonth - 1, 15);
        const ymPrev = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-prev-total',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: `${ymPrev}-15`,
                    descricao: 'Despesas Gerais Passadas',
                    valor: 3000.00,
                    pagamento: 'PIX',
                    categoria: 'Geral'
                },
                {
                    id: 'tx-curr-total',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: `${ymCurrent}-15`,
                    descricao: 'Despesas Gerais Atuais',
                    valor: 2150.00,
                    pagamento: 'PIX',
                    categoria: 'Geral'
                }
            ]
        });

        const savingsCard = page.locator('#smartInsightsContainer [data-id="insight-month-savings"]');
        await expect(savingsCard).toBeVisible();

        const title = savingsCard.locator('.smart-insight-card-title');
        await expect(title).toContainText('Parabéns pela Economia');

        const message = savingsCard.locator('.smart-insight-message');
        await expect(message).toContainText('850,00');
        await expect(message).toContainText('mês anterior');
    });

    test('4. Modo de privacidade deve mascarar valores monetários nos cards de insight', async ({ page }) => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        const ymCurrent = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
        const prevDate = new Date(currentYear, currentMonth - 1, 15);
        const ymPrev = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-prev',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: `${ymPrev}-15`,
                    descricao: 'Outubro',
                    valor: 3000.00,
                    pagamento: 'PIX',
                    categoria: 'Geral'
                },
                {
                    id: 'tx-curr',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: `${ymCurrent}-15`,
                    descricao: 'Novembro',
                    valor: 2000.00,
                    pagamento: 'PIX',
                    categoria: 'Geral'
                }
            ]
        });

        // Antes do modo privacidade
        const savingsCard = page.locator('#smartInsightsContainer [data-id="insight-month-savings"]');
        await expect(savingsCard).toContainText('1.000,00');

        // Ativa o modo privacidade pelo botão 👁️
        await page.click('#privacyToggleBtn');

        // Após ativação, o valor sensível deve estar mascarado
        await expect(savingsCard).not.toContainText('1.000,00');
        await expect(savingsCard).toContainText('R$ ****,**');
    });

    test('5. Deve exibir card de Burn Rate com projeção de ritmo diário e fechamento do mês', async ({ page }) => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const ymCurrent = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-burn-1',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: `${ymCurrent}-02`,
                    descricao: 'Supermercado Mensal',
                    valor: 400.00,
                    pagamento: 'PIX',
                    categoria: 'Alimentação'
                }
            ]
        });

        // O card de burn rate deve ser gerado para o mês corrente
        const burnCard = page.locator('#smartInsightsContainer [data-id="insight-burn-rate"]');
        await expect(burnCard).toBeVisible();

        const msg = burnCard.locator('.smart-insight-message');
        await expect(msg).toContainText('/dia');
        await expect(msg).toContainText('fechará o mês');
    });

    test('6. Deve exibir card de Tetos de Gastos com barra de progresso visual (Budgeting)', async ({ page }) => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const ymCurrent = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

        // Consome R$ 750 de Alimentação (Teto padrão: R$ 800 -> 94% crítico)
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-food-budget',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: `${ymCurrent}-05`,
                    descricao: 'Compras Supermercado',
                    valor: 750.00,
                    pagamento: 'PIX',
                    categoria: 'Alimentação'
                }
            ]
        });

        const budgetCard = page.locator('#smartInsightsContainer [data-id^="insight-budget-"]');
        await expect(budgetCard.first()).toBeVisible();

        // Verifica presença da barra de progresso visual de budgeting
        const progressBar = budgetCard.first().locator('.smart-insight-progress-bar');
        await expect(progressBar).toBeVisible();

        const labels = budgetCard.first().locator('.smart-insight-budget-labels');
        await expect(labels).toContainText('%');
    });

    test('7. Deve detectar e exibir cobranças recorrentes e assinaturas ativas', async ({ page }) => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        const ymCurrent = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
        const prev1 = new Date(currentYear, currentMonth - 1, 10);
        const ymPrev1 = `${prev1.getFullYear()}-${String(prev1.getMonth() + 1).padStart(2, '0')}`;
        const prev2 = new Date(currentYear, currentMonth - 2, 10);
        const ymPrev2 = `${prev2.getFullYear()}-${String(prev2.getMonth() + 1).padStart(2, '0')}`;

        await setupAuthenticatedApp(page, {
            transactions: [
                // Netflix presente nos últimos 3 meses com R$ 55,90
                { id: 'rec-1', user_id: mockUser.id, tipo: 'Despesa', data: `${ymPrev2}-10`, descricao: 'Netflix', valor: 55.90, categoria: 'Lazer' },
                { id: 'rec-2', user_id: mockUser.id, tipo: 'Despesa', data: `${ymPrev1}-10`, descricao: 'Netflix', valor: 55.90, categoria: 'Lazer' },
                { id: 'rec-3', user_id: mockUser.id, tipo: 'Despesa', data: `${ymCurrent}-10`, descricao: 'Netflix', valor: 55.90, categoria: 'Lazer' },
                // Spotify marcado explicitamente como recorrente
                { id: 'rec-4', user_id: mockUser.id, tipo: 'Despesa', data: `${ymCurrent}-05`, descricao: 'Spotify', valor: 34.90, parcela: 'RECORRENTE', categoria: 'Lazer' }
            ]
        });

        const recCard = page.locator('#smartInsightsContainer [data-id="insight-recurring-subscriptions"]');
        await expect(recCard).toBeVisible();

        const title = recCard.locator('.smart-insight-card-title');
        await expect(title).toHaveText('Detector de Recorrências & Assinaturas');

        // Verifica chips das assinaturas identificadas
        const chips = recCard.locator('.smart-insight-chip');
        await expect(chips).toHaveCount(2);
        await expect(recCard).toContainText('Netflix');
        await expect(recCard).toContainText('Spotify');
    });

});
