import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Fase 4.5-C5-C — Redefinicao de Senha, Acoes da Conta e Auditoria', () => {
    const indexPath = path.resolve('index.html');
    const adminServicePath = path.resolve('src/services/adminService.js');
    const authServicePath = path.resolve('src/services/authService.js');
    const migrationPath = path.resolve('supabase/migrations/20260911180000_fase45_admin_audit_password_reset.sql');

    assert.ok(fs.existsSync(indexPath), 'index.html deve existir');
    assert.ok(fs.existsSync(adminServicePath), 'adminService.js deve existir');
    assert.ok(fs.existsSync(authServicePath), 'authService.js deve existir');
    assert.ok(fs.existsSync(migrationPath), 'Migration local de auditoria de senha deve existir');

    const indexHtml = fs.readFileSync(indexPath, 'utf8');
    const adminServiceJs = fs.readFileSync(adminServicePath, 'utf8');
    const authServiceJs = fs.readFileSync(authServicePath, 'utf8');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    describe('1. Regras de Senha e Politicas de Privacidade', () => {
        it('o codigo nunca deve permitir que o administrador digite ou conheca nova senha de usuario', () => {
            assert.match(indexHtml, /<input type="email" id="adminModalUserEmail"[^>]*readonly/);
            assert.ok(!indexHtml.includes('adminModalUserPassword'), 'Nao deve existir input de senha para o admin digitar');
            assert.ok(!adminServiceJs.includes('password =') && !adminServiceJs.includes('p_password'), 'adminService nao deve trafegar senhas');
        });

        it('o codigo nunca deve armazenar senhas ou tokens em LocalStorage/logs', () => {
            assert.ok(!indexHtml.includes("localStorage.setItem('password'"), 'Senha nunca salva em localStorage');
            assert.ok(!indexHtml.includes("localStorage.setItem('token'"), 'Token nunca salvo em localStorage');
            assert.ok(!adminServiceJs.includes('localStorage.setItem'), 'adminService nao armazena em storage');
        });

        it('funcao isStrongPassword deve validar 8 caracteres, maiuscula, numero e especial', () => {
            assert.match(indexHtml, /isStrongPassword/);
            const securityJs = fs.readFileSync(path.resolve('src/core/security.js'), 'utf8');
            assert.match(securityJs, /8/);
            assert.match(securityJs, /A-Z/);
            assert.match(securityJs, /0-9/);
        });
    });

    describe('2. Modal de Confirmacao Acoes da Conta na Central Admin', () => {
        it('deve existir o modal #adminUserActionsModal com identificacao do usuario e e-mail readonly', () => {
            assert.match(indexHtml, /id="adminUserActionsModal"/);
            assert.match(indexHtml, /id="adminModalUserName"/);
            assert.match(indexHtml, /id="adminModalUserEmail"/);
            assert.match(indexHtml, /id="btnAdminSendPasswordReset"/);
        });

        it('deve conter estrutura funcional para Reset 48h e manter Exclusao desabilitada', () => {
            assert.match(indexHtml, /Reset de Dados Financeiros \(48h\)/);
            assert.match(indexHtml, /Exclusão Permanente da Conta/);
            assert.match(indexHtml, /id="btnAdminOpenResetConfirm"/);
            assert.match(indexHtml, /<button type="button" class="btn-danger" disabled/);
        });

        it('deve ter protecao contra cliques duplos acidentais (guard boolean isAdminResetSubmitting)', () => {
            assert.match(indexHtml, /let isAdminResetSubmitting\s*=\s*false;/);
            assert.match(indexHtml, /if\s*\(isAdminResetSubmitting\)\s*return;/);
            assert.match(indexHtml, /isAdminResetSubmitting\s*=\s*true;/);
        });

        it('nao deve disparar requisicao ao abrir o modal, apenas na confirmacao explicita', () => {
            const openFn = indexHtml.substring(indexHtml.indexOf('function openAdminUserActionsModal'), indexHtml.indexOf('function closeAdminUserActionsModal'));
            assert.ok(!openFn.includes('adminRequestUserPasswordReset'), 'Abrir modal NAO dispara redefinicao de senha');
        });

        it('deve fechar modal e limpar estado sem disparar envio quando cancelado', () => {
            const closeFn = indexHtml.substring(indexHtml.indexOf('function closeAdminUserActionsModal'), indexHtml.indexOf('async function executeAdminPasswordReset'));
            assert.ok(closeFn.includes("modal.style.display = 'none'"));
            assert.ok(closeFn.includes('activeAdminActionUser = null'));
            assert.ok(!closeFn.includes('adminRequestUserPasswordReset'));
        });
    });

    describe('3. Protecao da Conta do Proprio Administrador', () => {
        it('a linha do proprio administrador nao deve exibir botoes destrutivos ou de acoes de conta', () => {
            const idx = indexHtml.indexOf('// Ações permitidas por status');
            const rowLogic = indexHtml.substring(idx, idx + 800);
            assert.match(rowLogic, /if\s*\(isSelf\)\s*\{[\s\S]*?👑 Administrador \(Você\)/);
            assert.ok(rowLogic.includes('else'), 'Acoes da Conta so aparecem no bloco else');
        });
    });

    describe('4. Tratamento de Rate Limit no Envio de Senha', () => {
        it('adminService.requestUserPasswordReset detecta status 429 e segundos de espera', () => {
            assert.match(adminServiceJs, /export async function requestUserPasswordReset/);
            assert.match(adminServiceJs, /authError\.status\s*===\s*429/);
            assert.match(adminServiceJs, /rateLimited/);
            assert.match(adminServiceJs, /retryAfterSeconds/);
        });

        it('a interface exibe aviso claro de aguardar segundos em caso de rate limit', () => {
            assert.match(indexHtml, /if\s*\(res\.rateLimited\)/);
            assert.match(indexHtml, /res\.retryAfterSeconds/);
            assert.match(indexHtml, /Limite de solicitações atingido \(Rate Limit\)/);
        });
    });

    describe('5. Rota e Tela de Recuperacao de Senha do Usuario (#/reset-password)', () => {
        it('deve conter o container #resetPasswordView com campos de nova senha e confirmacao', () => {
            assert.match(indexHtml, /id="resetPasswordView"/);
            assert.match(indexHtml, /id="resetNovaSenha"/);
            assert.match(indexHtml, /id="resetConfirmaSenha"/);
            assert.match(indexHtml, /id="btnSubmitResetPassword"/);
        });

        it('ROUTE_MAP e hashchange devem reconhecer a rota reset-password', () => {
            assert.match(indexHtml, /'reset-password':\s*'reset-password'/);
            assert.match(indexHtml, /currentHash\.includes\('reset-password'\)\s*\|\|\s*currentHash\.includes\('type=recovery'\)/);
        });

        it('onAuthStateChange deve detectar o evento PASSWORD_RECOVERY com sessao valida e evitar listeners duplicados', () => {
            assert.match(indexHtml, /if\s*\(typeof authOnAuthStateChange === 'function' && !authSubscription\)/);
            assert.match(indexHtml, /if\s*\(event\s*===\s*'PASSWORD_RECOVERY'\s*&&\s*session\)\s*\{[\s\S]*?isPasswordRecoverySession\s*=\s*true;[\s\S]*?showResetPasswordScreen\(\);/);
        });

        it('showResetPasswordScreen deve proteger contra acesso direto sem sessao (Fase 4.5-C5-C.1)', () => {
            assert.match(indexHtml, /if\s*\(isPasswordRecoverySession\)\s*\{[\s\S]*?novaInput\.disabled\s*=\s*false/);
            assert.match(indexHtml, /Link de recuperação inválido ou expirado\. Solicite um novo link de redefinição na tela de login\./);
            assert.match(indexHtml, /novaInput\.disabled\s*=\s*true/);
            assert.match(indexHtml, /confirmaInput\.disabled\s*=\s*true/);
            assert.match(indexHtml, /btn\.disabled\s*=\s*true/);
        });

        it('handleResetPasswordSubmit deve abortar se isPasswordRecoverySession for falso', () => {
            const submitFn = indexHtml.substring(indexHtml.indexOf('async function handleResetPasswordSubmit'), indexHtml.indexOf('function cancelResetPassword'));
            assert.match(submitFn, /if\s*\(!isPasswordRecoverySession\)\s*\{[\s\S]*?showResetMsg\('Link de recuperação inválido ou expirado/);
            assert.match(submitFn, /novaSenha\s*!==\s*confirmaSenha/);
            assert.match(submitFn, /!isStrongPassword\(novaSenha\)/);
            assert.match(submitFn, /authUpdatePassword\(novaSenha\)/);
            assert.match(submitFn, /isPasswordRecoverySession\s*=\s*false;/);
            assert.match(submitFn, /novaInput\.value\s*=\s*''/);
            assert.match(submitFn, /confirmaInput\.value\s*=\s*''/);
        });

        it('redirectTo deve ser limpo e canonico sem fragments frágeis anexados antecipadamente', () => {
            assert.match(adminServiceJs, /redirectUrl\s*=\s*`\$\{window\.location\.origin\}\$\{window\.location\.pathname\}`;/);
            assert.ok(!adminServiceJs.includes('pathname}#/reset-password'), 'Não deve anexar #/reset-password no redirectTo para evitar colisões com o hash do Supabase');
        });
    });

    describe('6. Auditoria Administrativa e Governanca (Migration Local)', () => {
        it('migration deve estender CHECK constraint de acao para incluir PASSWORD_RESET_REQUESTED', () => {
            assert.match(migrationSql, /CHECK\s*\(action IN\s*\('USER_DATA_RESET',\s*'USER_DATA_RESTORED',\s*'USER_DATA_PURGED',\s*'PASSWORD_RESET_REQUESTED'\)\)/);
        });

        it('RPC admin_log_password_reset_request deve ser SECURITY DEFINER com search_path seguro', () => {
            assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.admin_log_password_reset_request/);
            assert.match(migrationSql, /SECURITY DEFINER/);
            assert.match(migrationSql, /SET search_path = pg_catalog, public, auth/);
        });

        it('RPC deve receber apenas p_target_user_id e consultar e-mail real em auth.users (Fase 4.5-C5-C.1)', () => {
            assert.match(migrationSql, /FUNCTION public\.admin_log_password_reset_request\(\s*p_target_user_id UUID\s*\)/);
            assert.ok(!migrationSql.includes('p_target_email TEXT'), 'RPC não deve aceitar e-mail fornecido pelo frontend');
            assert.match(migrationSql, /SELECT email INTO v_target_email\s+FROM auth\.users\s+WHERE id = p_target_user_id;/);
            assert.match(migrationSql, /IF v_target_email IS NULL THEN/);
        });

        it('RPC deve impedir auto-registro e alvo administrativo', () => {
            assert.match(migrationSql, /IF\s+p_target_user_id\s*=\s*v_admin_id\s+THEN/);
            assert.match(migrationSql, /IF\s+EXISTS\s*\(SELECT\s+1\s+FROM\s+public\.admin_users\s+WHERE\s+user_id\s*=\s*p_target_user_id\)\s+THEN/);
        });

        it('adminService deve invocar a auditoria com p_target_user_id antes do envio de email', () => {
            const fnBody = adminServiceJs.substring(adminServiceJs.indexOf('export async function requestUserPasswordReset'));
            const resetCallIdx = fnBody.indexOf('admin_log_password_reset_request');
            const emailSendIdx = fnBody.indexOf('supabaseClient.auth.resetPasswordForEmail');
            assert.ok(resetCallIdx !== -1, 'adminService deve chamar admin_log_password_reset_request');
            assert.ok(emailSendIdx !== -1, 'adminService deve chamar resetPasswordForEmail');
            assert.ok(resetCallIdx < emailSendIdx, 'Auditoria deve ser validada no banco ANTES do disparo do e-mail');
            assert.match(fnBody, /p_target_user_id:\s*cleanUserId/);
            assert.ok(!fnBody.includes('p_target_email:'), 'adminService não deve enviar p_target_email para a RPC');
        });
    });
});