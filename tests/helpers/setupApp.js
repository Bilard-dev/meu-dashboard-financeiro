/**
 * Helper central de inicialização dos testes com Playwright.
 * Implementa PROTEÇÃO TOTAL contra acesso ao Supabase de produção.
 */

const {
    mockUser,
    mockTransactions,
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
 * @param {Array} [options.metas] - Lista inicial de metas mockadas
 * @param {Array} [options.categorias] - Lista inicial de categorias mockadas
 * @param {Array} [options.subcategorias] - Lista inicial de subcategorias mockadas
 * @param {Array} [options.cartoes] - Lista inicial de cartões mockados
 * @param {Array} [options.tags] - Lista inicial de tags mockadas
 * @param {Array} [options.settlements] - Lista inicial de liquidações de crédito mockadas
 * @param {Object|null} [options.budgets=null] - Dados legados de userBudgets no LocalStorage
 * @param {boolean} [options.autoAcceptDialogs=true] - Se deve aceitar automaticamente diálogos
 */
async function setupAuthenticatedApp(page, {
    authenticated = true,
    userProfile = {
        user_id: mockUser.id,
        display_name: 'Usuário Teste',
        access_status: 'approved',
        created_at: '2026-01-01T00:00:00Z',
        approved_at: '2026-01-01T00:00:00Z',
        approved_by: '00000000-0000-0000-0000-000000000000'
    },
    isAdmin = false,
    transactions = JSON.parse(JSON.stringify(mockTransactions)),
    metas = JSON.parse(JSON.stringify(mockMetas)),
    categorias = JSON.parse(JSON.stringify(mockCategorias)),
    subcategorias = JSON.parse(JSON.stringify(mockSubcategorias)),
    cartoes = JSON.parse(JSON.stringify(mockCartoes)),
    tags = JSON.parse(JSON.stringify(mockTags)),
    settlements = [],
    budgets = null,
    autoAcceptDialogs = true,
    initialUrl = '/'
} = {}) {

    let inMemoryTransactions = [...transactions];
    let inMemoryMetas = [...metas];
    let inMemoryCategorias = [...categorias];
    let inMemorySubcategorias = [...subcategorias];
    let inMemoryCartoes = [...cartoes];
    let inMemoryTags = [...tags];
    let inMemorySettlements = [...settlements];

    const normalize = s => String(s || '').replace(/[\u00a0\s]+/g, ' ').trim().toLowerCase();
    const getQueryParam = (search, param) => {
        const match = search.match(new RegExp(`(?:^|[?&])${param}=eq\\.([^&]+)`));
        return match ? decodeURIComponent(match[1]) : null;
    };

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

            if (pathname.includes('/auth/v1/logout')) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({})
                });
            }

            // Mock de Redefinição de Senha (Supabase Auth recover)
            if (pathname.includes('/auth/v1/recover')) {
                const body = route.request().postDataJSON() || {};
                const email = (body.email || '').trim().toLowerCase();

                if (email === 'ratelimit@exemplo.com') {
                    return route.fulfill({
                        status: 429,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            message: 'For security purposes, you can only request this once every 60 seconds',
                            status: 429
                        })
                    });
                }

                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({})
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

                    const createdItems = newItems.map((item, idx) => ({
                        id: item.id || `tx-created-${Date.now()}-${idx}`,
                        created_at: new Date().toISOString(),
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
                    const targetId = getQueryParam(urlObj.search, 'id');
                    const targetCat = getQueryParam(urlObj.search, 'categoria');
                    const targetSub = getQueryParam(urlObj.search, 'subcategoria');
                    const targetCard = getQueryParam(urlObj.search, 'cartao');

                    let updatedCount = 0;
                    if (targetId) {
                        const index = inMemoryTransactions.findIndex(t => t.id === targetId);
                        if (index !== -1) {
                            inMemoryTransactions[index] = { ...inMemoryTransactions[index], ...patchData };
                            updatedCount++;
                        }
                    } else {
                        const normCat = targetCat ? normalize(targetCat) : null;
                        const normSub = targetSub ? normalize(targetSub) : null;
                        const normCard = targetCard ? normalize(targetCard) : null;

                        inMemoryTransactions.forEach(t => {
                            if (t.user_id === mockUser.id) {
                                let match = true;
                                if (normCat && normalize(t.categoria) !== normCat) match = false;
                                if (normSub && normalize(t.subcategoria) !== normSub) match = false;
                                if (normCard && normalize(t.cartao) !== normCard) match = false;
                                if (match) {
                                    Object.assign(t, patchData);
                                    updatedCount++;
                                }
                            }
                        });
                    }
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify(patchData)
                    });
                }
                if (method === 'DELETE') {
                    const targetId = getQueryParam(urlObj.search, 'id');
                    const targetGroup = getQueryParam(urlObj.search, 'grupo_parcela_id');
                    if (targetId) {
                        inMemoryTransactions = inMemoryTransactions.filter(t => t.id !== targetId && String(t.id) !== String(targetId));
                        inMemorySettlements = inMemorySettlements.filter(s => s.transacao_id !== targetId && String(s.transacao_id) !== String(targetId));
                    } else if (targetGroup) {
                        inMemoryTransactions = inMemoryTransactions.filter(t => t.grupo_parcela_id !== targetGroup);
                        inMemorySettlements = inMemorySettlements.filter(s => s.grupo_parcela_id !== targetGroup);
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
                if (method === 'PATCH') {
                    const patchData = route.request().postDataJSON();
                    const targetId = getQueryParam(urlObj.search, 'id');
                    const targetCat = getQueryParam(urlObj.search, 'categoria');

                    if (targetId) {
                        const index = inMemoryMetas.findIndex(m => m.id === targetId);
                        if (index !== -1) {
                            inMemoryMetas[index] = { ...inMemoryMetas[index], ...patchData, updated_at: new Date().toISOString() };
                        }
                    } else if (targetCat) {
                        const normCat = normalize(targetCat);
                        inMemoryMetas.forEach(m => {
                            if (m.user_id === mockUser.id && (m.categoria === targetCat || normalize(m.categoria) === normCat)) {
                                Object.assign(m, patchData, { updated_at: new Date().toISOString() });
                            }
                        });
                    }

                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify(patchData)
                    });
                }
                if (method === 'DELETE') {
                    const targetId = getQueryParam(urlObj.search, 'id');
                    if (targetId) {
                        inMemoryMetas = inMemoryMetas.filter(m => m.id !== targetId);
                    }
                    return route.fulfill({
                        status: 204,
                        body: ''
                    });
                }
            }

            // Mock de Liquidações Antecipadas de Crédito (REST)
            if (pathname.includes('/rest/v1/liquidacoes_credito')) {
                if (method === 'GET') {
                    let filtered = [...inMemorySettlements];
                    const userMatch = urlObj.search.match(/user_id=eq\.([^&]+)/);
                    if (userMatch) {
                        filtered = filtered.filter(s => s.user_id === userMatch[1]);
                    }
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        headers: { 'content-range': `0-${filtered.length - 1}/${filtered.length}` },
                        body: JSON.stringify(filtered)
                    });
                }
                if (method === 'POST') {
                    const postData = route.request().postDataJSON();
                    const newItems = Array.isArray(postData) ? postData : [postData];
                    const resultItems = [];

                    for (let idx = 0; idx < newItems.length; idx++) {
                        const item = newItems[idx];
                        const userId = item.user_id || mockUser.id;

                        // 1. Validação estrita de RLS Cross-User: a transação referenciada DEVE existir e pertencer ao mesmo usuário
                        const targetTx = inMemoryTransactions.find(t => t.id === item.transacao_id);
                        if (!targetTx || targetTx.user_id !== userId) {
                            return route.fulfill({
                                status: 403,
                                contentType: 'application/json',
                                body: JSON.stringify({ message: 'new row violates row-level security policy for table "liquidacoes_credito"' })
                            });
                        }

                        // 2. Validação estrita de Coerência (Trigger handle_liquidacoes_credito_validate_coherence)
                        let effectiveGroupId = null;
                        if (targetTx.grupo_parcela_id) {
                            if (item.grupo_parcela_id && item.grupo_parcela_id !== targetTx.grupo_parcela_id) {
                                return route.fulfill({
                                    status: 400,
                                    contentType: 'application/json',
                                    body: JSON.stringify({ message: `Incoerência de grupo: transação ${item.transacao_id} pertence ao grupo ${targetTx.grupo_parcela_id}, mas a liquidação informou grupo ${item.grupo_parcela_id}.` })
                                });
                            }
                            effectiveGroupId = targetTx.grupo_parcela_id;
                        } else {
                            if (item.grupo_parcela_id) {
                                return route.fulfill({
                                    status: 400,
                                    contentType: 'application/json',
                                    body: JSON.stringify({ message: `Incoerência de grupo: transação ${item.transacao_id} é à vista/avulsa (sem grupo), mas a liquidação informou grupo ${item.grupo_parcela_id}.` })
                                });
                            }
                            effectiveGroupId = null;
                        }

                        const parcelaNum = Number(item.parcela_numero) || 1;
                        const statusVal = item.status || 'ATIVA';

                        // 3. Garantia Estrutural de Unicidade Ativa (Índices Únicos Parciais)
                        if (statusVal === 'ATIVA') {
                            if (effectiveGroupId) {
                                const hasDupGroup = inMemorySettlements.some(s =>
                                    s.user_id === userId &&
                                    s.grupo_parcela_id === effectiveGroupId &&
                                    Number(s.parcela_numero) === parcelaNum &&
                                    s.status === 'ATIVA' &&
                                    !s.cancelled_at
                                );
                                if (hasDupGroup) {
                                    return route.fulfill({
                                        status: 409,
                                        contentType: 'application/json',
                                        body: JSON.stringify({ message: 'duplicate key value violates unique constraint "unique_liquidacao_ativa_por_grupo"' })
                                    });
                                }
                            } else {
                                const hasDupTx = inMemorySettlements.some(s =>
                                    s.user_id === userId &&
                                    s.transacao_id === targetTx.id &&
                                    Number(s.parcela_numero) === parcelaNum &&
                                    s.status === 'ATIVA' &&
                                    !s.cancelled_at
                                );
                                if (hasDupTx) {
                                    return route.fulfill({
                                        status: 409,
                                        contentType: 'application/json',
                                        body: JSON.stringify({ message: 'duplicate key value violates unique constraint "unique_liquidacao_ativa_por_transacao_avulsa"' })
                                    });
                                }
                            }
                        }

                        const created = {
                            id: item.id || `settle-created-${Date.now()}-${idx}`,
                            user_id: userId,
                            transacao_id: targetTx.id,
                            grupo_parcela_id: effectiveGroupId,
                            parcela_numero: parcelaNum,
                            valor: Number(item.valor) || 0,
                            data_liquidacao: item.data_liquidacao || new Date().toISOString().split('T')[0],
                            forma_liquidacao: item.forma_liquidacao || 'PIX',
                            status: statusVal,
                            cancelled_at: item.cancelled_at || (statusVal === 'CANCELADA' ? new Date().toISOString() : null),
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        };
                        inMemorySettlements.push(created);
                        resultItems.push(created);
                    }

                    return route.fulfill({
                        status: 201,
                        contentType: 'application/json',
                        body: JSON.stringify(resultItems)
                    });
                }
                if (method === 'PATCH') {
                    const patchData = route.request().postDataJSON();
                    const targetId = getQueryParam(urlObj.search, 'id');
                    const targetTx = getQueryParam(urlObj.search, 'transacao_id');
                    const targetParcela = getQueryParam(urlObj.search, 'parcela_numero');

                    inMemorySettlements.forEach(s => {
                        let match = false;
                        if (targetId && s.id === targetId) match = true;
                        else if (targetTx && targetParcela && s.transacao_id === targetTx && String(s.parcela_numero) === String(targetParcela)) match = true;
                        else if (targetTx && !targetParcela && s.transacao_id === targetTx) match = true;

                        if (match) {
                            Object.assign(s, patchData, { updated_at: new Date().toISOString() });
                        }
                    });

                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify(patchData)
                    });
                }
                if (method === 'DELETE') {
                    // Exclusão direta via API é bloqueada por RLS (preservação da trilha contábil e soft reversal)
                    return route.fulfill({
                        status: 403,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'permission denied for table liquidacoes_credito' })
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
                    const targetId = getQueryParam(urlObj.search, 'id');
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
                    const targetId = getQueryParam(urlObj.search, 'id');
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
                    const targetId = getQueryParam(urlObj.search, 'id');
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
                    const targetId = getQueryParam(urlObj.search, 'id');
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
                    const targetId = getQueryParam(urlObj.search, 'id');
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
                    const targetId = getQueryParam(urlObj.search, 'id');
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
                    const targetId = getQueryParam(urlObj.search, 'id');
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
                    const targetId = getQueryParam(urlObj.search, 'id');
                    if (targetId) {
                        inMemoryTags = inMemoryTags.filter(t => t.id !== targetId);
                    }
                    return route.fulfill({
                        status: 204,
                        body: ''
                    });
                }
            }

            // ==========================================
            // MOCKS DAS RPCs (CATÁLOGOS 2.0 - MERGE)
            // ==========================================

            // 1. RPC merge_categories
            if (pathname.includes('/rest/v1/rpc/merge_categories')) {
                const { p_source_id, p_target_id, p_meta_action } = route.request().postDataJSON() || {};
                const sourceCat = inMemoryCategorias.find(c => c.id === p_source_id);
                const targetCat = inMemoryCategorias.find(c => c.id === p_target_id);
                if (!sourceCat || !targetCat || p_source_id === p_target_id) {
                    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Categorias inválidas para mesclagem' }) });
                }

                const normSource = normalize(sourceCat.nome);
                const normTarget = normalize(targetCat.nome);

                // Atualizar transações
                let updatedTxCount = 0;
                inMemoryTransactions.forEach(t => {
                    if (t.user_id === mockUser.id && normalize(t.categoria) === normSource) {
                        t.categoria = targetCat.nome;
                        updatedTxCount++;
                    }
                });

                // Tratar subcategorias
                let movedSubs = 0;
                let consolidatedSubs = 0;
                inMemorySubcategorias.forEach(s => {
                    if (s.user_id === mockUser.id && s.categoria_id === p_source_id) {
                        const normSub = normalize(s.nome);
                        const targetHasSub = inMemorySubcategorias.some(ts => ts.user_id === mockUser.id && ts.categoria_id === p_target_id && normalize(ts.nome) === normSub);
                        if (targetHasSub) {
                            s.ativo = false;
                            consolidatedSubs++;
                        } else {
                            s.categoria_id = p_target_id;
                            movedSubs++;
                        }
                    }
                });

                // Tratar metas
                let metaResult = 'Nenhuma meta alterada';
                const sourceMetaIndex = inMemoryMetas.findIndex(m => m.user_id === mockUser.id && normalize(m.categoria) === normSource);
                const targetMetaIndex = inMemoryMetas.findIndex(m => m.user_id === mockUser.id && normalize(m.categoria) === normTarget);

                if (sourceMetaIndex !== -1 && targetMetaIndex !== -1) {
                    const srcVal = parseFloat(inMemoryMetas[sourceMetaIndex].valor_limite) || 0;
                    const tgtVal = parseFloat(inMemoryMetas[targetMetaIndex].valor_limite) || 0;
                    if (p_meta_action === 'KEEP_TARGET') {
                        inMemoryMetas.splice(sourceMetaIndex, 1);
                        metaResult = `Limite do destino preservado (R$ ${tgtVal.toFixed(2)})`;
                    } else if (p_meta_action === 'KEEP_SOURCE') {
                        inMemoryMetas[targetMetaIndex].valor_limite = srcVal;
                        inMemoryMetas.splice(sourceMetaIndex, 1);
                        metaResult = `Limite da origem adotado (R$ ${srcVal.toFixed(2)})`;
                    } else if (p_meta_action === 'SUM') {
                        inMemoryMetas[targetMetaIndex].valor_limite = tgtVal + srcVal;
                        inMemoryMetas.splice(sourceMetaIndex, 1);
                        metaResult = `Limites somados (R$ ${(tgtVal + srcVal).toFixed(2)})`;
                    }
                } else if (sourceMetaIndex !== -1) {
                    inMemoryMetas[sourceMetaIndex].categoria = targetCat.nome;
                    inMemoryMetas[sourceMetaIndex].categoria_normalizada = normTarget;
                    metaResult = `Meta transferida para ${targetCat.nome}`;
                }

                // Inativar origem e ativar destino
                sourceCat.ativo = false;
                sourceCat.updated_at = new Date().toISOString();
                targetCat.ativo = true;
                targetCat.updated_at = new Date().toISOString();

                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        updated_transactions: updatedTxCount,
                        moved_subcategories: movedSubs,
                        consolidated_subcategories: consolidatedSubs,
                        meta_result: metaResult
                    })
                });
            }

            // 2. RPC merge_subcategories
            if (pathname.includes('/rest/v1/rpc/merge_subcategories')) {
                const { p_source_id, p_target_id } = route.request().postDataJSON() || {};
                const sourceSub = inMemorySubcategorias.find(s => s.id === p_source_id);
                const targetSub = inMemorySubcategorias.find(s => s.id === p_target_id);
                if (!sourceSub || !targetSub || p_source_id === p_target_id) {
                    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Subcategorias inválidas para mesclagem' }) });
                }

                const sourceParentCat = inMemoryCategorias.find(c => c.id === sourceSub.categoria_id);
                const targetParentCat = inMemoryCategorias.find(c => c.id === targetSub.categoria_id);
                const normSourceCat = sourceParentCat ? normalize(sourceParentCat.nome) : '';
                const normSourceSub = normalize(sourceSub.nome);
                const catChanged = sourceSub.categoria_id !== targetSub.categoria_id;

                let updatedTxCount = 0;
                inMemoryTransactions.forEach(t => {
                    if (t.user_id === mockUser.id && normalize(t.subcategoria) === normSourceSub && (!normSourceCat || normalize(t.categoria) === normSourceCat)) {
                        t.subcategoria = targetSub.nome;
                        if (catChanged && targetParentCat) {
                            t.categoria = targetParentCat.nome;
                        }
                        updatedTxCount++;
                    }
                });

                sourceSub.ativo = false;
                sourceSub.updated_at = new Date().toISOString();
                targetSub.ativo = true;
                targetSub.updated_at = new Date().toISOString();

                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        updated_transactions: updatedTxCount,
                        category_changed: catChanged
                    })
                });
            }

            // 3. RPC merge_cards
            if (pathname.includes('/rest/v1/rpc/merge_cards')) {
                const { p_source_id, p_target_id } = route.request().postDataJSON() || {};
                const sourceCard = inMemoryCartoes.find(c => c.id === p_source_id);
                const targetCard = inMemoryCartoes.find(c => c.id === p_target_id);
                if (!sourceCard || !targetCard || p_source_id === p_target_id) {
                    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Cartões inválidos para mesclagem' }) });
                }

                const normSource = normalize(sourceCard.nome);
                let updatedTxCount = 0;
                inMemoryTransactions.forEach(t => {
                    if (t.user_id === mockUser.id && normalize(t.cartao) === normSource) {
                        t.cartao = targetCard.nome;
                        updatedTxCount++;
                    }
                });

                sourceCard.ativo = false;
                sourceCard.updated_at = new Date().toISOString();
                targetCard.ativo = true;
                targetCard.updated_at = new Date().toISOString();

                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        updated_transactions: updatedTxCount
                    })
                });
            }

            // 4. RPC merge_tags
            if (pathname.includes('/rest/v1/rpc/merge_tags')) {
                const { p_source_id, p_target_id } = route.request().postDataJSON() || {};
                const sourceTag = inMemoryTags.find(t => t.id === p_source_id);
                const targetTag = inMemoryTags.find(t => t.id === p_target_id);
                if (!sourceTag || !targetTag || p_source_id === p_target_id) {
                    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Tags inválidas para mesclagem' }) });
                }

                const normSource = normalize(sourceTag.nome);
                let updatedTxCount = 0;
                let dedupCount = 0;

                inMemoryTransactions.forEach(t => {
                    if (t.user_id === mockUser.id && t.descricao) {
                        const match = t.descricao.match(/^\s*\[(.*?)\]\s*(.*)$/);
                        if (match) {
                            const tagsList = match[1].split(',').map(tag => tag.trim()).filter(Boolean);
                            const hasSource = tagsList.some(tag => normalize(tag) === normSource);
                            if (hasSource) {
                                const replacedTags = tagsList.map(tag => normalize(tag) === normSource ? targetTag.nome : tag);
                                const seen = new Set();
                                const uniqueTags = [];
                                for (const rTag of replacedTags) {
                                    const n = normalize(rTag);
                                    if (!seen.has(n)) {
                                        seen.add(n);
                                        uniqueTags.push(rTag);
                                    } else {
                                        dedupCount++;
                                    }
                                }
                                t.descricao = `[${uniqueTags.join(', ')}] ${match[2]}`;
                                updatedTxCount++;
                            }
                        }
                    }
                });

                sourceTag.ativo = false;
                sourceTag.updated_at = new Date().toISOString();
                targetTag.ativo = true;
                targetTag.updated_at = new Date().toISOString();

                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        updated_transactions: updatedTxCount,
                        deduplicated_count: dedupCount
                    })
                });
            }

            // Mock de Governança / Admin (Fase 4.5-B / B4 / B5)
            if (pathname.includes('/rest/v1/rpc/is_admin')) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(isAdmin)
                });
            }

            if (pathname.includes('/rest/v1/rpc/has_app_access')) {
                const hasAccess = Boolean(isAdmin || (userProfile && userProfile.access_status === 'approved'));
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(hasAccess)
                });
            }

            if (pathname.includes('/rest/v1/rpc/complete_legacy_profile')) {
                const { p_display_name } = route.request().postDataJSON() || {};
                const clean = String(p_display_name || '').trim();
                if (clean.length < 2 || clean.length > 80) {
                    return route.fulfill({
                        status: 400,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'Nome inválido' })
                    });
                }
                userProfile = {
                    user_id: mockUser.id,
                    display_name: clean,
                    access_status: 'pending',
                    created_at: new Date().toISOString()
                };
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(true)
                });
            }

            // RPCs Administrativas (Fase 4.5-C3)
            if (pathname.includes('/rest/v1/rpc/admin_list_users')) {
                if (!isAdmin) {
                    return route.fulfill({
                        status: 403,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'Acesso negado. Apenas administradores podem executar esta operação.' })
                    });
                }
                const body = route.request().postDataJSON() || {};
                const search = (body.p_search || '').trim().toLowerCase();
                const status = (body.p_status || '').trim().toLowerCase();

                const validStatuses = ['needs_profile', 'pending', 'approved', 'rejected', 'suspended'];
                if (status && !validStatuses.includes(status)) {
                    return route.fulfill({
                        status: 400,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: `Status de filtro inválido (${status}).` })
                    });
                }

                let list = [
                    {
                        user_id: mockUser.id,
                        display_name: userProfile?.display_name || null,
                        email: mockUser.email,
                        signup_at: mockUser.created_at,
                        last_sign_in_at: '2026-09-11T08:00:00Z',
                        access_status: userProfile?.access_status || 'needs_profile'
                    },
                    {
                        user_id: 'user-pending-uuid-0002',
                        display_name: 'Beatriz Lima',
                        email: 'beatriz@exemplo.com',
                        signup_at: '2026-09-10T14:00:00Z',
                        last_sign_in_at: '2026-09-10T14:05:00Z',
                        access_status: 'pending'
                    },
                    {
                        user_id: 'user-legacy-uuid-0003',
                        display_name: null,
                        email: 'legado@exemplo.com',
                        signup_at: '2026-08-01T10:00:00Z',
                        last_sign_in_at: null,
                        access_status: 'needs_profile'
                    },
                    {
                        user_id: 'user-suspended-uuid-0004',
                        display_name: 'Carlos Antigo',
                        email: 'carlos@exemplo.com',
                        signup_at: '2026-08-15T11:00:00Z',
                        last_sign_in_at: '2026-09-01T09:00:00Z',
                        access_status: 'suspended'
                    }
                ];

                if (search) {
                    list = list.filter(u =>
                        (u.display_name && u.display_name.toLowerCase().includes(search)) ||
                        (u.email && u.email.toLowerCase().includes(search))
                    );
                }

                if (status) {
                    list = list.filter(u => u.access_status === status);
                }

                const limit = Math.min(Math.max(body.p_limit || 50, 1), 100);
                const offset = Math.max(body.p_offset || 0, 0);
                list = list.slice(offset, offset + limit);

                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(list)
                });
            }

            if (pathname.includes('/rest/v1/rpc/admin_set_user_access')) {
                if (!isAdmin) {
                    return route.fulfill({
                        status: 403,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'Acesso negado. Apenas administradores podem executar esta operação.' })
                    });
                }
                const body = route.request().postDataJSON() || {};
                const targetId = body.p_user_id;
                const newStatus = (body.p_new_status || '').trim().toLowerCase();

                if (!targetId) {
                    return route.fulfill({
                        status: 400,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'O identificador do usuário (p_user_id) é obrigatório.' })
                    });
                }

                if (!['approved', 'rejected', 'suspended'].includes(newStatus)) {
                    return route.fulfill({
                        status: 400,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: `Status de acesso inválido (${newStatus}).` })
                    });
                }

                // Alvo não pode ser admin
                if (targetId === 'admin-uuid-protected') {
                    return route.fulfill({
                        status: 403,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'Operação não permitida. O status de administradores não pode ser alterado por esta via.' })
                    });
                }

                // Alvo inexistente
                if (targetId === 'inexistent-uuid') {
                    return route.fulfill({
                        status: 404,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'Usuário não encontrado.' })
                    });
                }

                // Usuário legado sem perfil cadastrado
                if (targetId === 'legacy-without-profile') {
                    return route.fulfill({
                        status: 400,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'Usuário legado não possui perfil cadastrado. O usuário deve informar seu nome antes de ter o status alterado.' })
                    });
                }

                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(true)
                });
            }

            // RPC admin_get_activity_metrics (Fase 4.5-C4.1)
            if (pathname.includes('/rest/v1/rpc/admin_get_activity_metrics')) {
                if (!isAdmin) {
                    return route.fulfill({
                        status: 403,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'Acesso negado. Apenas administradores podem executar esta operação.' })
                    });
                }

                const mockMetrics = [
                    {
                        user_id: mockUser.id,
                        last_activity_at: '2026-09-11T09:30:00Z',
                        operations_30d_band: '6-20',
                        activity_level: 'ACTIVE',
                        uses_transactions: true,
                        uses_cards: true,
                        uses_investments: false,
                        uses_settlements: true,
                        uses_metas: true
                    },
                    {
                        user_id: 'user-pending-uuid-0002',
                        last_activity_at: '2026-09-10T14:05:00Z',
                        operations_30d_band: '1-5',
                        activity_level: 'ACTIVE',
                        uses_transactions: true,
                        uses_cards: false,
                        uses_investments: false,
                        uses_settlements: false,
                        uses_metas: false
                    },
                    {
                        user_id: 'user-legacy-uuid-0003',
                        last_activity_at: null,
                        operations_30d_band: '0',
                        activity_level: 'NEVER',
                        uses_transactions: false,
                        uses_cards: false,
                        uses_investments: false,
                        uses_settlements: false,
                        uses_metas: false
                    },
                    {
                        user_id: 'user-suspended-uuid-0004',
                        last_activity_at: '2026-08-01T09:00:00Z',
                        operations_30d_band: '0',
                        activity_level: 'INACTIVE',
                        uses_transactions: true,
                        uses_cards: true,
                        uses_investments: true,
                        uses_settlements: false,
                        uses_metas: false
                    }
                ];

                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(mockMetrics)
                });
            }

            // RPC admin_get_activity_summary (Fase 4.5-C4.1)
            if (pathname.includes('/rest/v1/rpc/admin_get_activity_summary')) {
                if (!isAdmin) {
                    return route.fulfill({
                        status: 403,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'Acesso negado. Apenas administradores podem executar esta operação.' })
                    });
                }

                const mockSummary = [
                    {
                        total_users: 4,
                        active_7d: 2,
                        active_30d: 2,
                        inactive_30d: 1,
                        pending_users: 1,
                        approved_users: 1,
                        suspended_users: 1,
                        rejected_users: 0,
                        users_using_transactions: 3,
                        users_using_cards: 2,
                        users_using_investments: 1,
                        users_using_settlements: 1,
                        users_using_metas: 1
                    }
                ];

                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(mockSummary)
                });
            }

            // RPC admin_log_password_reset_request (Fase 4.5-C5-C)
            if (pathname.includes('/rest/v1/rpc/admin_log_password_reset_request')) {
                if (!isAdmin) {
                    return route.fulfill({
                        status: 403,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'Acesso negado. Apenas administradores podem executar esta operação.' })
                    });
                }
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(true)
                });
            }

            // RPC admin_get_user_reset_status (Fase 4.5-C5-D)
            if (pathname.includes('/rest/v1/rpc/admin_get_user_reset_status')) {
                if (!isAdmin) {
                    return route.fulfill({
                        status: 403,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'Acesso negado. Apenas administradores podem executar esta operação.' })
                    });
                }
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([{
                        has_active_reset: false,
                        reset_id: null,
                        created_at: null,
                        expires_at: null,
                        is_recoverable: false
                    }])
                });
            }

            // RPC admin_reset_user_data (Fase 4.5-C5-D)
            if (pathname.includes('/rest/v1/rpc/admin_reset_user_data')) {
                if (!isAdmin) {
                    return route.fulfill({
                        status: 403,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'Acesso negado. Apenas administradores podem executar esta operação.' })
                    });
                }
                const now = new Date().toISOString();
                const exp = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([{
                        reset_id: 'mock-reset-uuid-48h',
                        created_at: now,
                        expires_at: exp
                    }])
                });
            }

            // RPC admin_restore_user_data (Fase 4.5-C5-D)
            if (pathname.includes('/rest/v1/rpc/admin_restore_user_data')) {
                if (!isAdmin) {
                    return route.fulfill({
                        status: 403,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'Acesso negado. Apenas administradores podem executar esta operação.' })
                    });
                }
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(true)
                });
            }

            // Edge Function admin-delete-user (Fase 4.5-C5-E)
            if (pathname.includes('/functions/v1/admin-delete-user')) {
                if (method === 'OPTIONS') {
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'ok' })
                    });
                }

                if (!isAdmin) {
                    return route.fulfill({
                        status: 403,
                        contentType: 'application/json',
                        body: JSON.stringify({ error: 'Acesso negado. Apenas administradores podem executar esta operação.' })
                    });
                }

                let postData = {};
                try {
                    postData = JSON.parse(route.request().postData() || '{}');
                } catch {
                    postData = {};
                }

                const targetId = postData.target_user_id;

                if (!targetId) {
                    return route.fulfill({
                        status: 400,
                        contentType: 'application/json',
                        body: JSON.stringify({ error: 'Identificador do usuário alvo inválido ou ausente.' })
                    });
                }

                // Bloqueio de auto-exclusão
                if (targetId === mockUser.id) {
                    return route.fulfill({
                        status: 403,
                        contentType: 'application/json',
                        body: JSON.stringify({ error: 'Operação não permitida sobre a própria conta de administrador.' })
                    });
                }

                // Bloqueio de exclusão de outras contas de administração
                if (targetId === 'admin-uuid-protected') {
                    return route.fulfill({
                        status: 403,
                        contentType: 'application/json',
                        body: JSON.stringify({ error: 'Operação não permitida sobre contas de administração.' })
                    });
                }

                // Usuário não encontrado
                if (targetId === 'inexistent-uuid') {
                    return route.fulfill({
                        status: 404,
                        contentType: 'application/json',
                        body: JSON.stringify({ error: 'Usuário não encontrado.' })
                    });
                }

                // Simula a remoção dos dados em memória do usuário deletado
                inMemoryTransactions = inMemoryTransactions.filter(t => t.user_id !== targetId);
                inMemoryMetas = inMemoryMetas.filter(m => m.user_id !== targetId);
                inMemoryCategorias = inMemoryCategorias.filter(c => c.user_id !== targetId);
                inMemorySubcategorias = inMemorySubcategorias.filter(s => s.user_id !== targetId);
                inMemoryCartoes = inMemoryCartoes.filter(k => k.user_id !== targetId);
                inMemoryTags = inMemoryTags.filter(tg => tg.user_id !== targetId);
                inMemorySettlements = inMemorySettlements.filter(st => st.user_id !== targetId);

                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        message: 'Conta de usuário excluída permanentemente com sucesso.'
                    })
                });
            }

            // RPC admin_prepare_user_deletion (Fase 4.5-C5-E)
            if (pathname.includes('/rest/v1/rpc/admin_prepare_user_deletion')) {
                if (!isAdmin) {
                    return route.fulfill({
                        status: 403,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'Acesso negado. Apenas administradores podem executar esta operação.' })
                    });
                }

                let postData = {};
                try {
                    postData = JSON.parse(route.request().postData() || '{}');
                } catch {
                    postData = {};
                }

                const targetId = postData.p_target_user_id;

                if (!targetId) {
                    return route.fulfill({
                        status: 400,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'Identificador do usuário é obrigatório.' })
                    });
                }

                if (targetId === mockUser.id) {
                    return route.fulfill({
                        status: 403,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'Operação não permitida sobre a própria conta de administrador.' })
                    });
                }

                if (targetId === 'admin-uuid-protected') {
                    return route.fulfill({
                        status: 403,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'Operação não permitida sobre contas de administração.' })
                    });
                }

                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        target_user_id: targetId,
                        target_email: 'user@test.com',
                        display_name: 'Usuário Teste'
                    })
                });
            }

            if (pathname.includes('/rest/v1/user_profiles')) {
                if (method === 'GET') {
                    const reqUserId = getQueryParam(url, 'user_id');
                    // RLS em user_profiles: user_id = auth.uid().
                    // Mesmo se for admin, SELECT direto via PostgREST só retorna o próprio perfil (ou vazio se filtrar por outro)
                    if (reqUserId && reqUserId !== mockUser.id) {
                        return route.fulfill({
                            status: 200,
                            contentType: 'application/json',
                            headers: { 'content-range': '*/0' },
                            body: JSON.stringify([])
                        });
                    }
                    const profiles = userProfile ? [userProfile] : [];
                    const accept = route.request().headers()['accept'] || '';
                    if (accept.includes('vnd.pgrst.object+json')) {
                        if (profiles.length === 0) {
                            return route.fulfill({
                                status: 406,
                                contentType: 'application/json',
                                body: JSON.stringify({ message: 'JSON object requested, multiple (or no) rows returned' })
                            });
                        }
                        return route.fulfill({
                            status: 200,
                            contentType: 'application/vnd.pgrst.object+json',
                            body: JSON.stringify(profiles[0])
                        });
                    }
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        headers: { 'content-range': profiles.length ? `0-${profiles.length - 1}/${profiles.length}` : '*/0' },
                        body: JSON.stringify(profiles)
                    });
                }
                // INSERT / UPDATE direto do cliente é bloqueado pelo RLS deny-all
                return route.fulfill({
                    status: 403,
                    contentType: 'application/json',
                    body: JSON.stringify({ message: 'permission denied for table user_profiles' })
                });
            }

            if (pathname.includes('/rest/v1/admin_users')) {
                // Deny-all direto para clientes comuns
                if (method === 'GET') {
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        headers: { 'content-range': '*/0' },
                        body: JSON.stringify([])
                    });
                }
                return route.fulfill({
                    status: 403,
                    contentType: 'application/json',
                    body: JSON.stringify({ message: 'permission denied for table admin_users' })
                });
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
    await page.goto(initialUrl, { waitUntil: 'domcontentloaded' });

    if (authenticated) {
        if (isAdmin || (userProfile && userProfile.access_status === 'approved')) {
            // Aguarda exibição do aplicativo principal
            await page.waitForSelector('#appView:not([style*="display: none"])', { timeout: 20000 });
        } else if (!userProfile) {
            // Aguarda exibição da tela de completar cadastro para legado
            await page.waitForSelector('#completeProfileView:not([style*="display: none"])', { timeout: 20000 });
        } else {
            // Aguarda exibição da tela de aprovação pendente/bloqueada
            await page.waitForSelector('#pendingApprovalView:not([style*="display: none"])', { timeout: 20000 });
        }
    }

    return {
        getTransactions: () => inMemoryTransactions,
        getMetas: () => inMemoryMetas,
        getCategories: () => inMemoryCategorias,
        getSubcategories: () => inMemorySubcategorias,
        getCards: () => inMemoryCartoes,
        getTags: () => inMemoryTags,
        getSettlements: () => inMemorySettlements
    };
}

module.exports = {
    setupAuthenticatedApp
};
