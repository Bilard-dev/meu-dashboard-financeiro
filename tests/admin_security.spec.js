/**
 * Testes E2E e de Segurança da Fundação de Autorização Admin (Fase 4.5-B / B2 / B3 / B4 / B5)
 * Valida regras de isolamento, RLS estrito (sem SELECT direto global para admin),
 * função canônica has_app_access (admin ou approved) e ciclo de vida de acesso.
 */

const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');
const { mockUser } = require('./fixtures/mockData');

test.describe('Fase 4.5-B5 — Fechamento Final da Autorização Admin e Governança', () => {

    test('1. Usuário comum lê somente o próprio perfil em user_profiles (RLS user_id = auth.uid())', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Usuário Comum',
                access_status: 'approved'
            }
        });

        // Tenta consultar perfil de outro usuário diretamente via PostgREST
        const foreignProfile = await page.evaluate(async () => {
            const { supabaseClient } = await import('./src/services/supabaseClient.js');
            const { data } = await supabaseClient
                .from('user_profiles')
                .select('*')
                .eq('user_id', '99999999-9999-9999-9999-999999999999');
            return data;
        });

        expect(foreignProfile).toEqual([]);

        // Consulta o próprio perfil com sucesso
        const ownProfile = await page.evaluate(async (uid) => {
            const { supabaseClient } = await import('./src/services/supabaseClient.js');
            const { data } = await supabaseClient
                .from('user_profiles')
                .select('*')
                .eq('user_id', uid)
                .single();
            return data;
        }, mockUser.id);

        expect(ownProfile).not.toBeNull();
        expect(ownProfile.display_name).toBe('Usuário Comum');
    });

    test('2. Admin NÃO possui SELECT direto global em user_profiles (PostgREST restrito ao próprio uid)', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            isAdmin: true,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Admin Teste',
                access_status: 'approved'
            }
        });

        // Admin tenta consultar perfil de outro usuário via PostgREST direto
        const queryForeign = await page.evaluate(async () => {
            const { supabaseClient } = await import('./src/services/supabaseClient.js');
            const { data } = await supabaseClient
                .from('user_profiles')
                .select('*')
                .eq('user_id', '22222222-2222-2222-2222-222222222222');
            return data;
        });

        // RLS garante que o admin não obtém leitura direta de outros perfis via PostgREST
        expect(queryForeign).toEqual([]);
    });

    test('3. is_admin() retorna true para admin simulado e false para usuário comum', async ({ page }) => {
        // Cenário A: Usuário comum
        await setupAuthenticatedApp(page, { isAdmin: false });
        const isComum = await page.evaluate(async () => {
            const { checkIsAdmin } = await import('./src/services/adminService.js');
            return await checkIsAdmin();
        });
        expect(isComum).toBe(false);

        // Cenário B: Administrador
        await setupAuthenticatedApp(page, { isAdmin: true });
        const isAdmin = await page.evaluate(async () => {
            const { checkIsAdmin } = await import('./src/services/adminService.js');
            return await checkIsAdmin();
        });
        expect(isAdmin).toBe(true);
    });

    test('4. has_app_access() retorna true para admin (mesmo se perfil estiver com status pending)', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            isAdmin: true,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Admin Pendente',
                access_status: 'pending'
            }
        });

        const hasAccess = await page.evaluate(async () => {
            const { checkHasAppAccess } = await import('./src/services/adminService.js');
            return await checkHasAppAccess();
        });

        expect(hasAccess).toBe(true);
    });

    test('5. has_app_access() retorna true para usuário comum aprovado (approved)', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            isAdmin: false,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Usuário Aprovado',
                access_status: 'approved'
            }
        });

        const hasAccess = await page.evaluate(async () => {
            const { checkHasAppAccess } = await import('./src/services/adminService.js');
            return await checkHasAppAccess();
        });

        expect(hasAccess).toBe(true);
    });

    test('6. has_app_access() retorna false para status pending', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            isAdmin: false,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Usuário Pendente',
                access_status: 'pending'
            }
        });

        const hasAccess = await page.evaluate(async () => {
            const { checkHasAppAccess } = await import('./src/services/adminService.js');
            return await checkHasAppAccess();
        });

        expect(hasAccess).toBe(false);
    });

    test('7. has_app_access() retorna false para status rejected', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            isAdmin: false,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Usuário Rejeitado',
                access_status: 'rejected'
            }
        });

        const hasAccess = await page.evaluate(async () => {
            const { checkHasAppAccess } = await import('./src/services/adminService.js');
            return await checkHasAppAccess();
        });

        expect(hasAccess).toBe(false);
    });

    test('8. has_app_access() retorna false para status suspended', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            isAdmin: false,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Usuário Suspenso',
                access_status: 'suspended'
            }
        });

        const hasAccess = await page.evaluate(async () => {
            const { checkHasAppAccess } = await import('./src/services/adminService.js');
            return await checkHasAppAccess();
        });

        expect(hasAccess).toBe(false);
    });

    test('9. complete_legacy_profile continua estritamente seguro', async ({ page }) => {
        await setupAuthenticatedApp(page, { userProfile: null, isAdmin: false });

        // A) Valida detecção de needs_profile
        const accessInfo = await page.evaluate(async () => {
            const { getMyAccessStatus } = await import('./src/services/adminService.js');
            return await getMyAccessStatus();
        });
        expect(accessInfo.status).toBe('needs_profile');

        // B) Validação no cliente antes do envio: rejeita vazios e comprimentos inválidos
        const resVazio = await page.evaluate(async () => {
            const { completeLegacyProfile } = await import('./src/services/adminService.js');
            return await completeLegacyProfile('');
        });
        expect(resVazio.success).toBe(false);
        expect(resVazio.error.message).toContain('mínimo 2 caracteres');

        const resCurto = await page.evaluate(async () => {
            const { completeLegacyProfile } = await import('./src/services/adminService.js');
            return await completeLegacyProfile('X');
        });
        expect(resCurto.success).toBe(false);

        const resLongo = await page.evaluate(async () => {
            const { completeLegacyProfile } = await import('./src/services/adminService.js');
            return await completeLegacyProfile('A'.repeat(81));
        });
        expect(resLongo.success).toBe(false);

        // C) Sucesso com nome válido
        const resOk = await page.evaluate(async () => {
            const { completeLegacyProfile } = await import('./src/services/adminService.js');
            return await completeLegacyProfile('Thiago Bilard');
        });
        expect(resOk.success).toBe(true);
    });

    test('10. RLS em admin_users e bundles: isolamento total e ausência de service_role', async ({ page }) => {
        await setupAuthenticatedApp(page);

        // Clientes comuns não podem ler nem inserir em admin_users
        const result = await page.evaluate(async () => {
            const { supabaseClient, SUPABASE_ANON_KEY } = await import('./src/services/supabaseClient.js');

            const { data: selectData } = await supabaseClient.from('admin_users').select('*');
            const { data: insertData } = await supabaseClient.from('admin_users').insert([{ user_id: '11111111-1111-1111-1111-111111111111' }]);

            let role = 'unknown';
            try {
                role = JSON.parse(atob(SUPABASE_ANON_KEY.split('.')[1])).role;
            } catch {}

            return {
                selectCount: selectData ? selectData.length : 0,
                insertData,
                role
            };
        });

        expect(result.selectCount).toBe(0);
        expect(result.insertData).toBeNull();
        expect(result.role).toBe('anon');
    });

    test('11. admin_list_users: admin consegue listar usuários e usuário comum é negado', async ({ page }) => {
        // Cenário A: Usuário comum tenta chamar admin_list_users
        await setupAuthenticatedApp(page, { isAdmin: false });
        const resComum = await page.evaluate(async () => {
            const { listAdminUsers } = await import('./src/services/adminService.js');
            return await listAdminUsers();
        });
        expect(resComum.users).toEqual([]);
        expect(resComum.error).not.toBeNull();
        expect(resComum.error.message).toContain('Acesso negado');

        // Cenário B: Administrador chama admin_list_users com sucesso
        await setupAuthenticatedApp(page, { isAdmin: true });
        const resAdmin = await page.evaluate(async () => {
            const { listAdminUsers } = await import('./src/services/adminService.js');
            return await listAdminUsers();
        });
        expect(resAdmin.error).toBeNull();
        expect(resAdmin.users.length).toBeGreaterThan(0);
    });

    test('12. admin_list_users: retorna somente campos permitidos e detecta needs_profile para legados', async ({ page }) => {
        await setupAuthenticatedApp(page, { isAdmin: true });

        const res = await page.evaluate(async () => {
            const { listAdminUsers } = await import('./src/services/adminService.js');
            return await listAdminUsers();
        });

        expect(res.error).toBeNull();
        const allowedKeys = ['user_id', 'display_name', 'email', 'signup_at', 'last_sign_in_at', 'access_status'];

        for (const u of res.users) {
            const userKeys = Object.keys(u);
            userKeys.forEach(k => expect(allowedKeys).toContain(k));
            // Garante ausência total de campos financeiros ou dados confidenciais
            expect(u.password).toBeUndefined();
            expect(u.encrypted_password).toBeUndefined();
            expect(u.valor).toBeUndefined();
            expect(u.transacoes).toBeUndefined();
        }

        // Verifica que usuário legado possui display_name null e status needs_profile
        const legacyUser = res.users.find(u => u.email === 'legado@exemplo.com');
        expect(legacyUser).toBeDefined();
        expect(legacyUser.display_name).toBeNull();
        expect(legacyUser.access_status).toBe('needs_profile');
    });

    test('13. admin_list_users: busca textual, filtro por status e paginação funcionam', async ({ page }) => {
        await setupAuthenticatedApp(page, { isAdmin: true });

        // Busca por nome
        const resSearch = await page.evaluate(async () => {
            const { listAdminUsers } = await import('./src/services/adminService.js');
            return await listAdminUsers({ search: 'Beatriz' });
        });
        expect(resSearch.users.length).toBe(1);
        expect(resSearch.users[0].display_name).toBe('Beatriz Lima');

        // Filtro por status
        const resFilter = await page.evaluate(async () => {
            const { listAdminUsers } = await import('./src/services/adminService.js');
            return await listAdminUsers({ status: 'suspended' });
        });
        expect(resFilter.users.length).toBe(1);
        expect(resFilter.users[0].access_status).toBe('suspended');

        // Paginação (limit e offset)
        const resPag = await page.evaluate(async () => {
            const { listAdminUsers } = await import('./src/services/adminService.js');
            return await listAdminUsers({ limit: 1, offset: 1 });
        });
        expect(resPag.users.length).toBe(1);

        // Rejeição de status de filtro inválido (não retorna lista vazia silenciosa, falha com erro 22023)
        const resInvalidStatus = await page.evaluate(async () => {
            const { listAdminUsers } = await import('./src/services/adminService.js');
            return await listAdminUsers({ status: 'admin_invalido' });
        });
        expect(resInvalidStatus.users).toEqual([]);
        expect(resInvalidStatus.error).not.toBeNull();
        expect(resInvalidStatus.error.message).toContain('Status de filtro inválido');
    });

    test('14. admin_set_user_access: transições de status válidas com auditoria', async ({ page }) => {
        await setupAuthenticatedApp(page, { isAdmin: true });

        // A) Aprovação (pending -> approved)
        const resApprove = await page.evaluate(async () => {
            const { setUserAccess } = await import('./src/services/adminService.js');
            return await setUserAccess('user-pending-uuid-0002', 'approved');
        });
        expect(resApprove.success).toBe(true);
        expect(resApprove.error).toBeNull();

        // B) Suspensão (approved -> suspended)
        const resSuspend = await page.evaluate(async () => {
            const { setUserAccess } = await import('./src/services/adminService.js');
            return await setUserAccess('user-pending-uuid-0002', 'suspended');
        });
        expect(resSuspend.success).toBe(true);

        // C) Rejeição (suspended -> rejected)
        const resReject = await page.evaluate(async () => {
            const { setUserAccess } = await import('./src/services/adminService.js');
            return await setUserAccess('user-pending-uuid-0002', 'rejected');
        });
        expect(resReject.success).toBe(true);
    });

    test('15. admin_set_user_access: bloqueia usuário comum, alvos inexistentes, legados sem perfil e proteção de admin', async ({ page }) => {
        // A) Usuário comum é negado
        await setupAuthenticatedApp(page, { isAdmin: false });
        const resComum = await page.evaluate(async () => {
            const { setUserAccess } = await import('./src/services/adminService.js');
            return await setUserAccess('user-pending-uuid-0002', 'approved');
        });
        expect(resComum.success).toBe(false);
        expect(resComum.error.message).toContain('Acesso negado');

        // B) Proteção de administrador: admin não pode ter seu status alterado via central
        await setupAuthenticatedApp(page, { isAdmin: true });
        const resProtectAdmin = await page.evaluate(async () => {
            const { setUserAccess } = await import('./src/services/adminService.js');
            return await setUserAccess('admin-uuid-protected', 'suspended');
        });
        expect(resProtectAdmin.success).toBe(false);
        expect(resProtectAdmin.error.message).toContain('status de administradores não pode ser alterado');

        // C) Alvo inexistente
        const resInexistent = await page.evaluate(async () => {
            const { setUserAccess } = await import('./src/services/adminService.js');
            return await setUserAccess('inexistent-uuid', 'approved');
        });
        expect(resInexistent.success).toBe(false);
        expect(resInexistent.error.message).toContain('Usuário não encontrado');

        // D) Alvo legado sem perfil (não informou o nome ainda)
        const resLegacy = await page.evaluate(async () => {
            const { setUserAccess } = await import('./src/services/adminService.js');
            return await setUserAccess('legacy-without-profile', 'approved');
        });
        expect(resLegacy.success).toBe(false);
        expect(resLegacy.error.message).toContain('não possui perfil cadastrado');

        // E) Status inválido (bloqueio cliente-side)
        const resInvalid = await page.evaluate(async () => {
            const { setUserAccess } = await import('./src/services/adminService.js');
            return await setUserAccess('user-pending-uuid-0002', 'superadmin');
        });
        expect(resInvalid.success).toBe(false);
        expect(resInvalid.error.message).toContain('Status inválido');
    });

    test('16. Interface: Admin vê atalho e aba da Central Administrativa; usuário comum não vê', async ({ page }) => {
        // Cenário A: Usuário comum
        await setupAuthenticatedApp(page, {
            isAdmin: false,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Usuário Comum',
                access_status: 'approved'
            }
        });

        // Botão na barra de abas deve estar oculto
        const tabAdminBtnComum = page.locator('#tabAdminBtn');
        await expect(tabAdminBtnComum).toBeHidden();

        // Card na aba conta deve estar oculto
        const adminAccountCardComum = page.locator('#adminAccountCard');
        await expect(adminAccountCardComum).toBeHidden();

        // Cenário B: Administrador
        await setupAuthenticatedApp(page, {
            isAdmin: true,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Admin Master',
                access_status: 'approved'
            }
        });

        // Botão na barra de abas visível
        const tabAdminBtn = page.locator('#tabAdminBtn');
        await expect(tabAdminBtn).toBeVisible();

        // Navega para Minha Conta e verifica card de acesso
        await page.click('button:has-text("Minha Conta")');
        const adminAccountCard = page.locator('#adminAccountCard');
        await expect(adminAccountCard).toBeVisible();
    });

    test('17. Interface: Usuário comum é impedido de acessar #/admin e é redirecionado', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            isAdmin: false,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Usuário Comum',
                access_status: 'approved'
            }
        });

        // Tenta navegar diretamente para #/admin
        await page.evaluate(() => {
            window.location.hash = '#/admin';
        });

        // Deve ser bloqueado, exibir mensagem de erro e retornar para o dashboard
        await expect(page.locator('#tab-admin')).not.toHaveClass(/active/);
        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
    });

    test('18. Interface: Admin acessa #/admin, renderiza métricas e lista de usuários', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            isAdmin: true,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Admin Master',
                access_status: 'approved'
            }
        });

        // Clica na aba Central Admin
        await page.click('#tabAdminBtn');
        await expect(page.locator('#tab-admin')).toHaveClass(/active/);

        // Verifica Cards de Resumo
        await expect(page.locator('#adminTotalUsers')).toHaveText('4');
        await expect(page.locator('#adminPendingUsers')).toHaveText('1');
        await expect(page.locator('#adminApprovedUsers')).toHaveText('1');
        await expect(page.locator('#adminSuspendedUsers')).toHaveText('1');

        // Verifica Tabela de Usuários
        const rows = page.locator('#adminUsersTableBody tr');
        await expect(rows).toHaveCount(4);

        // Usuário próprio (Admin) deve ter badge "Administrador" e não ter botões de alteração
        const adminRow = rows.filter({ hasText: 'Admin Master' });
        await expect(adminRow.locator('.badge-admin-self')).toBeVisible();

        // Beatriz Lima (Pendente) deve ter botões "Aprovar" e "Rejeitar"
        const beatrizRow = rows.filter({ hasText: 'Beatriz Lima' });
        await expect(beatrizRow.locator('.badge-status-pending')).toBeVisible();
        await expect(beatrizRow.locator('button:has-text("Aprovar")')).toBeVisible();
        await expect(beatrizRow.locator('button:has-text("Rejeitar")')).toBeVisible();

        // Usuário legado (needs_profile) não deve ter botões de aprovação e deve avisar sobre cadastro incompleto
        const legacyRow = rows.filter({ hasText: 'legado@exemplo.com' });
        await expect(legacyRow.locator('.badge-status-needs_profile')).toBeVisible();
        await expect(legacyRow).toContainText('Aguardando o usuário completar o cadastro');

        // Carlos Antigo (Suspenso) deve ter botão "Reativar"
        const carlosRow = rows.filter({ hasText: 'Carlos Antigo' });
        await expect(carlosRow.locator('.badge-status-suspended')).toBeVisible();
        await expect(carlosRow.locator('button:has-text("Reativar")')).toBeVisible();
    });

    test('19. Interface: Busca e filtro por status na Central Administrativa', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            isAdmin: true,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Admin Master',
                access_status: 'approved'
            }
        });

        await page.click('#tabAdminBtn');

        // Filtra por status: "pending"
        await page.selectOption('#adminStatusFilter', 'pending');
        await page.waitForTimeout(300);

        let rows = page.locator('#adminUsersTableBody tr');
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText('Beatriz Lima');

        // Limpa filtro e busca textual
        await page.selectOption('#adminStatusFilter', '');
        await page.fill('#adminSearchInput', 'carlos');
        await page.waitForTimeout(400); // aguarda debounce

        rows = page.locator('#adminUsersTableBody tr');
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText('carlos@exemplo.com');

        // Busca sem resultados
        await page.fill('#adminSearchInput', 'usuario_inexistente_xyz');
        await page.waitForTimeout(400);

        await expect(page.locator('#adminUsersEmpty')).toBeVisible();
        await expect(page.locator('#adminUsersTableResponsive')).toBeHidden();
    });

    test('20. Interface: Ação de aprovar usuário exige confirmação e invoca adminSetUserAccess', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            isAdmin: true,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Admin Master',
                access_status: 'approved'
            },
            autoAcceptDialogs: false
        });

        await page.click('#tabAdminBtn');

        // Intercepta confirm() para verificar a mensagem e aceitar
        let dialogHandled = false;
        page.once('dialog', async dialog => {
            expect(dialog.message()).toContain('Aprovar e liberar acesso');
            await dialog.accept();
            dialogHandled = true;
        });

        // Clica em Aprovar na linha de Beatriz Lima
        const beatrizRow = page.locator('#adminUsersTableBody tr', { hasText: 'Beatriz Lima' });
        await beatrizRow.locator('button:has-text("Aprovar")').click();

        // Verifica exibição do toast de sucesso
        const toast = page.locator('.toast-success');
        await expect(toast).toBeVisible();
        await expect(toast).toContainText('Acesso concedido com sucesso');
        expect(dialogHandled).toBe(true);
    });

    test('21. Interface: Renderiza cards de Atividade do Sistema e nota de privacidade agregada', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            isAdmin: true,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Admin Master',
                access_status: 'approved'
            }
        });

        await page.click('#tabAdminBtn');
        await expect(page.locator('#tab-admin')).toHaveClass(/active/);

        // Verifica Cards de Atividade do Sistema
        await expect(page.locator('#adminActive7d')).toHaveText('2');
        await expect(page.locator('#adminActive30d')).toHaveText('2');
        await expect(page.locator('#adminInactive30d')).toHaveText('1');

        // Verifica indicação visual estrita de privacidade
        const privacyNotice = page.locator('text=Dados de uso agregados. O administrador não possui acesso a valores ou conteúdo financeiro dos usuários.');
        await expect(privacyNotice).toBeVisible();
    });

    test('22. Interface: Tabela combina métricas de atividade, faixas e recursos por usuário com estrita privacidade', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            isAdmin: true,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Admin Master',
                access_status: 'approved'
            }
        });

        await page.click('#tabAdminBtn');

        const rows = page.locator('#adminUsersTableBody tr');
        await expect(rows).toHaveCount(4);

        // Usuário 1 (Admin Master): ACTIVE, faixa 6-20
        const adminRow = rows.filter({ hasText: 'Admin Master' });
        await expect(adminRow.locator('.badge-activity')).toHaveText('Ativo');
        await expect(adminRow).toContainText('Faixa 30d: 6-20');
        await expect(adminRow.locator('.feature-pill.active')).toHaveCount(4); // Lançamentos, Cartões, Quitações, Metas

        // Usuário 3 (Legado sem uso): NEVER, faixa 0
        const legacyRow = rows.filter({ hasText: 'legado@exemplo.com' });
        await expect(legacyRow.locator('.badge-activity')).toHaveText('Nunca utilizou');
        await expect(legacyRow).toContainText('Faixa 30d: 0');
        await expect(legacyRow.locator('.feature-pill.active')).toHaveCount(0);

        // Usuário 4 (Carlos Antigo - suspenso): INACTIVE, faixa 0
        const suspendedRow = rows.filter({ hasText: 'Carlos Antigo' });
        await expect(suspendedRow.locator('.badge-activity')).toHaveText('Inativo');
        await expect(suspendedRow.locator('.badge-status-suspended')).toHaveText('🔒 Suspenso');

        // GARANTIA DE PRIVACIDADE NA INTERFACE:
        // Nenhum valor financeiro, moeda R$, descrição de transação ou categoria sensível deve constar na tabela
        const tableContent = await page.locator('#adminUsersTable').innerText();
        expect(tableContent).not.toMatch(/R\$\s*[\d,.]+/);
        expect(tableContent).not.toContain('Salário');
        expect(tableContent).not.toContain('Alimentação');
        expect(tableContent).not.toContain('Nubank');
        expect(tableContent).not.toContain('Previsão');
    });

    test('23. Interface: Falha nas RPCs de atividade não quebra a listagem de usuários (falha graciosa)', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            isAdmin: true,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Admin Master',
                access_status: 'approved'
            }
        });

        // Intercepta e simula falha apenas nas RPCs de atividade
        await page.route('**/rest/v1/rpc/admin_get_activity_metrics', async route => {
            return route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Internal server error in metrics RPC' })
            });
        });

        await page.route('**/rest/v1/rpc/admin_get_activity_summary', async route => {
            return route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Internal server error in summary RPC' })
            });
        });

        await page.click('#tabAdminBtn');

        // A listagem de usuários ainda renderiza normalmente com os 4 usuários
        const rows = page.locator('#adminUsersTableBody tr');
        await expect(rows).toHaveCount(4);

        // Cards de atividade exibem fallback '-'
        await expect(page.locator('#adminActive7d')).toHaveText('-');
        await expect(page.locator('#adminActive30d')).toHaveText('-');
        await expect(page.locator('#adminInactive30d')).toHaveText('-');
    });

    test('24. Interface: Responsividade mobile na Central Administrativa', async ({ page }) => {
        // Redimensiona para viewport de smartphone comum (375x667)
        await page.setViewportSize({ width: 375, height: 667 });

        await setupAuthenticatedApp(page, {
            isAdmin: true,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Admin Master',
                access_status: 'approved'
            }
        });

        // No mobile, a navegação é feita pelo menu 'Mais Opções' ou rota hash
        await page.click('#bnav-mais');
        await expect(page.locator('#mobileMoreSheet')).toBeVisible();
        await page.click('#mobileMoreAdminBtn');

        await expect(page.locator('#tab-admin')).toHaveClass(/active/);

        // Verifica que os cards mobile de usuários foram renderizados
        const rows = page.locator('#adminUsersTableBody tr');
        await expect(rows).toHaveCount(4);

        // Verifica que o card mobile exibe o nome, email, badges de atividade e ações
        const firstCard = rows.first();
        await expect(firstCard.locator('.cell-user-info')).toBeVisible();
        await expect(firstCard.locator('.cell-user-activity')).toBeVisible();
        await expect(firstCard.locator('.cell-user-features')).toBeVisible();
    });
});

