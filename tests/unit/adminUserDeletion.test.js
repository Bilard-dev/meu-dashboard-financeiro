// tests/unit/adminUserDeletion.test.js
// Testes unitários para Fase 4.5-C5-E.1 — Correção de Consistência e Atomicidade da Exclusão Permanente

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Fase 4.5-C5-E.1 — Consistência da Exclusão Permanente (Schema, Edge Function, Service e UI)', () => {
    const migrationPath = path.resolve('supabase/migrations/20260912100000_fase45_admin_account_deletion.sql');
    const edgeFunctionPath = path.resolve('supabase/functions/admin-delete-user/index.ts');
    const adminServicePath = path.resolve('src/services/adminService.js');
    const indexPath = path.resolve('index.html');
    const setupAppPath = path.resolve('tests/helpers/setupApp.js');
    const resetsMigrationPath = path.resolve('supabase/migrations/20260911160000_fase45_admin_data_resets.sql');

    assert.ok(fs.existsSync(migrationPath), 'Migration 20260912100000 deve existir');
    assert.ok(fs.existsSync(edgeFunctionPath), 'Edge Function admin-delete-user/index.ts deve existir');
    assert.ok(fs.existsSync(adminServicePath), 'adminService.js deve existir');
    assert.ok(fs.existsSync(indexPath), 'index.html deve existir');
    assert.ok(fs.existsSync(setupAppPath), 'setupApp.js deve existir');
    assert.ok(fs.existsSync(resetsMigrationPath), 'Migration 20260911160000 deve existir');

    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    const edgeFunctionTs = fs.readFileSync(edgeFunctionPath, 'utf8');
    const adminServiceJs = fs.readFileSync(adminServicePath, 'utf8');
    const indexHtml = fs.readFileSync(indexPath, 'utf8');
    const setupAppJs = fs.readFileSync(setupAppPath, 'utf8');
    const resetsMigrationSql = fs.readFileSync(resetsMigrationPath, 'utf8');

    describe('1. Correção Estrutural de Integridade e Schema no Banco de Dados', () => {
        it('deve atualizar a FK app_subcategorias_categoria_id_fkey para ON DELETE CASCADE', () => {
            assert.match(migrationSql, /ALTER TABLE public\.app_subcategorias/);
            assert.match(migrationSql, /DROP CONSTRAINT IF EXISTS app_subcategorias_categoria_id_fkey;/);
            assert.match(migrationSql, /ADD CONSTRAINT app_subcategorias_categoria_id_fkey/);
            assert.match(migrationSql, /FOREIGN KEY \(categoria_id\) REFERENCES public\.app_categorias\(id\)\s+ON DELETE CASCADE;/i);
        });

        it('deve estender admin_audit_logs_action_check com USER_ACCOUNT_DELETED', () => {
            assert.match(migrationSql, /ALTER TABLE public\.admin_audit_logs/);
            assert.match(migrationSql, /DROP CONSTRAINT IF EXISTS admin_audit_logs_action_check;/);
            assert.match(migrationSql, /ADD CONSTRAINT admin_audit_logs_action_check/);
            assert.match(migrationSql, /'USER_ACCOUNT_DELETED'/);
        });

        it('confirmar que target_user_id em admin_audit_logs não possui FK CASCADE (sobrevive à exclusão do usuário)', () => {
            assert.match(resetsMigrationSql, /target_user_id\s+UUID(?!\s+REFERENCES\s+auth\.users\s+ON\s+DELETE\s+CASCADE)/i);
            assert.match(resetsMigrationSql, /-- target_user_id não utiliza ON DELETE CASCADE para não perder o log se o usuário for excluído futuramente/i);
        });

        it('confirmar que user_data_resets possui ON DELETE CASCADE (snapshots são destruídos com a conta)', () => {
            assert.match(resetsMigrationSql, /user_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+CASCADE/i);
        });
    });

    describe('2. RPC admin_prepare_user_deletion (Validação Não-Destrutiva)', () => {
        it('deve definir a RPC com SECURITY DEFINER e search_path restrito', () => {
            assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.admin_prepare_user_deletion/);
            assert.match(migrationSql, /SECURITY DEFINER/);
            assert.match(migrationSql, /SET search_path = pg_catalog, public, auth/);
        });

        it('deve exigir que o chamador seja administrador com código 42501', () => {
            assert.match(migrationSql, /IF v_admin_id IS NULL OR NOT public\.is_admin\(\) THEN/);
            assert.match(migrationSql, /ERRCODE = '42501'/);
        });

        it('deve exigir identificador de usuário obrigatório com código 23502', () => {
            assert.match(migrationSql, /IF p_target_user_id IS NULL THEN/);
            assert.match(migrationSql, /ERRCODE = '23502'/);
        });

        it('deve bloquear auto-exclusão do próprio administrador com código 42501', () => {
            assert.match(migrationSql, /IF p_target_user_id = v_admin_id THEN/);
            assert.match(migrationSql, /ERRCODE = '42501'/);
        });

        it('deve bloquear exclusão de qualquer conta administrativa com código 42501', () => {
            assert.match(migrationSql, /IF EXISTS \(SELECT 1 FROM public\.admin_users WHERE user_id = p_target_user_id\) THEN/);
            assert.match(migrationSql, /ERRCODE = '42501'/);
        });

        it('deve validar existência do usuário na base com erro P0002', () => {
            assert.match(migrationSql, /IF v_target_email IS NULL AND v_target_display_name IS NULL THEN/);
            assert.match(migrationSql, /ERRCODE = 'P0002'/);
        });

        it('A RPC de preparação NUNCA deve apagar dados (ZERO declarações DELETE)', () => {
            assert.ok(!migrationSql.includes('DELETE FROM'), 'A RPC de preparação JAMAIS deve apagar dados previamente');
        });

        it('A RPC de preparação NUNCA deve gravar USER_ACCOUNT_DELETED antes da confirmação do Auth', () => {
            assert.ok(!migrationSql.includes('INSERT INTO public.admin_audit_logs'), 'Auditoria só pode ser gravada após o Auth confirmar sucesso');
        });

        it('deve retornar a identidade mínima (target_user_id, target_email, display_name)', () => {
            assert.match(migrationSql, /'target_user_id',\s*p_target_user_id/);
            assert.match(migrationSql, /'target_email',\s*COALESCE\(v_target_email/);
            assert.match(migrationSql, /'display_name',\s*v_target_display_name/);
        });

        it('deve revogar execução de público e conceder exclusivamente a authenticated', () => {
            assert.match(migrationSql, /REVOKE ALL ON FUNCTION public\.admin_prepare_user_deletion\(UUID\) FROM PUBLIC, anon, authenticated;/);
            assert.match(migrationSql, /GRANT EXECUTE ON FUNCTION public\.admin_prepare_user_deletion\(UUID\) TO authenticated;/);
        });
    });

    describe('3. Edge Function (Operação Canônica e Auditoria Pós-Sucesso)', () => {
        it('deve responder OPTIONS com cabeçalhos CORS e rejeitar métodos não-POST com 405', () => {
            assert.match(edgeFunctionTs, /if\s*\(req\.method\s*===\s*"OPTIONS"\)/);
            assert.match(edgeFunctionTs, /if\s*\(req\.method\s*!==\s*"POST"\)/);
            assert.match(edgeFunctionTs, /status:\s*405/);
        });

        it('deve validar Bearer token (401) e verificar is_admin (403)', () => {
            assert.match(edgeFunctionTs, /req\.headers\.get\("Authorization"\)/);
            assert.match(edgeFunctionTs, /status:\s*401/);
            assert.match(edgeFunctionTs, /userClient\.rpc\("is_admin"\)/);
            assert.match(edgeFunctionTs, /status:\s*403/);
        });

        it('deve validar formato UUID do target_user_id com 400', () => {
            assert.match(edgeFunctionTs, /UUID_REGEX/);
            assert.match(edgeFunctionTs, /status:\s*400/);
        });

        it('deve bloquear auto-exclusão na Edge Function com 403', () => {
            assert.match(edgeFunctionTs, /if\s*\(targetUserId\s*===\s*callerUser\.id\)/);
            assert.match(edgeFunctionTs, /status:\s*403/);
        });

        it('deve invocar admin_prepare_user_deletion para validação e captura de identidade no banco', () => {
            assert.match(edgeFunctionTs, /userClient\.rpc\("admin_prepare_user_deletion"/);
            assert.match(edgeFunctionTs, /p_target_user_id:\s*targetUserId/);
            assert.match(edgeFunctionTs, /targetEmail\s*=\s*rpcData\?\.target_email/);
        });

        it('OPERAÇÃO CANÔNICA: deve invocar auth.admin.deleteUser como operação primária de exclusão', () => {
            assert.match(edgeFunctionTs, /adminClient\.auth\.admin\.deleteUser\(targetUserId\)/);
        });

        it('FALHA DE AUTH: se deleteUser falhar, nenhum dado foi apagado e deve retornar HTTP 500 com mensagem informativa', () => {
            assert.match(edgeFunctionTs, /if\s*\(deleteAuthError\)\s*\{/);
            assert.match(edgeFunctionTs, /Os dados do usuário foram preservados/);
            assert.match(edgeFunctionTs, /status:\s*500/);
        });

        it('AUDITORIA PÓS-SUCESSO: registro USER_ACCOUNT_DELETED ocorre estritamente APÓS sucesso do Auth', () => {
            const deleteIdx = edgeFunctionTs.indexOf('adminClient.auth.admin.deleteUser');
            const auditIdx = edgeFunctionTs.indexOf('adminClient.from("admin_audit_logs").insert');
            assert.ok(deleteIdx !== -1, 'auth.admin.deleteUser presente');
            assert.ok(auditIdx !== -1, 'insert em admin_audit_logs presente');
            assert.ok(deleteIdx < auditIdx, 'deleteUser DEVE ser chamado ANTES de gravar admin_audit_logs');
            assert.match(edgeFunctionTs, /action:\s*"USER_ACCOUNT_DELETED"/);
        });

        it('FALHA PÓS-AUTH: trata falha ao registrar auditoria honestamente (audit_warning) sem afirmar atomicidade impossível', () => {
            assert.match(edgeFunctionTs, /if\s*\(auditError\)\s*\{/);
            assert.match(edgeFunctionTs, /audit_warning/);
            assert.match(edgeFunctionTs, /A conta foi removida com sucesso, mas houve falha na gravação do registro de auditoria/);
        });

        it('deve manter a chave service_role estritamente no servidor da Edge Function', () => {
            assert.match(edgeFunctionTs, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
            assert.ok(!adminServiceJs.includes('SERVICE_ROLE'), 'adminService no frontend NÃO deve conter service_role');
            assert.ok(!indexHtml.includes('SERVICE_ROLE'), 'index.html NÃO deve conter service_role');
        });
    });

    describe('4. Frontend Service (src/services/adminService.js)', () => {
        it('deve exportar a função deleteUserAccount', () => {
            assert.match(adminServiceJs, /export async function deleteUserAccount\(targetUserId\)/);
        });

        it('deve validar formato UUID do targetUserId no client antes da chamada de rede', () => {
            assert.match(adminServiceJs, /const uuidRegex\s*=/);
            assert.match(adminServiceJs, /if\s*\(!cleanUserId\s*\|\|\s*!uuidRegex\.test\(cleanUserId\)\)/);
        });

        it('NUNCA deve enviar target_email ou admin_user_id a partir do cliente', () => {
            assert.match(adminServiceJs, /body:\s*\{\s*target_user_id:\s*cleanUserId\s*\}/);
            assert.ok(!adminServiceJs.includes('target_email:'), 'target_email nunca é enviado do frontend');
            assert.ok(!adminServiceJs.includes('admin_user_id:'), 'admin_user_id nunca é enviado do frontend');
        });

        it('deve tratar auditWarning e erros com fail-safe', () => {
            assert.match(adminServiceJs, /if\s*\(data\?\.audit_warning\)\s*\{/);
            assert.match(adminServiceJs, /auditWarning:\s*data\?\.audit_warning\s*\|\|\s*null/);
            assert.match(adminServiceJs, /return\s*\{\s*success:\s*true/);
        });
    });

    describe('5. Interface da Central Administrativa (index.html)', () => {
        it('deve conter a Seção 3 ativa e modal #adminDeleteUserModal', () => {
            assert.match(indexHtml, /id="adminDeleteUserSection"/);
            assert.match(indexHtml, /id="btnAdminOpenDeleteConfirm"/);
            assert.match(indexHtml, /id="adminDeleteUserModal"/);
            assert.match(indexHtml, /id="adminDeleteStep1"/);
            assert.match(indexHtml, /id="adminDeleteStep2"/);
        });

        it('Etapa 1 alerta sobre irreversibilidade e ausência de janela de recuperação (sem 48h)', () => {
            assert.match(indexHtml, /Esta ação é TOTALMENTE IRREVERSÍVEL/);
            assert.match(indexHtml, /Não há período de carência nem janela de recuperação \(sem 48h\)/);
            assert.match(indexHtml, /id="btnAdminDeleteGoStep2"/);
        });

        it('Etapa 2 exige digitação exata com botão desabilitado até match case-sensitive', () => {
            assert.match(indexHtml, /id="adminDeleteExpectedPhrase"/);
            assert.match(indexHtml, /id="adminDeleteConfirmationInput"/);
            assert.match(indexHtml, /disabled[^>]*id="btnAdminExecuteDelete"|id="btnAdminExecuteDelete"[^>]*disabled/);
            assert.match(indexHtml, /adminDeleteExpectedText\s*=\s*`EXCLUIR \$\{confirmTarget\}`/);
        });

        it('deve possuir proteção contra duplo clique e bloqueio de auto-exclusão no client', () => {
            assert.match(indexHtml, /let isAdminDeleteSubmitting\s*=\s*false;/);
            assert.match(indexHtml, /if\s*\(isAdminDeleteSubmitting\)\s*return;/);
            assert.match(indexHtml, /if\s*\(currentUser\s*&&\s*activeAdminActionUser\.userId\s*===\s*currentUser\.id\)/);
        });

        it('deve exportar todos os controladores de exclusão para window', () => {
            assert.match(indexHtml, /window\.adminDeleteUserAccount = deleteUserAccount;/);
            assert.match(indexHtml, /window\.openAdminDeleteUserModal = openAdminDeleteUserModal;/);
            assert.match(indexHtml, /window\.closeAdminDeleteUserModal = closeAdminDeleteUserModal;/);
            assert.match(indexHtml, /window\.goToAdminDeleteStep2 = goToAdminDeleteStep2;/);
            assert.match(indexHtml, /window\.goToAdminDeleteStep1 = goToAdminDeleteStep1;/);
            assert.match(indexHtml, /window\.handleAdminDeleteInput = handleAdminDeleteInput;/);
            assert.match(indexHtml, /window\.executeAdminDeleteUser = executeAdminDeleteUser;/);
        });
    });

    describe('6. Mocks e Ambiente de Testes (tests/helpers/setupApp.js)', () => {
        it('deve interceptar /functions/v1/admin-delete-user e /rest/v1/rpc/admin_prepare_user_deletion', () => {
            assert.match(setupAppJs, /pathname\.includes\('\/functions\/v1\/admin-delete-user'\)/);
            assert.match(setupAppJs, /pathname\.includes\('\/rest\/v1\/rpc\/admin_prepare_user_deletion'\)/);
        });

        it('admin_prepare_user_deletion mock não altera dados em memória', () => {
            const rpcStart = setupAppJs.indexOf("pathname.includes('/rest/v1/rpc/admin_prepare_user_deletion')");
            const rpcEnd = setupAppJs.indexOf("if (pathname.includes('/rest/v1/user_profiles'))", rpcStart);
            const rpcBlock = setupAppJs.substring(rpcStart, rpcEnd);
            assert.ok(!rpcBlock.includes('inMemoryTransactions ='), 'RPC mock não deve alterar transações');
            assert.ok(!rpcBlock.includes('inMemoryCategorias ='), 'RPC mock não deve alterar categorias');
        });

        it('Edge Function mock limpa os dados em memória ao confirmar exclusão', () => {
            const fnStart = setupAppJs.indexOf("pathname.includes('/functions/v1/admin-delete-user')");
            const fnEnd = setupAppJs.indexOf("pathname.includes('/rest/v1/rpc/admin_prepare_user_deletion')", fnStart);
            const fnBlock = setupAppJs.substring(fnStart, fnEnd);
            assert.ok(fnBlock.includes('inMemoryTransactions = inMemoryTransactions.filter'), 'Edge Function mock deve limpar transações em memória');
            assert.ok(fnBlock.includes('inMemoryCategorias = inMemoryCategorias.filter'), 'Edge Function mock deve limpar categorias em memória');
            assert.ok(fnBlock.includes('inMemorySubcategorias = inMemorySubcategorias.filter'), 'Edge Function mock deve limpar subcategorias em memória');
        });
    });
});
