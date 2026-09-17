// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');

test.describe('INVESTIGAÇÃO CRÍTICA — POSSÍVEL PERDA DE TRANSAÇÕES / RACE CONDITION EM "SALVAR E LANÇAR OUTRO"', () => {

    test.beforeEach(async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [],
            cartoes: [{ id: 'card-1', nome: 'Nubank', ativo: true, user_id: 'test-user-uuid-1234' }],
            categorias: [{ id: 'cat-1', nome: 'Alimentação', ativo: true, user_id: 'test-user-uuid-1234' }]
        });
    });

    test('1. CENÁRIO SLOW — CONTROLE (10 lançamentos sequenciais aguardando conclusão)', async ({ page }) => {
        const postsInitiated = [];
        const postsCompleted = [];
        const createdIds = new Set();
        let toastSuccessCount = 0;

        page.on('request', (req) => {
            if (req.url().includes('/rest/v1/transacoes') && req.method() === 'POST') {
                const payload = req.postDataJSON();
                postsInitiated.push({ time: Date.now(), payload });
            }
        });

        page.on('response', async (res) => {
            if (res.url().includes('/rest/v1/transacoes') && res.request().method() === 'POST') {
                try {
                    const json = await res.json();
                    const items = Array.isArray(json) ? json : [json];
                    items.forEach(it => {
                        if (it && it.id) createdIds.add(it.id);
                    });
                    postsCompleted.push({ time: Date.now(), status: res.status(), items });
                } catch (e) {}
            }
        });

        // Navega para aba Novo Registro
        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await expect(page.locator('#tab-novo')).toHaveClass(/active/);

        // Preenche tipo e pagamento
        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_cartao').selectOption('Nubank');

        for (let i = 1; i <= 10; i++) {
            const numStr = String(i).padStart(2, '0');
            const desc = `RACE-SLOW-${numStr}`;
            const val = (10 + i * 0.01).toFixed(2);

            await page.locator('#i_descricao').fill(desc);
            await page.locator('#i_valor').fill(val);

            // Clica em Salvar e Lançar Outro
            const btnSalvarOutro = page.getByRole('button', { name: /Salvar e Lançar Outro/i });
            await btnSalvarOutro.click();

            // Aguarda o toast de sucesso
            const toast = page.locator('#toastContainer .toast-success');
            await expect(toast.last()).toBeVisible({ timeout: 5000 });
            toastSuccessCount++;

            // Aguarda o campo descrição ser resetado
            await expect(page.locator('#i_descricao')).toHaveValue('', { timeout: 3000 });
        }

        await page.waitForTimeout(1000);

        // Verifica no Histórico
        await page.getByRole('button', { name: 'Resumo Geral' }).click();
        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await page.locator('#monthSelector').selectOption('all');
        await page.waitForTimeout(500);

        const rows = page.locator('#resumoExtratoTableBody tr');
        const count = await rows.count();
        const foundDescs = [];
        for (let i = 0; i < count; i++) {
            const text = await rows.nth(i).locator('.cell-desc').innerText();
            if (text.startsWith('RACE-SLOW-')) foundDescs.push(text);
        }

        console.log('=== RESULTADO SLOW ===');
        console.log(`Tentados: 10`);
        console.log(`UI Sucesso: ${toastSuccessCount}`);
        console.log(`POSTs Iniciados: ${postsInitiated.length}`);
        console.log(`POSTs Concluídos: ${postsCompleted.length}`);
        console.log(`IDs Únicos: ${createdIds.size}`);
        console.log(`Encontrados no Histórico: ${foundDescs.length}`);

        expect(postsCompleted.length).toBe(10);
        expect(createdIds.size).toBe(10);
        expect(foundDescs.length).toBe(10);
    });

    test('2. CENÁRIO FAST — PRINCIPAL (10 lançamentos sem espera artificial)', async ({ page }) => {
        const eventsLog = [];
        const postsInitiated = [];
        const postsCompleted = [];
        const createdIds = new Set();
        let toastSuccessCount = 0;

        page.on('request', (req) => {
            if (req.url().includes('/rest/v1/transacoes') && req.method() === 'POST') {
                const time = Date.now();
                const payload = req.postDataJSON();
                postsInitiated.push({ time, payload });
                eventsLog.push({ type: 'T4_INSERT_INITIATED', time, payload });
            }
        });

        page.on('response', async (res) => {
            if (res.url().includes('/rest/v1/transacoes') && res.request().method() === 'POST') {
                try {
                    const time = Date.now();
                    const json = await res.json();
                    const items = Array.isArray(json) ? json : [json];
                    items.forEach(it => {
                        if (it && it.id) createdIds.add(it.id);
                    });
                    postsCompleted.push({ time, status: res.status(), items });
                    eventsLog.push({ type: 'T5_INSERT_COMPLETED', time, items });
                } catch (e) {}
            }
        });

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await expect(page.locator('#tab-novo')).toHaveClass(/active/);

        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_cartao').selectOption('Nubank');

        for (let i = 1; i <= 10; i++) {
            const numStr = String(i).padStart(2, '0');
            const desc = `RACE-FAST-${numStr}`;
            const val = (10 + i * 0.01).toFixed(2);

            const t8Time = Date.now();
            eventsLog.push({ type: 'T8_USER_START_FILL', time: t8Time, iteration: i });

            await page.locator('#i_descricao').fill(desc);
            await page.locator('#i_valor').fill(val);

            const t1Time = Date.now();
            eventsLog.push({ type: 'T1_CLICK_SALVAR_OUTRO', time: t1Time, iteration: i });

            const btnSalvarOutro = page.getByRole('button', { name: /Salvar e Lançar Outro/i });
            await btnSalvarOutro.click();

            // FAST: Esperamos o reset do campo descrição para começar o próximo
            await expect(page.locator('#i_descricao')).toHaveValue('', { timeout: 4000 });
            eventsLog.push({ type: 'T7_RESET_DETECTED', time: Date.now(), iteration: i });
            toastSuccessCount++;
        }

        await page.waitForTimeout(1500);

        // Verifica no Histórico
        await page.getByRole('button', { name: 'Resumo Geral' }).click();
        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await page.locator('#monthSelector').selectOption('all');
        await page.waitForTimeout(500);

        const rows = page.locator('#resumoExtratoTableBody tr');
        const count = await rows.count();
        const foundDescs = [];
        for (let i = 0; i < count; i++) {
            const text = await rows.nth(i).locator('.cell-desc').innerText();
            if (text.startsWith('RACE-FAST-')) foundDescs.push(text);
        }

        console.log('=== RESULTADO FAST ===');
        console.log(`Tentados: 10`);
        console.log(`UI Sucesso (resets): ${toastSuccessCount}`);
        console.log(`POSTs Iniciados: ${postsInitiated.length}`);
        console.log(`POSTs Concluídos: ${postsCompleted.length}`);
        console.log(`IDs Únicos: ${createdIds.size}`);
        console.log(`Encontrados no Histórico: ${foundDescs.length}`);

        expect(postsCompleted.length).toBe(10);
        expect(createdIds.size).toBe(10);
        expect(foundDescs.length).toBe(10);
    });

    test('3. CENÁRIO DOUBLE-CLICK (Double-click em Salvar e Lançar Outro deve gerar EXATAMENTE 1 POST)', async ({ page }) => {
        const postsInitiated = [];
        const postsCompleted = [];
        const createdIds = new Set();

        page.on('request', (req) => {
            if (req.url().includes('/rest/v1/transacoes') && req.method() === 'POST') {
                postsInitiated.push({ time: Date.now(), payload: req.postDataJSON() });
            }
        });

        page.on('response', async (res) => {
            if (res.url().includes('/rest/v1/transacoes') && res.request().method() === 'POST') {
                try {
                    const json = await res.json();
                    const items = Array.isArray(json) ? json : [json];
                    items.forEach(it => {
                        if (it && it.id) createdIds.add(it.id);
                    });
                    postsCompleted.push({ time: Date.now(), status: res.status() });
                } catch (e) {}
            }
        });

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_cartao').selectOption('Nubank');

        await page.locator('#i_descricao').fill('RACE-DOUBLE-CLICK-01');
        await page.locator('#i_valor').fill('99.99');

        const btnSalvarOutro = page.locator('#btnSalvarOutro');
        // Realiza duplo clique rápido
        await btnSalvarOutro.dblclick();

        await page.waitForTimeout(1000);

        console.log('=== RESULTADO DOUBLE-CLICK ===');
        console.log(`POSTs Iniciados: ${postsInitiated.length}`);
        console.log(`POSTs Concluídos: ${postsCompleted.length}`);
        console.log(`IDs Únicos Criados: ${createdIds.size}`);

        expect(postsInitiated.length).toBe(1);
        expect(postsCompleted.length).toBe(1);
        expect(createdIds.size).toBe(1);
    });

    test('4. CENÁRIO LATENCY (Atraso de rede de 600ms e recuperação após erro)', async ({ page }) => {
        let isButtonDisabledDuringFlight = false;
        let postsCount = 0;

        await page.route('**/rest/v1/transacoes*', async (route) => {
            const req = route.request();
            if (req.method() === 'POST') {
                postsCount++;
                // Introduz 600ms de latência
                await new Promise(r => setTimeout(r, 600));
            }
            await route.fallback();
        });

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_cartao').selectOption('Nubank');

        await page.locator('#i_descricao').fill('RACE-LATENCY-01');
        await page.locator('#i_valor').fill('150.00');

        const btnSalvarOutro = page.locator('#btnSalvarOutro');
        const btnSalvar = page.locator('#btnSalvar');

        // Clica para iniciar o save
        await btnSalvarOutro.click();

        // Imediatamente enquanto o POST está em voo:
        await page.waitForTimeout(100);
        isButtonDisabledDuringFlight = await btnSalvarOutro.isDisabled();
        const isSalvarDisabled = await btnSalvar.isDisabled();
        const buttonTextDuringFlight = await btnSalvarOutro.innerText();

        // Tenta acionar save novamente durante o voo (deve ser ignorado/rejeitado pela trava)
        try {
            await btnSalvarOutro.click({ timeout: 200, force: true });
        } catch (e) {}

        // Aguarda a conclusão do save com latência
        await page.waitForTimeout(1200);

        const isButtonEnabledAfterFlight = await btnSalvarOutro.isEnabled();
        const buttonTextAfterFlight = await btnSalvarOutro.innerText();

        console.log('=== RESULTADO LATENCY ===');
        console.log(`Botão desabilitado durante o voo? ${isButtonDisabledDuringFlight}`);
        console.log(`Botão Salvar Geral desabilitado? ${isSalvarDisabled}`);
        console.log(`Texto durante voo: ${buttonTextDuringFlight}`);
        console.log(`Total de POSTs recebidos (deve ser 1): ${postsCount}`);
        console.log(`Botão habilitado após voo? ${isButtonEnabledAfterFlight}`);
        console.log(`Texto após voo: ${buttonTextAfterFlight}`);

        expect(isButtonDisabledDuringFlight).toBe(true);
        expect(isSalvarDisabled).toBe(true);
        expect(buttonTextDuringFlight).toContain('Salvando');
        expect(postsCount).toBe(1);
        expect(isButtonEnabledAfterFlight).toBe(true);
        expect(buttonTextAfterFlight).toBe('🟢 Salvar e Lançar Outro');

        // Teste de recuperação após erro:
        // Mock de falha na próxima inserção (uma única vez)
        let errorSimulated = false;
        await page.route('**/rest/v1/transacoes*', async (route) => {
            const req = route.request();
            if (req.method() === 'POST' && !errorSimulated) {
                errorSimulated = true;
                return route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({ message: 'Erro simulado de banco' })
                });
            }
            await route.fallback();
        });

        await page.locator('#i_descricao').fill('RACE-ERROR-RECOVERY');
        await page.locator('#i_valor').fill('55.00');
        await btnSalvarOutro.click();

        // Aguarda mensagem de erro (toast)
        const toastError = page.locator('#toastContainer .toast-error');
        await expect(toastError.last()).toBeVisible({ timeout: 5000 });

        // Verifica que o botão foi reabilitado e dados preservados
        const isButtonEnabledAfterError = await btnSalvarOutro.isEnabled();
        const descValuePreserved = await page.locator('#i_descricao').inputValue();

        console.log(`Botão habilitado após erro? ${isButtonEnabledAfterError}`);
        console.log(`Dados preservados no formulário após erro? ${descValuePreserved === 'RACE-ERROR-RECOVERY'}`);

        expect(isButtonEnabledAfterError).toBe(true);
        expect(descValuePreserved).toBe('RACE-ERROR-RECOVERY');

        // Tenta salvar novamente após erro (deve ter sucesso)
        await btnSalvarOutro.click();
        const toastSuccess = page.locator('#toastContainer .toast-success');
        await expect(toastSuccess.last()).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#i_descricao')).toHaveValue('', { timeout: 3000 });
        console.log(`Nova tentativa de save após erro teve sucesso!`);
    });

    test('5. CENÁRIO NOVA CATEGORIA + FAST (Criar categoria no meio do fluxo)', async ({ page }) => {
        const postsCompleted = [];
        const createdIds = new Set();

        page.on('response', async (res) => {
            if (res.url().includes('/rest/v1/transacoes') && res.request().method() === 'POST') {
                try {
                    const json = await res.json();
                    const items = Array.isArray(json) ? json : [json];
                    items.forEach(it => {
                        if (it && it.id) createdIds.add(it.id);
                    });
                    postsCompleted.push(res.status());
                } catch (e) {}
            }
        });

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();

        // 1. Abre modal de nova categoria selecionando __NEW__ no dropdown
        await page.locator('#i_categoria').selectOption('__NEW__');
        await expect(page.locator('#catalogModal')).toBeVisible();

        // 2. Preenche nova categoria
        await page.locator('#cat_modal_name').fill('Categoria Nova Teste');
        await page.locator('#btnSaveCatalogModal').click();
        await expect(page.locator('#catalogModal')).toBeHidden();

        // 3. Verifica se categoria foi selecionada
        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_cartao').selectOption('Nubank');

        // 4. Lança 5 despesas rápidas nessa nova categoria
        for (let i = 1; i <= 5; i++) {
            const numStr = String(i).padStart(2, '0');
            await page.locator('#i_descricao').fill(`RACE-CAT-${numStr}`);
            await page.locator('#i_valor').fill(`${i * 25}.00`);

            const btnSalvarOutro = page.getByRole('button', { name: /Salvar e Lançar Outro/i });
            await btnSalvarOutro.click();
            await expect(page.locator('#i_descricao')).toHaveValue('', { timeout: 4000 });
        }

        await page.waitForTimeout(1000);

        // Verifica no Histórico
        await page.getByRole('button', { name: 'Resumo Geral' }).click();
        await page.locator('#monthSelector').selectOption('all');
        await page.waitForTimeout(500);

        const rows = page.locator('#resumoExtratoTableBody tr');
        const count = await rows.count();
        const foundCatTxs = [];
        for (let i = 0; i < count; i++) {
            const text = await rows.nth(i).locator('.cell-desc').innerText();
            if (text.startsWith('RACE-CAT-')) foundCatTxs.push(text);
        }

        console.log('=== RESULTADO NOVA CATEGORIA ===');
        console.log(`Transações salvas: ${postsCompleted.length}`);
        console.log(`Transações encontradas no Histórico: ${foundCatTxs.length}`);

        expect(postsCompleted.length).toBe(5);
        expect(foundCatTxs.length).toBe(5);
    });

    test('6. CENÁRIO "SALVAR" NORMAL (Comparativo)', async ({ page }) => {
        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_cartao').selectOption('Nubank');

        await page.locator('#i_descricao').fill('RACE-NORMAL-SAVE-01');
        await page.locator('#i_valor').fill('80.00');

        const btnSalvar = page.locator('#btnSalvar');
        await btnSalvar.click();

        // Após salvar normal, deve redirecionar para o resumo
        await expect(page.locator('#tab-resumo')).toHaveClass(/active/, { timeout: 5000 });
        await page.locator('#monthSelector').selectOption('all');

        const rows = page.locator('#resumoExtratoTableBody tr');
        const count = await rows.count();
        let found = false;
        for (let i = 0; i < count; i++) {
            const text = await rows.nth(i).locator('.cell-desc').innerText();
            if (text.includes('RACE-NORMAL-SAVE-01')) found = true;
        }

        console.log('=== RESULTADO NORMAL SAVE ===');
        console.log(`Redirecionou para resumo? Sim`);
        console.log(`Encontrado no Histórico? ${found}`);
        expect(found).toBe(true);
    });

    test('7. CENÁRIO VOLUME 25 (25 lançamentos consecutivos rápidos)', async ({ page }) => {
        const postsCompleted = [];
        const createdIds = new Set();
        const payloadsSent = [];

        page.on('request', (req) => {
            if (req.url().includes('/rest/v1/transacoes') && req.method() === 'POST') {
                const payload = req.postDataJSON();
                payloadsSent.push(payload);
            }
        });

        page.on('response', async (res) => {
            if (res.url().includes('/rest/v1/transacoes') && res.request().method() === 'POST') {
                try {
                    const json = await res.json();
                    const items = Array.isArray(json) ? json : [json];
                    items.forEach(it => {
                        if (it && it.id) createdIds.add(it.id);
                    });
                    postsCompleted.push(res.status());
                } catch (e) {}
            }
        });

        await page.getByRole('button', { name: '➕ Novo Registro' }).click();
        await page.locator('#i_tipo').selectOption('Despesa');
        await page.locator('#i_pagamento').selectOption('Cartão de Crédito');
        await page.locator('#i_cartao').selectOption('Nubank');

        for (let i = 1; i <= 25; i++) {
            const numStr = String(i).padStart(2, '0');
            const desc = `RACE-VOLUME-${numStr}`;
            const val = (20 + i * 0.5).toFixed(2);

            await page.locator('#i_descricao').fill(desc);
            await page.locator('#i_valor').fill(val);

            const btnSalvarOutro = page.getByRole('button', { name: /Salvar e Lançar Outro/i });
            await btnSalvarOutro.click();
            await expect(page.locator('#i_descricao')).toHaveValue('', { timeout: 4000 });
        }

        await page.waitForTimeout(2000);

        // Verifica no Histórico
        await page.getByRole('button', { name: 'Resumo Geral' }).click();
        await page.locator('#monthSelector').selectOption('all');
        await page.waitForTimeout(500);

        const rows = page.locator('#resumoExtratoTableBody tr');
        const count = await rows.count();
        const foundDescs = [];
        for (let i = 0; i < count; i++) {
            const text = await rows.nth(i).locator('.cell-desc').innerText();
            if (text.startsWith('RACE-VOLUME-')) foundDescs.push(text);
        }

        console.log('=== RESULTADO VOLUME 25 ===');
        console.log(`Tentados: 25`);
        console.log(`POSTs Enviados: ${payloadsSent.length}`);
        console.log(`POSTs Concluídos: ${postsCompleted.length}`);
        console.log(`IDs Únicos: ${createdIds.size}`);
        console.log(`Encontrados no Histórico: ${foundDescs.length}`);

        expect(postsCompleted.length).toBe(25);
        expect(createdIds.size).toBe(25);
        expect(foundDescs.length).toBe(25);
    });
});
