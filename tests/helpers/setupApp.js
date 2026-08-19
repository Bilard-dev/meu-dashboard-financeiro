/**
 * Helper central de inicialização dos testes com Playwright.
 * Implementa PROTEÇÃO TOTAL contra acesso ao Supabase de produção.
 */

const { mockUser, mockTransactions, mockSharedExpenses, mockBudgets } = require('../fixtures/mockData');

/**
 * Configura o ambiente seguro do navegador com bloqueio e simulação do Supabase.
 * @param {import('@playwright/test').Page} page
 * @param {Object} options
 * @param {boolean} [options.authenticated=true] - Se deve inicializar já logado
 * @param {Array} [options.transactions] - Lista inicial de transações mockadas
 * @param {Array} [options.sharedExpenses] - Lista inicial de gastos compartilhados
 * @param {boolean} [options.autoAcceptDialogs=true] - Se deve aceitar automaticamente diálogos
 */
async function setupAuthenticatedApp(page, {
    authenticated = true,
    transactions = JSON.parse(JSON.stringify(mockTransactions)),
    sharedExpenses = JSON.parse(JSON.stringify(mockSharedExpenses)),
    budgets = mockBudgets,
    autoAcceptDialogs = true
} = {}) {

    let inMemoryTransactions = [...transactions];
    let inMemoryShared = [...sharedExpenses];

    // 1. Interceptação e proteção absoluta de chamadas de rede para o Supabase
    await page.route('**/*', async (route) => {
        const url = route.request().url();
        const method = route.request().method();

        // Se for requisição para o domínio do Supabase
        if (url.includes('.supabase.co')) {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;

            // Mock de Autenticação / Sessão
            if (pathname.includes('/auth/v1/user') || pathname.includes('/auth/v1/token')) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        access_token: 'mock-jwt-token-12345',
                        token_type: 'bearer',
                        expires_in: 3600,
                        refresh_token: 'mock-refresh-token',
                        user: mockUser
                    })
                });
            }

            // Mock de Transações (REST)
            if (pathname.includes('/rest/v1/transacoes')) {
                if (method === 'GET') {
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        headers: { 'content-range': `0-${inMemoryTransactions.length - 1}/${inMemoryTransactions.length}` },
                        body: JSON.stringify(inMemoryTransactions)
                    });
                }
                if (method === 'POST') {
                    const postData = route.request().postDataJSON();
                    const newItems = Array.isArray(postData) ? postData : [postData];

                    // Simulação da trava UNIQUE do PostgreSQL em gasto_compartilhado_id
                    for (const item of newItems) {
                        if (item.gasto_compartilhado_id) {
                            const duplicate = inMemoryTransactions.some(t => t.gasto_compartilhado_id === item.gasto_compartilhado_id);
                            if (duplicate) {
                                return route.fulfill({
                                    status: 409,
                                    contentType: 'application/json',
                                    body: JSON.stringify({ message: 'duplicate key value violates unique constraint "unique_transacao_por_gasto_compartilhado"' })
                                });
                            }
                        }
                    }

                    const createdItems = newItems.map((item, idx) => ({
                        id: item.id || `tx-created-${Date.now()}-${idx}`,
                        created_at: new Date().toISOString(),
                        gasto_compartilhado_id: item.gasto_compartilhado_id || null,
                        grupo_parcela_id: item.grupo_parcela_id || null,
                        ...item
                    }));
                    inMemoryTransactions.unshift(...createdItems);
                    return route.fulfill({
                        status: 201,
                        contentType: 'application/json',
                        body: JSON.stringify(createdItems)
                    });
                }
                if (method === 'PATCH') {
                    const patchData = route.request().postDataJSON();
                    // Identifica ID pelo query param ?id=eq.XXX
                    const match = urlObj.search.match(/id=eq\.([^&]+)/);
                    const targetId = match ? match[1] : null;
                    if (targetId) {
                        const index = inMemoryTransactions.findIndex(t => t.id === targetId);
                        if (index !== -1) {
                            inMemoryTransactions[index] = { ...inMemoryTransactions[index], ...patchData };
                        }
                    }
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify(patchData)
                    });
                }
                if (method === 'DELETE') {
                    const match = urlObj.search.match(/id=eq\.([^&]+)/);
                    const targetId = match ? match[1] : null;
                    if (targetId) {
                        inMemoryTransactions = inMemoryTransactions.filter(t => t.id !== targetId);
                    }
                    return route.fulfill({
                        status: 204,
                        body: ''
                    });
                }
            }

            // Mock de Gastos Compartilhados (REST)
            if (pathname.includes('/rest/v1/gastos_compartilhados')) {
                if (method === 'GET') {
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        headers: { 'content-range': `0-${inMemoryShared.length - 1}/${inMemoryShared.length}` },
                        body: JSON.stringify(inMemoryShared)
                    });
                }
                if (method === 'POST') {
                    const postData = route.request().postDataJSON();
                    const newItems = Array.isArray(postData) ? postData : [postData];
                    const createdItems = newItems.map((item, idx) => ({
                        id: item.id || `shared-created-${Date.now()}-${idx}`,
                        created_at: new Date().toISOString(),
                        ...item
                    }));
                    inMemoryShared.unshift(...createdItems);
                    return route.fulfill({
                        status: 201,
                        contentType: 'application/json',
                        body: JSON.stringify(createdItems)
                    });
                }
                if (method === 'PATCH') {
                    const patchData = route.request().postDataJSON();
                    const match = urlObj.search.match(/id=eq\.([^&]+)/);
                    const targetId = match ? match[1] : null;
                    if (targetId) {
                        const index = inMemoryShared.findIndex(s => s.id === targetId);
                        if (index !== -1) {
                            inMemoryShared[index] = { ...inMemoryShared[index], ...patchData };
                        }
                    }
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify(patchData)
                    });
                }
                if (method === 'DELETE') {
                    const match = urlObj.search.match(/id=eq\.([^&]+)/);
                    const targetId = match ? match[1] : null;
                    if (targetId) {
                        inMemoryShared = inMemoryShared.filter(s => s.id !== targetId);
                        // Simulação de ON DELETE SET NULL (gasto_compartilhado_id) no Postgres:
                        inMemoryTransactions = inMemoryTransactions.map(t => {
                            if (t.gasto_compartilhado_id === targetId) {
                                return { ...t, gasto_compartilhado_id: null };
                            }
                            return t;
                        });
                    }
                    return route.fulfill({
                        status: 204,
                        body: ''
                    });
                }
            }

            // Qualquer outra chamada Supabase não prevista é abortada com erro para segurança
            console.warn(`[TESTE-PROTEÇÃO] Chamada não mockada interceptada: ${method} ${url}`);
            return route.abort('failed');
        }

        // Requisições locais (HTML, CSS, JS) continuam normalmente
        return route.continue();
    });

    // 2. Manipulação de diálogos (alert/confirm/prompt) para não travar a execução
    if (autoAcceptDialogs) {
        page.on('dialog', async (dialog) => {
            try {
                await dialog.accept();
            } catch (e) {
                // Diálogo já tratado por listener local
            }
        });
    }

    // 3. Injeção de sessão e dados no LocalStorage antes do carregamento da página
    if (authenticated) {
        await page.addInitScript(({ user, budgets }) => {
            const mockSession = {
                access_token: 'mock-jwt-token-12345',
                refresh_token: 'mock-refresh-token',
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                token_type: 'bearer',
                user: user
            };
            // Supabase auth key no LocalStorage
            window.localStorage.setItem('sb-zrlkexqogahoeryqkeyr-auth-token', JSON.stringify(mockSession));
            if (budgets) {
                window.localStorage.setItem('userBudgets', JSON.stringify(budgets));
            }
        }, { user: mockUser, budgets });
    }

    // 4. Navega até a aplicação local
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    if (authenticated) {
        // Aguarda exibição do aplicativo principal
        await page.waitForSelector('#appView:not([style*="display: none"])', { timeout: 7000 });
    }

    return {
        getTransactions: () => inMemoryTransactions,
        getShared: () => inMemoryShared
    };
}

module.exports = {
    setupAuthenticatedApp
};
