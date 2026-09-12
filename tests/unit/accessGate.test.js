// tests/unit/accessGate.test.js
// Testes unitários para Fase 4.5-C5-F — Gate Definitivo de Acesso RLS + Legacy Profile Flow

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Fase 4.5-C5-F — Gate Definitivo de Acesso RLS e Legacy Profile Flow', () => {
    const migrationPath = path.resolve('supabase/migrations/20260912120000_fase45_access_gate.sql');
    const indexPath = path.resolve('index.html');
    const adminServicePath = path.resolve('src/services/adminService.js');
    const setupAppPath = path.resolve('tests/helpers/setupApp.js');

    assert.ok(fs.existsSync(migrationPath), 'Migration 20260912120000_fase45_access_gate.sql deve existir localmente');
    assert.ok(fs.existsSync(indexPath), 'index.html deve existir');
    assert.ok(fs.existsSync(adminServicePath), 'src/services/adminService.js deve existir');
    assert.ok(fs.existsSync(setupAppPath), 'tests/helpers/setupApp.js deve existir');

    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    const indexHtml = fs.readFileSync(indexPath, 'utf8');
    const adminServiceJs = fs.readFileSync(adminServicePath, 'utf8');
    const setupAppJs = fs.readFileSync(setupAppPath, 'utf8');

    // ============================================================================
    // 1. ANÁLISE ESTRUTURAL DA MIGRATION RLS (LOCAL)
    // ============================================================================
    describe('1. Estrutura e Governança da Migration Local', () => {
        it('deve conter aviso explícito de NÃO aplicar remotamente ainda', () => {
            assert.match(migrationSql, /NÃO APLICAR REMOTAMENTE AINDA/);
        });

        it('deve encapsular todas as operações em bloco BEGIN ... COMMIT', () => {
            assert.match(migrationSql, /^BEGIN;/m);
            assert.match(migrationSql, /COMMIT;\s*$/m);
        });

        it('deve endurecer public.has_app_access com search_path = pg_catalog, public, auth (Fase 4.5-C5-F.1)', () => {
            assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.has_app_access\(\)/);
            assert.match(migrationSql, /SECURITY DEFINER/);
            assert.match(migrationSql, /STABLE/);
            assert.match(migrationSql, /SET search_path = pg_catalog, public, auth/);
            assert.match(migrationSql, /REVOKE ALL ON FUNCTION public\.has_app_access\(\) FROM PUBLIC, anon;/);
            assert.match(migrationSql, /GRANT EXECUTE ON FUNCTION public\.has_app_access\(\) TO authenticated;/);
        });

        it('deve atualizar todas as 7 tabelas financeiras/aplicacionais', () => {
            const requiredTables = [
                'public.transacoes',
                'public.liquidacoes_credito',
                'public.app_categorias',
                'public.app_subcategorias',
                'public.app_cartoes',
                'public.app_tags',
                'public.metas'
            ];
            for (const tbl of requiredTables) {
                assert.ok(migrationSql.includes(tbl), `Migration deve referenciar a tabela ${tbl}`);
            }
        });

        it('deve utilizar public.has_app_access() em conjunto com user_id = auth.uid() em todas as tabelas', () => {
            // Verifica que não existe bypass do tipo 'is_admin() OR' nas policies financeiras
            assert.doesNotMatch(migrationSql, /CREATE POLICY.*USING\s*\(\s*public\.is_admin\(\)\s*OR/i, 
                'Políticas financeiras NÃO devem conceder bypass direto com is_admin() OR');

            // Verifica presença de has_app_access em transações
            assert.match(migrationSql, /CREATE POLICY "transacoes_select_policy" ON public\.transacoes\s+FOR SELECT TO authenticated\s+USING \(user_id = auth\.uid\(\) AND public\.has_app_access\(\)\);/);
            assert.match(migrationSql, /CREATE POLICY "transacoes_insert_policy" ON public\.transacoes\s+FOR INSERT TO authenticated\s+WITH CHECK \(user_id = auth\.uid\(\) AND public\.has_app_access\(\)\);/);
            assert.match(migrationSql, /CREATE POLICY "transacoes_update_policy" ON public\.transacoes\s+FOR UPDATE TO authenticated\s+USING \(user_id = auth\.uid\(\) AND public\.has_app_access\(\)\)\s+WITH CHECK \(user_id = auth\.uid\(\) AND public\.has_app_access\(\)\);/);
            assert.match(migrationSql, /CREATE POLICY "transacoes_delete_policy" ON public\.transacoes\s+FOR DELETE TO authenticated\s+USING \(user_id = auth\.uid\(\) AND public\.has_app_access\(\)\);/);

            // Verifica presença de has_app_access em metas
            assert.match(migrationSql, /CREATE POLICY "metas_select_policy" ON public\.metas\s+FOR SELECT TO authenticated\s+USING \(user_id = auth\.uid\(\) AND public\.has_app_access\(\)\);/);

            // Verifica presença de has_app_access em categorias, subcategorias, cartoes e tags
            assert.match(migrationSql, /CREATE POLICY "Users can view their own categories" ON public\.app_categorias\s+FOR SELECT TO authenticated\s+USING \(user_id = auth\.uid\(\) AND public\.has_app_access\(\)\);/);
            assert.match(migrationSql, /CREATE POLICY "Users can view their own subcategories" ON public\.app_subcategorias\s+FOR SELECT TO authenticated\s+USING \(user_id = auth\.uid\(\) AND public\.has_app_access\(\)\);/);
            assert.match(migrationSql, /CREATE POLICY "Users can view their own cards" ON public\.app_cartoes\s+FOR SELECT TO authenticated\s+USING \(user_id = auth\.uid\(\) AND public\.has_app_access\(\)\);/);
            assert.match(migrationSql, /CREATE POLICY "Users can view their own tags" ON public\.app_tags\s+FOR SELECT TO authenticated\s+USING \(user_id = auth\.uid\(\) AND public\.has_app_access\(\)\);/);
        });

        it('deve preservar as validações relacionais estritas em liquidacoes_credito', () => {
            assert.match(migrationSql, /CREATE POLICY "liquidacoes_credito_select_policy" ON public\.liquidacoes_credito\s+FOR SELECT TO authenticated\s+USING \(user_id = auth\.uid\(\) AND public\.has_app_access\(\)\);/);
            assert.match(migrationSql, /CREATE POLICY "liquidacoes_credito_insert_policy"/);
            assert.match(migrationSql, /liquidacoes_credito\.grupo_parcela_id IS NULL/);
            assert.match(migrationSql, /t\.grupo_parcela_id = liquidacoes_credito\.grupo_parcela_id/);
        });
    });

    // ============================================================================
    // 2. MOTOR DE SIMULAÇÃO DE SEGURANÇA CROSS-USER & MATRIZ DE ACESSO RLS
    // ============================================================================
    describe('2. Matriz de Autorização RLS (Simulação Canônica das Regras do Banco)', () => {
        /**
         * Simula a avaliação do PostgreSQL para has_app_access() e RLS tenant.
         */
        function evaluateRLS({ callerUid, callerIsAdmin, callerStatus, rowUserId }) {
            // public.has_app_access()
            const has_app_access = Boolean(
                callerUid && (callerIsAdmin || callerStatus === 'approved')
            );

            // Policy: user_id = auth.uid() AND public.has_app_access()
            const allowed = Boolean(has_app_access && callerUid === rowUserId);

            return { has_app_access, allowed };
        }

        const USER_A_ID = '11111111-1111-1111-1111-111111111111';
        const USER_B_ID = '22222222-2222-2222-2222-222222222222';
        const ADMIN_ID  = '99999999-9999-9999-9999-999999999999';

        it('APPROVED USER A: tem acesso aos próprios dados e zero acesso aos dados do USER B', () => {
            // Própria linha
            const own = evaluateRLS({
                callerUid: USER_A_ID,
                callerIsAdmin: false,
                callerStatus: 'approved',
                rowUserId: USER_A_ID
            });
            assert.strictEqual(own.has_app_access, true);
            assert.strictEqual(own.allowed, true);

            // Linha do User B
            const foreign = evaluateRLS({
                callerUid: USER_A_ID,
                callerIsAdmin: false,
                callerStatus: 'approved',
                rowUserId: USER_B_ID
            });
            assert.strictEqual(foreign.has_app_access, true);
            assert.strictEqual(foreign.allowed, false, 'User A não pode acessar linhas do User B');
        });

        it('PENDING USER: tem acesso totalmente bloqueado às próprias linhas e a de terceiros', () => {
            const own = evaluateRLS({
                callerUid: USER_A_ID,
                callerIsAdmin: false,
                callerStatus: 'pending',
                rowUserId: USER_A_ID
            });
            assert.strictEqual(own.has_app_access, false);
            assert.strictEqual(own.allowed, false, 'Usuário pendente não deve acessar nada');

            const foreign = evaluateRLS({
                callerUid: USER_A_ID,
                callerIsAdmin: false,
                callerStatus: 'pending',
                rowUserId: USER_B_ID
            });
            assert.strictEqual(foreign.allowed, false);
        });

        it('REJECTED USER: tem acesso totalmente bloqueado', () => {
            const res = evaluateRLS({
                callerUid: USER_A_ID,
                callerIsAdmin: false,
                callerStatus: 'rejected',
                rowUserId: USER_A_ID
            });
            assert.strictEqual(res.has_app_access, false);
            assert.strictEqual(res.allowed, false);
        });

        it('SUSPENDED USER: tem acesso totalmente bloqueado', () => {
            const res = evaluateRLS({
                callerUid: USER_A_ID,
                callerIsAdmin: false,
                callerStatus: 'suspended',
                rowUserId: USER_A_ID
            });
            assert.strictEqual(res.has_app_access, false);
            assert.strictEqual(res.allowed, false);
        });

        it('LEGACY USER SEM PERFIL: has_app_access é false e acesso financeiro é negado', () => {
            const res = evaluateRLS({
                callerUid: USER_A_ID,
                callerIsAdmin: false,
                callerStatus: null, // sem registro em user_profiles
                rowUserId: USER_A_ID
            });
            assert.strictEqual(res.has_app_access, false);
            assert.strictEqual(res.allowed, false);
        });

        it('ADMIN USER: possui has_app_access = true, mas NÃO ganha bypass para ler dados do USER B', () => {
            // Própria linha do admin
            const adminOwn = evaluateRLS({
                callerUid: ADMIN_ID,
                callerIsAdmin: true,
                callerStatus: 'approved',
                rowUserId: ADMIN_ID
            });
            assert.strictEqual(adminOwn.has_app_access, true);
            assert.strictEqual(adminOwn.allowed, true);

            // Admin tentando ler linhas do User B
            const adminCrossUser = evaluateRLS({
                callerUid: ADMIN_ID,
                callerIsAdmin: true,
                callerStatus: 'approved',
                rowUserId: USER_B_ID
            });
            assert.strictEqual(adminCrossUser.has_app_access, true);
            assert.strictEqual(adminCrossUser.allowed, false, 'Admin NÃO possui bypass para ler dados financeiros de outros usuários');
        });

        it('ADMIN com perfil ausente ou pending NÃO é bloqueado do aplicativo (has_app_access permanece true)', () => {
            const adminNoProfile = evaluateRLS({
                callerUid: ADMIN_ID,
                callerIsAdmin: true,
                callerStatus: null, // perfil ausente
                rowUserId: ADMIN_ID
            });
            assert.strictEqual(adminNoProfile.has_app_access, true);
            assert.strictEqual(adminNoProfile.allowed, true);

            const adminPending = evaluateRLS({
                callerUid: ADMIN_ID,
                callerIsAdmin: true,
                callerStatus: 'pending', // perfil pendente
                rowUserId: ADMIN_ID
            });
            assert.strictEqual(adminPending.has_app_access, true);
            assert.strictEqual(adminPending.allowed, true);
        });
    });

    // ============================================================================
    // 3. FRONTEND: TRATAMENTO DOS 5 ESTADOS E FALHA SEGURA
    // ============================================================================
    describe('3. Frontend UX, Fail-Safe Defaults e Limpeza de Memória', () => {
        it('checkSession deve iniciar com defaults seguros (fail-safe) com status pending e hasAccess false', () => {
            assert.match(indexHtml, /let\s+accessInfo\s*=\s*\{\s*status:\s*'pending',\s*hasAccess:\s*false,\s*isAdmin:\s*false\s*\};/);
        });

        it('checkSession deve capturar erros e manter falha fechada (pending, sem acesso)', () => {
            assert.match(indexHtml, /catch\s*\(\w+\)\s*\{[\s\S]*?accessInfo\s*=\s*\{\s*status:\s*'pending',\s*hasAccess:\s*false,\s*isAdmin:\s*false\s*\};/);
        });

        it('checkSession deve tratar expressamente o caso do Administrador (CASO A)', () => {
            assert.match(indexHtml, /\/\/\s*CASO A:\s*Administrador/i);
            assert.match(indexHtml, /if\s*\(isAdmin\)\s*\{[\s\S]*?document\.getElementById\('appView'\)\.style\.display\s*=\s*'block';/);
        });

        it('checkSession deve direcionar usuário legado sem perfil para completeProfileView (CASO B)', () => {
            assert.match(indexHtml, /\/\/\s*CASO B:\s*Usuário legado sem perfil/i);
            assert.match(indexHtml, /if\s*\(accessInfo\.status\s*===\s*'needs_profile'\)\s*\{[\s\S]*?clearFinancialMemory\(\);[\s\S]*?document\.getElementById\('completeProfileView'\)\.style\.display\s*=\s*'block';/);
        });

        it('checkSession deve direcionar pending, rejected e suspended para pendingApprovalView (CASO C, D, E)', () => {
            assert.match(indexHtml, /\/\/\s*CASO C,\s*D,\s*E e Bloqueios/i);
            assert.match(indexHtml, /if\s*\(accessInfo\.status\s*!==\s*'approved'\)\s*\{[\s\S]*?clearFinancialMemory\(\);[\s\S]*?document\.getElementById\('pendingApprovalView'\)\.style\.display\s*=\s*'block';/);
            assert.match(indexHtml, /if\s*\(accessInfo\.status\s*===\s*'pending'\)\s*\{[\s\S]*?iconEl\.innerText\s*=\s*'⏳';/);
            assert.match(indexHtml, /else if\s*\(accessInfo\.status\s*===\s*'rejected'\)\s*\{[\s\S]*?iconEl\.innerText\s*=\s*'🚫';/);
            assert.match(indexHtml, /else if\s*\(accessInfo\.status\s*===\s*'suspended'\)\s*\{[\s\S]*?iconEl\.innerText\s*=\s*'🔒';/);
        });

        it('checkSession deve somente carregar dados financeiros para usuário comum se for APPROVED (CASO F)', () => {
            assert.match(indexHtml, /\/\/\s*CASO F:\s*Usuário comum APROVADO/i);
            assert.match(indexHtml, /document\.getElementById\('appView'\)\.style\.display\s*=\s*'block';[\s\S]*?loadDashboardData\(\);/);
        });

        it('clearFinancialMemory deve zerar todos os arrays financeiros em memória', () => {
            assert.match(indexHtml, /function clearFinancialMemory\(\)\s*\{/);
            assert.match(indexHtml, /rawSupabaseData\s*=\s*\[\];/);
            assert.match(indexHtml, /allTransacoes\s*=\s*\[\];/);
            assert.match(indexHtml, /globalCreditSettlements\s*=\s*\[\];/);
            assert.match(indexHtml, /allMetas\s*=\s*\[\];/);
            assert.match(indexHtml, /allCategorias\s*=\s*\[\];/);
            assert.match(indexHtml, /allSubcategorias\s*=\s*\[\];/);
            assert.match(indexHtml, /allCartoes\s*=\s*\[\];/);
            assert.match(indexHtml, /allTags\s*=\s*\[\];/);
        });

        it('logout deve chamar clearFinancialMemory e zerar estados de sessão', () => {
            assert.match(indexHtml, /async function logout\(\)\s*\{[\s\S]*?clearFinancialMemory\(\);[\s\S]*?await authSignOut\(\);[\s\S]*?currentUser\s*=\s*null;[\s\S]*?currentUserIsAdmin\s*=\s*false;/);
        });
    });

    // ============================================================================
    // 4. VALIDAÇÃO DE INPUTS NO LEGACY PROFILE FLOW E NOVO SIGNUP
    // ============================================================================
    describe('4. Validação de Display Name (2 a 80 caracteres) e Signup', () => {
        it('handleCompleteLegacyProfile deve validar tamanho mínimo (>= 2) e máximo (<= 80)', () => {
            assert.match(indexHtml, /const nome = \(inputEl\?\.value \|\| ''\)\.trim\(\);/);
            assert.match(indexHtml, /if \(!nome \|\| nome\.length < 2\)/);
            assert.match(indexHtml, /if \(nome\.length > 80\)/);
            assert.match(indexHtml, /await adminCompleteLegacyProfile\(nome\);/);
        });

        it('completeLegacyProfile no adminService deve validar 2 a 80 caracteres', () => {
            assert.match(adminServiceJs, /const cleanName = String\(displayName \|\| ''\)\.trim\(\);/);
            assert.match(adminServiceJs, /if \(cleanName\.length < 2\)/);
            assert.match(adminServiceJs, /if \(cleanName\.length > 80\)/);
            assert.match(adminServiceJs, /await supabaseClient\.rpc\(\s*'complete_legacy_profile',\s*\{\s*p_display_name:\s*cleanName\s*\}\s*\);/);
        });

        it('handleSignUp deve enviar display_name em raw_user_meta_data sem auto-aprovar ou inventar status', () => {
            assert.match(indexHtml, /if \(!nome \|\| nome\.length < 2\)/);
            assert.match(indexHtml, /if \(nome\.length > 80\)/);
            assert.match(indexHtml, /const \{ data, error \} = await authSignUp\(email, password, \{\s*data:\s*\{\s*display_name:\s*nome\s*\}\s*\}\);/);
            // Confirma que não injeta access_status nem role no signup
            assert.doesNotMatch(indexHtml, /data:\s*\{[^}]*access_status/);
            assert.doesNotMatch(indexHtml, /data:\s*\{[^}]*role/);
        });

        it('mock de complete_legacy_profile em setupApp.js deve atualizar userProfile em memória para pending', () => {
            assert.match(setupAppJs, /userProfile = \{\s*user_id: mockUser\.id,\s*display_name: clean,\s*access_status: 'pending',/);
        });
    });
});
