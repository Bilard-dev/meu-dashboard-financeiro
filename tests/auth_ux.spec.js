// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');
const { mockUser } = require('./fixtures/mockData');

test.describe('Fase 4.5-C5-J — UX Final de Autenticação e Cadastro', () => {

    test('1. Usuário deslogado vê exclusivamente modo ENTRAR sem campo de Nome', async ({ page }) => {
        await setupAuthenticatedApp(page, { authenticated: false });

        // Container geral de autenticação visível
        await expect(page.locator('#loginView')).toBeVisible();

        // Modo Entrar visível
        await expect(page.locator('#loginBox')).toBeVisible();
        await expect(page.locator('#email')).toBeVisible();
        await expect(page.locator('#senha')).toBeVisible();
        await expect(page.locator('#loginBtnText')).toBeVisible();
        await expect(page.locator('#linkToSignUp')).toBeVisible();
        await expect(page.locator('.forgot-link')).toBeVisible();

        // Modo Criar Conta e campo Nome ocultos
        await expect(page.locator('#signupBox')).toBeHidden();
        await expect(page.locator('#signupNome')).toBeHidden();
    });

    test('2. Alternância dinâmica entre Entrar e Criar Conta sem recarregar a página', async ({ page }) => {
        await setupAuthenticatedApp(page, { authenticated: false });

        // Clica em "Criar conta"
        await page.click('#linkToSignUp');

        // Modo Criar Conta agora visível
        await expect(page.locator('#signupBox')).toBeVisible();
        await expect(page.locator('#signupNome')).toBeVisible();
        await expect(page.locator('#signupEmail')).toBeVisible();
        await expect(page.locator('#signupSenha')).toBeVisible();
        await expect(page.locator('#signupConfirmSenha')).toBeVisible();
        await expect(page.locator('#signUpBtnText')).toBeVisible();

        // Modo Entrar agora oculto
        await expect(page.locator('#loginBox')).toBeHidden();

        // Clica em "Entrar" para voltar
        await page.click('#linkToLogin');

        // Modo Entrar visível novamente e Criar Conta oculto
        await expect(page.locator('#loginBox')).toBeVisible();
        await expect(page.locator('#signupBox')).toBeHidden();
    });

    test('3. Modo Criar Conta valida confirmação de senha divergente', async ({ page }) => {
        await setupAuthenticatedApp(page, { authenticated: false });

        await page.click('#linkToSignUp');

        await page.fill('#signupNome', 'Novo Usuário Teste');
        await page.fill('#signupEmail', 'novousuario@teste.com');
        await page.fill('#signupSenha', 'SenhaForte@2026');
        await page.fill('#signupConfirmSenha', 'SenhaDiferente@2026');

        await page.click('#signUpBtnText');

        // Mensagem de erro de confirmação
        const msgEl = page.locator('#signupMessage');
        await expect(msgEl).toBeVisible();
        await expect(msgEl).toContainText('As duas senhas digitadas não coincidem!');
    });

    test('4. Usuário legado sem perfil é direcionado para Complete seu Cadastro', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            userProfile: null
        });

        // App financeiro e login ocultos
        await expect(page.locator('#appView')).toBeHidden();
        await expect(page.locator('#loginView')).toBeHidden();

        // Tela dedicada de Complete seu Cadastro visível
        await expect(page.locator('#completeProfileView')).toBeVisible();
        await expect(page.locator('#legacyNomeInput')).toBeVisible();
        await expect(page.locator('#completeProfileBtnText')).toHaveText('Concluir cadastro');
    });

    test('5. Usuário pendente vê Aguardando Aprovação e não acessa dados financeiros', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Usuário Pendente',
                access_status: 'pending'
            }
        });

        // Dashboard não é exibido
        await expect(page.locator('#appView')).toBeHidden();
        await expect(page.locator('#pendingApprovalView')).toBeVisible();
        await expect(page.locator('#approvalStatusTitle')).toHaveText('Aguardando Aprovação');
    });

    test('6. Usuário aprovado acessa dashboard financeiro normalmente', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Usuário Aprovado',
                access_status: 'approved'
            }
        });

        await expect(page.locator('#appView')).toBeVisible();
        await expect(page.locator('#loginView')).toBeHidden();
        await expect(page.locator('#kpi-receitas')).toBeVisible();
    });
});
