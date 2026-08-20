/**
 * Helper central de inicialização dos testes com Playwright.
 * Implementa PROTEÇÃO TOTAL contra acesso ao Supabase de produção.
 */

const {
    mockUser,
    mockTransactions,
    mockSharedExpenses,
    mockMetas,
    mockBudgets,
    mockCategorias,
    mockSubcategorias,
    mockCartoes,
    mockTags
} = require('../fixtures/mockData');

/**
 * Configura o ambiente seguro do navegador com bloqueio e simulação do Supabase.
 * @param {import('@playwright/test').Page} page
 * @param {Object} options
 * @param {boolean} [options.authenticated=true] - Se deve inicializar já logado
 * @param {Array} [options.transactions] - Lista inicial de transações mockadas
 * @param {Array} [options.sharedExpenses] - Lista inicial de gastos compartilhados
 * @param {Array} [options.metas] - Lista inicial de metas mockadas
 * @param {Array} [options.categorias] - Lista inicial de categorias mockadas
 * @param {Array} [options.subcategorias] - Lista inicial de subcategorias mockadas
 * @param {Array} [options.cartoes] - Lista inicial de cartões mockados
 * @param {Array} [options.tags] - Lista inicial de tags mockadas
 * @param {Object|null} [options.budgets=null] - Dados legados de userBudgets no LocalStorage
 * @param {boolean} [options.autoAcceptDialogs=true] - Se deve aceitar automaticamente diálogos
 */
async function setupAuthenticatedApp(page, {
    authenticated = true,
    transactions = JSON.parse(JSON.stringify(mockTransactions)),
    sharedExpenses = JSON.parse(JSON.stringify(mockSharedExpenses)),
    metas = JSON.parse(JSON.stringify(mockMetas)),
    categorias = JSON.parse(JSON.stringify(mockCategorias)),
    subcategorias = JSON.parse(JSON.stringify(mockSubcategorias)),
    cartoes = JSON.parse(JSON.stringify(mockCartoes)),
    tags = JSON.parse(JSON.stringify(mockTags)),
    budgets = null,
    autoAcceptDialogs = true
} = {}) {

    let inMemoryTransactions = [...transactions];
    let inMemoryShared = [...sharedExpenses];
    let inMemoryMetas = [...metas];
    let inMemoryCategorias = [...categorias];
    let inMemorySubcategorias = [...subcategorias];
    let inMemoryCartoes = [...cartoes];
    let inMemoryTags = [...tags];

    const normalize = s => String(s || '').replace(/[\u00a0\s]+/g, ' ').trim().toLowerCase();

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

            // Mock de Metas 2.0 (REST)
            if (pathname.includes('/rest/v1/metas')) {
                if (method === 'GET') {
                    let filteredMetas = inMemoryMetas;
                    const userMatch = urlObj.search.match(/user_id=eq\.([^&]+)/);
                    if (userMatch) {
                        filteredMetas = filteredMetas.filter(m => m.user_id === userMatch[1]);
                    }
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        headers: { 'content-range': `0-${filteredMetas.length - 1}/${filteredMetas.length}` },
                        body: JSON.stringify(filteredMetas)
                    });
                }
                if (method === 'POST') {
                    const postData = route.request().postDataJSON();
                    const newItems = Array.isArray(postData) ? postData : [postData];
                    const resultItems = [];

                    for (let idx = 0; idx < newItems.length; idx++) {
                        const item = newItems[idx];
                        const normCat = normalize(item.categoria);
                        const existingIndex = inMemoryMetas.findIndex(m => m.user_id === item.user_id && m.categoria_normalizada === normCat);

                        if (existingIndex !== -1) {
                            inMemoryMetas[existingIndex] = {
                                ...inMemoryMetas[existingIndex],
                                categoria: item.categoria,
                                valor_limite: item.valor_limite,
                                updated_at: item.updated_at || new Date().toISOString()
                            };
                            resultItems.push(inMemoryMetas[existingIndex]);
                        } else {
                            const created = {
                                id: item.id || `meta-created-${Date.now()}-${idx}`,
                                user_id: item.user_id,
                                categoria: item.categoria,
                                categoria_normalizada: normCat,
                                valor_limite: item.valor_limite,
                                created_at: item.created_at || new Date().toISOString(),
                                updated_at: item.updated_at || new Date().toISOString()
                            };
                            inMemoryMetas.push(created);
                            resultItems.push(created);
                        }
                    }

                    return route.fulfill({
                        status: 201,
                        contentType: 'application/json',
                        body: JSON.stringify(resultItems)
                    });
                }
                if (method === 'DELETE') {
                    const match = urlObj.search.match(/id=eq\.([^&]+)/);
                    const targetId = match ? match[1] : null;
                    if (targetId) {
                        inMemoryMetas = inMemoryMetas.filter(m => m.id !== targetId);
                    }
                    return route.fulfill({
                        status: 204,
                        body: ''
                    });
                }
            }

            // Mock de app_categorias (REST)
            if (pathname.includes('/rest/v1/app_categorias')) {
                if (method === 'GET') {
                    let items = [...inMemoryCategorias].sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome));
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        headers: { 'content-range': `0-${items.length - 1}/${items.length}` },
                        body: JSON.stringify(items)
                    });
                }
                if (method === 'POST') {
                    const postData = route.request().postDataJSON();
                    const newItems = Array.isArray(postData) ? postData : [postData];
                    const createdItems = [];

                    for (const item of newItems) {
                        const norm = normalize(item.nome);
                        const duplicate = inMemoryCategorias.some(c => c.user_id === (item.user_id || mockUser.id) && normalize(c.nome) === norm);
                        if (duplicate) {
                            return route.fulfill({
                                status: 409,
                                contentType: 'application/json',
                                body: JSON.stringify({ message: 'duplicate key value violates unique constraint "unique_app_categorias_user_nome_norm"' })
                            });
                        }
                        const created = {
                            id: item.id || `cat-created-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            user_id: item.user_id || mockUser.id,
                            nome: item.nome,
                            nome_normalizado: norm,
                            ativo: item.ativo !== undefined ? item.ativo : true,
                            ordem: item.ordem || 0,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        };
                        inMemoryCategorias.push(created);
                        createdItems.push(created);
                    }
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
                        const index = inMemoryCategorias.findIndex(c => c.id === targetId);
                        if (index !== -1) {
                            if (patchData.nome) {
                                const norm = normalize(patchData.nome);
                                const dup = inMemoryCategorias.some(c => c.id !== targetId && normalize(c.nome) === norm);
                                if (dup) {
                                    return route.fulfill({
                                        status: 409,
                                        contentType: 'application/json',
                                        body: JSON.stringify({ message: 'duplicate key value violates unique constraint "unique_app_categorias_user_nome_norm"' })
                                    });
                                }
                                patchData.nome_normalizado = norm;
                            }
                            inMemoryCategorias[index] = { ...inMemoryCategorias[index], ...patchData, updated_at: new Date().toISOString() };
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
                        inMemoryCategorias = inMemoryCategorias.filter(c => c.id !== targetId);
                    }
                    return route.fulfill({
                        status: 204,
                        body: ''
                    });
                }
            }

            // Mock de app_subcategorias (REST)
            if (pathname.includes('/rest/v1/app_subcategorias')) {
                if (method === 'GET') {
                    let items = [...inMemorySubcategorias].sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome));
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        headers: { 'content-range': `0-${items.length - 1}/${items.length}` },
                        body: JSON.stringify(items)
                    });
                }
                if (method === 'POST') {
                    const postData = route.request().postDataJSON();
                    const newItems = Array.isArray(postData) ? postData : [postData];
                    const createdItems = [];

                    for (const item of newItems) {
                        const norm = normalize(item.nome);
                        const duplicate = inMemorySubcategorias.some(s => s.user_id === (item.user_id || mockUser.id) && s.categoria_id === item.categoria_id && normalize(s.nome) === norm);
                        if (duplicate) {
                            return route.fulfill({
                                status: 409,
                                contentType: 'application/json',
                                body: JSON.stringify({ message: 'duplicate key value violates unique constraint "unique_app_subcategorias_user_cat_nome_norm"' })
                            });
                        }
                        const created = {
                            id: item.id || `sub-created-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            user_id: item.user_id || mockUser.id,
                            categoria_id: item.categoria_id,
                            nome: item.nome,
                            nome_normalizado: norm,
                            ativo: item.ativo !== undefined ? item.ativo : true,
                            ordem: item.ordem || 0,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        };
                        inMemorySubcategorias.push(created);
                        createdItems.push(created);
                    }
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
                        const index = inMemorySubcategorias.findIndex(s => s.id === targetId);
                        if (index !== -1) {
                            if (patchData.nome) {
                                const norm = normalize(patchData.nome);
                                const catId = patchData.categoria_id || inMemorySubcategorias[index].categoria_id;
                                const dup = inMemorySubcategorias.some(s => s.id !== targetId && s.categoria_id === catId && normalize(s.nome) === norm);
                                if (dup) {
                                    return route.fulfill({
                                        status: 409,
                                        contentType: 'application/json',
                                        body: JSON.stringify({ message: 'duplicate key value violates unique constraint "unique_app_subcategorias_user_cat_nome_norm"' })
                                    });
                                }
                                patchData.nome_normalizado = norm;
                            }
                            inMemorySubcategorias[index] = { ...inMemorySubcategorias[index], ...patchData, updated_at: new Date().toISOString() };
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
                        inMemorySubcategorias = inMemorySubcategorias.filter(s => s.id !== targetId);
                    }
                    return route.fulfill({
                        status: 204,
                        body: ''
                    });
                }
            }

            // Mock de app_cartoes (REST)
            if (pathname.includes('/rest/v1/app_cartoes')) {
                if (method === 'GET') {
                    let items = [...inMemoryCartoes].sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome));
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        headers: { 'content-range': `0-${items.length - 1}/${items.length}` },
                        body: JSON.stringify(items)
                    });
                }
                if (method === 'POST') {
                    const postData = route.request().postDataJSON();
                    const newItems = Array.isArray(postData) ? postData : [postData];
                    const createdItems = [];

                    for (const item of newItems) {
                        const norm = normalize(item.nome);
                        const duplicate = inMemoryCartoes.some(c => c.user_id === (item.user_id || mockUser.id) && normalize(c.nome) === norm);
                        if (duplicate) {
                            return route.fulfill({
                                status: 409,
                                contentType: 'application/json',
                                body: JSON.stringify({ message: 'duplicate key value violates unique constraint "unique_app_cartoes_user_nome_norm"' })
                            });
                        }
                        const created = {
                            id: item.id || `card-created-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            user_id: item.user_id || mockUser.id,
                            nome: item.nome,
                            nome_normalizado: norm,
                            ativo: item.ativo !== undefined ? item.ativo : true,
                            dia_fechamento: item.dia_fechamento !== undefined ? item.dia_fechamento : null,
                            dia_vencimento: item.dia_vencimento !== undefined ? item.dia_vencimento : null,
                            cor: item.cor || '#2563eb',
                            ordem: item.ordem || 0,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        };
                        inMemoryCartoes.push(created);
                        createdItems.push(created);
                    }
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
                        const index = inMemoryCartoes.findIndex(c => c.id === targetId);
                        if (index !== -1) {
                            if (patchData.nome) {
                                const norm = normalize(patchData.nome);
                                const dup = inMemoryCartoes.some(c => c.id !== targetId && normalize(c.nome) === norm);
                                if (dup) {
                                    return route.fulfill({
                                        status: 409,
                                        contentType: 'application/json',
                                        body: JSON.stringify({ message: 'duplicate key value violates unique constraint "unique_app_cartoes_user_nome_norm"' })
                                    });
                                }
                                patchData.nome_normalizado = norm;
                            }
                            inMemoryCartoes[index] = { ...inMemoryCartoes[index], ...patchData, updated_at: new Date().toISOString() };
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
                        inMemoryCartoes = inMemoryCartoes.filter(c => c.id !== targetId);
                    }
                    return route.fulfill({
                        status: 204,
                        body: ''
                    });
                }
            }

            // Mock de app_tags (REST)
            if (pathname.includes('/rest/v1/app_tags')) {
                if (method === 'GET') {
                    let items = [...inMemoryTags].sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome));
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        headers: { 'content-range': `0-${items.length - 1}/${items.length}` },
                        body: JSON.stringify(items)
                    });
                }
                if (method === 'POST') {
                    const postData = route.request().postDataJSON();
                    const newItems = Array.isArray(postData) ? postData : [postData];
                    const createdItems = [];

                    for (const item of newItems) {
                        const norm = normalize(item.nome);
                        const duplicate = inMemoryTags.some(t => t.user_id === (item.user_id || mockUser.id) && normalize(t.nome) === norm);
                        if (duplicate) {
                            return route.fulfill({
                                status: 409,
                                contentType: 'application/json',
                                body: JSON.stringify({ message: 'duplicate key value violates unique constraint "unique_app_tags_user_nome_norm"' })
                            });
                        }
                        const created = {
                            id: item.id || `tag-created-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                            user_id: item.user_id || mockUser.id,
                            nome: item.nome,
                            nome_normalizado: norm,
                            cor: item.cor || '#64748b',
                            ativo: item.ativo !== undefined ? item.ativo : true,
                            ordem: item.ordem || 0,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        };
                        inMemoryTags.push(created);
                        createdItems.push(created);
                    }
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
                        const index = inMemoryTags.findIndex(t => t.id === targetId);
                        if (index !== -1) {
                            if (patchData.nome) {
                                const norm = normalize(patchData.nome);
                                const dup = inMemoryTags.some(t => t.id !== targetId && normalize(t.nome) === norm);
                                if (dup) {
                                    return route.fulfill({
                                        status: 409,
                                        contentType: 'application/json',
                                        body: JSON.stringify({ message: 'duplicate key value violates unique constraint "unique_app_tags_user_nome_norm"' })
                                    });
                                }
                                patchData.nome_normalizado = norm;
                            }
                            inMemoryTags[index] = { ...inMemoryTags[index], ...patchData, updated_at: new Date().toISOString() };
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
                        inMemoryTags = inMemoryTags.filter(t => t.id !== targetId);
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
        await page.waitForSelector('#appView:not([style*="display: none"])', { timeout: 12000 });
    }

    return {
        getTransactions: () => inMemoryTransactions,
        getShared: () => inMemoryShared,
        getMetas: () => inMemoryMetas,
        getCategories: () => inMemoryCategorias,
        getSubcategories: () => inMemorySubcategorias,
        getCards: () => inMemoryCartoes,
        getTags: () => inMemoryTags
    };
}

module.exports = {
    setupAuthenticatedApp
};
