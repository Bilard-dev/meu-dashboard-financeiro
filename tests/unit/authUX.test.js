// tests/unit/authUX.test.js
// Testes unitários para Fase 4.5-C5-J — UX Final de Autenticação e Cadastro

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Fase 4.5-C5-J — UX Final de Autenticação e Cadastro', () => {
    const indexPath = path.resolve('index.html');
    const authServicePath = path.resolve('src/services/authService.js');
    const supabaseClientPath = path.resolve('src/services/supabaseClient.js');

    assert.ok(fs.existsSync(indexPath), 'index.html deve existir');
    assert.ok(fs.existsSync(authServicePath), 'src/services/authService.js deve existir');
    assert.ok(fs.existsSync(supabaseClientPath), 'src/services/supabaseClient.js deve existir');

    const indexHtml = fs.readFileSync(indexPath, 'utf8');
    const authServiceJs = fs.readFileSync(authServicePath, 'utf8');
    const supabaseClientJs = fs.readFileSync(supabaseClientPath, 'utf8');

    // 1. TELA ENTRAR (LOGIN)
    describe('1. Modo Entrar (Login)', () => {
        it('tela de login NÃO deve conter campo de Nome no formulário de login', () => {
            // Extrai o conteúdo dentro de #loginBox até o início de #signupBox
            const loginBoxMatch = indexHtml.match(/<div class="auth-container" id="loginBox">([\s\S]*?)<!-- MODO 2: CRIAR CONTA -->/);
            assert.ok(loginBoxMatch, 'Deve existir #loginBox dedicado');
            const loginBoxHtml = loginBoxMatch[1];

            // Confirma ausência de input de nome ou label de nome dentro do loginBox
            assert.doesNotMatch(loginBoxHtml, /<label[^>]*>Nome Completo/i, 'Login NÃO deve ter label de Nome Completo');
            assert.doesNotMatch(loginBoxHtml, /id="nome"/i, 'Login NÃO deve ter input id="nome"');
            assert.doesNotMatch(loginBoxHtml, /id="groupNomeCadastro"/i, 'Login NÃO deve ter groupNomeCadastro');

            // Confirma presença de email, senha e botão Entrar
            assert.match(loginBoxHtml, /id="email"/i, 'Login deve possuir campo email');
            assert.match(loginBoxHtml, /id="senha"/i, 'Login deve possuir campo senha');
            assert.match(loginBoxHtml, /id="loginBtnText"[^>]*>Entrar<\/button>/i, 'Login deve possuir botão Entrar');
        });

        it('tela de login deve possuir link para alternar para Criar Conta sem recarregar a página', () => {
            assert.match(indexHtml, /switchAuthMode\('signup'\)/, 'Deve haver chamada a switchAuthMode("signup")');
            assert.match(indexHtml, /Não tem uma conta\?[\s\S]*?Criar conta/i);
        });

        it('tela de login deve manter link "Esqueci minha senha" funcional', () => {
            assert.match(indexHtml, /<span class="forgot-link" onclick="handleForgotPassword\(\)">Esqueci minha senha<\/span>/);
            assert.match(indexHtml, /async function handleForgotPassword\(\)/);
            assert.match(indexHtml, /authRequestPasswordReset\(email,/);
        });
    });

    // 2. TELA CRIAR CONTA (SIGNUP)
    describe('2. Modo Criar Conta (Signup)', () => {
        it('tela de cadastro deve possuir campos dedicados com nome, email, senha e confirmar senha', () => {
            const signupBoxMatch = indexHtml.match(/<div class="auth-container" id="signupBox"[\s\S]*?>([\s\S]*?)<\/form>/);
            assert.ok(signupBoxMatch, 'Deve existir #signupBox com formulário');
            const signupBoxHtml = signupBoxMatch[1];

            assert.match(signupBoxHtml, /id="signupNome"/i, 'Signup deve conter campo nome');
            assert.match(signupBoxHtml, /id="signupEmail"/i, 'Signup deve conter campo email');
            assert.match(signupBoxHtml, /id="signupSenha"/i, 'Signup deve conter campo senha');
            assert.match(signupBoxHtml, /id="signupConfirmSenha"/i, 'Signup deve conter campo de confirmação de senha');
            assert.match(signupBoxHtml, /id="signUpBtnText"[^>]*>Criar conta<\/button>/i, 'Signup deve conter botão Criar conta');
        });

        it('função handleSignUp deve validar nome (2 a 80 caracteres) e confirmação de senha', () => {
            assert.match(indexHtml, /if \(!nome \|\| nome\.length < 2\)/);
            assert.match(indexHtml, /if \(nome\.length > 80\)/);
            assert.match(indexHtml, /confirmInput && password !== confirmPassword/);
            assert.match(indexHtml, /As duas senhas digitadas não coincidem!/);
            assert.match(indexHtml, /!isStrongPassword\(password\)/);
        });

        it('handleSignUp deve registrar novo usuário como PENDING via backend e aguardar aprovação', () => {
            // Envia apenas display_name, sem conceder acesso ou status
            assert.match(indexHtml, /authSignUp\(email,\s*password,\s*\{\s*data:\s*\{\s*display_name:\s*nome\s*\}\s*\}\)/);
            assert.doesNotMatch(indexHtml, /data:\s*\{[^}]*access_status/);
            assert.doesNotMatch(indexHtml, /data:\s*\{[^}]*approved/);
            assert.match(indexHtml, /Seu acesso está aguardando aprovação/);
        });

        it('tela de cadastro deve possuir link para alternar de volta para Entrar', () => {
            assert.match(indexHtml, /switchAuthMode\('login'\)/, 'Deve haver chamada a switchAuthMode("login")');
            assert.match(indexHtml, /Já tem uma conta\?[\s\S]*?Entrar/i);
        });
    });

    // 3. ALTERNÂNCIA E COMPORTAMENTO DE MODO
    describe('3. Alternância entre Modos (switchAuthMode)', () => {
        it('switchAuthMode deve alternar visibilidade entre #loginBox e #signupBox e limpar mensagens', () => {
            assert.match(indexHtml, /function switchAuthMode\(mode\)/);
            assert.match(indexHtml, /if \(mode === 'signup'\)\s*\{[\s\S]*?loginBox\.style\.display\s*=\s*'none'[\s\S]*?signupBox\.style\.display\s*=\s*'block'/);
            assert.match(indexHtml, /signupBox\.style\.display\s*=\s*'none'[\s\S]*?loginBox\.style\.display\s*=\s*'block'/);
        });

        it('quando deslogado ou ao checar sessão, modo padrão deve ser resetado para login', () => {
            assert.match(indexHtml, /document\.getElementById\('loginView'\)\.style\.display\s*=\s*'block';[\s\S]*?switchAuthMode\('login'\);/);
        });
    });

    // 4. USUÁRIO LEGADO — COMPLETE SEU CADASTRO
    describe('4. Usuário Legado — Complete seu Cadastro', () => {
        it('tela dedicated completeProfileView deve possuir botão "Concluir cadastro"', () => {
            const completeProfileViewMatch = indexHtml.match(/<div id="completeProfileView"[\s\S]*?>([\s\S]*?)<\/div>\s*<\/div>/);
            assert.ok(completeProfileViewMatch, 'Deve existir #completeProfileView');
            const viewHtml = completeProfileViewMatch[1];

            assert.match(viewHtml, /id="completeProfileBtnText"[^>]*>Concluir cadastro<\/button>/i);
            assert.match(viewHtml, /id="legacyNomeInput"/i);
        });

        it('handleCompleteLegacyProfile deve chamar RPC complete_legacy_profile, limpar memória financeira e transitar para PENDING', () => {
            assert.match(indexHtml, /await adminCompleteLegacyProfile\(nome\);/);
            assert.match(indexHtml, /clearFinancialMemory\(\);[\s\S]*?checkSession\(\);/);
            assert.match(indexHtml, /btnEl\.innerText\s*=\s*'Concluir cadastro';/);
        });

        it('usuário com status needs_profile NUNCA deve carregar aplicação financeira', () => {
            assert.match(indexHtml, /if\s*\(accessInfo\.status\s*===\s*'needs_profile'\)\s*\{[\s\S]*?clearFinancialMemory\(\);[\s\S]*?document\.getElementById\('appView'\)\.style\.display\s*=\s*'none';/);
        });
    });

    // 5. ESTADOS DE ACESSO E SEGURANÇA
    describe('5. Governança de Acesso e Isolamento de Dados', () => {
        it('usuário PENDING não entra no dashboard e vê tela de aguardando aprovação', () => {
            assert.match(indexHtml, /if\s*\(accessInfo\.status\s*!==\s*'approved'\)\s*\{[\s\S]*?clearFinancialMemory\(\);[\s\S]*?document\.getElementById\('pendingApprovalView'\)\.style\.display\s*=\s*'block';/);
        });

        it('usuário APPROVED carrega a aplicação financeira e dashboard', () => {
            assert.match(indexHtml, /\/\/\s*CASO F:\s*Usuário comum APROVADO[\s\S]*?document\.getElementById\('appView'\)\.style\.display\s*=\s*'block';[\s\S]*?loadDashboardData\(\);/);
        });

        it('logout deve limpar memória financeira e encerrar sessão', () => {
            assert.match(indexHtml, /async function logout\(\)\s*\{[\s\S]*?clearFinancialMemory\(\);[\s\S]*?await authSignOut\(\);/);
        });

        it('nenhum token ou JWT é persistido manualmente pelo frontend (zero storage manual)', () => {
            assert.doesNotMatch(indexHtml, /localStorage\.setItem\(['"](?:token|jwt|session|access_token)/i, 'NÃO deve salvar token/JWT manualmente');
            assert.doesNotMatch(authServiceJs, /localStorage\.setItem/i, 'authService NÃO deve salvar tokens em storage próprio');
            assert.doesNotMatch(supabaseClientJs, /localStorage\.setItem/i, 'supabaseClient NÃO deve salvar tokens em storage próprio');
        });
    });
});
