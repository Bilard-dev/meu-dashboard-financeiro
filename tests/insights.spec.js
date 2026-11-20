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

});
