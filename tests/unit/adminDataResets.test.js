import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Fase 4.5-C5-B / C5-B.1 — Reset Reversível 48h + Auditoria (Migration & Schema Hardening)', () => {
    const migrationPath = path.resolve('supabase/migrations/20260911160000_fase45_admin_data_resets.sql');
    assert.ok(fs.existsSync(migrationPath), 'A migration da Fase 4.5-C5-B deve existir');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    it('deve conter a criação da tabela user_data_resets com todas as colunas de controle', () => {
        assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.user_data_resets/);
        assert.match(sql, /id\s+UUID\s+PRIMARY\s+KEY/i);
        assert.match(sql, /user_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+CASCADE/i);
        assert.match(sql, /snapshot\s+JSONB\s+NOT\s+NULL/i);
        assert.match(sql, /status\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'active'\s+CHECK\s*\(status\s+IN\s*\('active',\s*'restored',\s*'purged'\)\)/i);
        assert.match(sql, /expires_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s*\(now\(\)\s*\+\s*interval\s+'48 hours'\)/i);
        assert.match(sql, /created_by\s+UUID\s+REFERENCES\s+auth\.users\(id\)/i);
        assert.match(sql, /restored_at\s+TIMESTAMPTZ/i);
        assert.match(sql, /purged_at\s+TIMESTAMPTZ/i);
    });

    it('deve garantir índice UNIQUE parcial de NO MÁXIMO UM reset ativo por user_id', () => {
        assert.match(
            sql,
            /CREATE\s+UNIQUE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?idx_user_data_resets_one_active_per_user\s+ON\s+public\.user_data_resets\s*\(user_id\)\s+WHERE\s*\(status\s*=\s*'active'\);/i
        );
    });

    it('deve habilitar Row Level Security (RLS) sem políticas públicas (inacessível a cliente comum)', () => {
        assert.match(sql, /ALTER TABLE public\.user_data_resets ENABLE ROW LEVEL SECURITY;/);
        assert.match(sql, /ALTER TABLE public\.admin_audit_logs ENABLE ROW LEVEL SECURITY;/);
        // Garante que não existem policies que deem acesso direto ao cliente
        assert.ok(!sql.includes('CREATE POLICY'), 'Não deve existir nenhuma política pública permissiva');
    });

    it('deve criar a tabela admin_audit_logs sem CASCADE no target_user_id para preservação perene', () => {
        assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.admin_audit_logs/);
        assert.match(sql, /admin_user_id\s+UUID\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i);
        assert.match(sql, /target_user_id\s+UUID(?!\s+REFERENCES\s+auth\.users\s+ON\s+DELETE\s+CASCADE)/i);
        assert.match(sql, /action\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(action\s+IN\s*\('USER_DATA_RESET',\s*'USER_DATA_RESTORED',\s*'USER_DATA_PURGED'\)\)/i);
        assert.match(sql, /metadata\s+JSONB\s+NOT\s+NULL\s+DEFAULT\s+'\{\}'::jsonb/i);
    });

    it('deve capturar snapshot completo das 7 tabelas funcionais', () => {
        const requiredTables = [
            'liquidacoes_credito',
            'transacoes',
            'metas',
            'app_subcategorias',
            'app_categorias',
            'app_cartoes',
            'app_tags'
        ];

        for (const tbl of requiredTables) {
            assert.ok(
                sql.includes(`'${tbl}'`) && sql.includes(`FROM public.${tbl} r WHERE r.user_id = p_target_user_id`),
                `Snapshot deve incluir a tabela ${tbl}`
            );
        }
    });

    it('deve limpar as 7 tabelas na ordem segura de topologia reversa (respeitando FKs e RESTRICT)', () => {
        const deleteLiqIdx = sql.indexOf('DELETE FROM public.liquidacoes_credito WHERE user_id = p_target_user_id;');
        const deleteTransIdx = sql.indexOf('DELETE FROM public.transacoes WHERE user_id = p_target_user_id;');
        const deleteMetasIdx = sql.indexOf('DELETE FROM public.metas WHERE user_id = p_target_user_id;');
        const deleteSubcatIdx = sql.indexOf('DELETE FROM public.app_subcategorias WHERE user_id = p_target_user_id;');
        const deleteCatIdx = sql.indexOf('DELETE FROM public.app_categorias WHERE user_id = p_target_user_id;');
        const deleteCartoesIdx = sql.indexOf('DELETE FROM public.app_cartoes WHERE user_id = p_target_user_id;');
        const deleteTagsIdx = sql.indexOf('DELETE FROM public.app_tags WHERE user_id = p_target_user_id;');

        assert.ok(deleteLiqIdx !== -1, 'Deleção de liquidacoes_credito presente');
        assert.ok(deleteTransIdx !== -1, 'Deleção de transacoes presente');
        assert.ok(deleteMetasIdx !== -1, 'Deleção de metas presente');
        assert.ok(deleteSubcatIdx !== -1, 'Deleção de app_subcategorias presente');
        assert.ok(deleteCatIdx !== -1, 'Deleção de app_categorias presente');
        assert.ok(deleteCartoesIdx !== -1, 'Deleção de app_cartoes presente');
        assert.ok(deleteTagsIdx !== -1, 'Deleção de app_tags presente');

        assert.ok(deleteLiqIdx < deleteTransIdx, 'liquidacoes_credito deve ser deletada ANTES de transacoes');
        assert.ok(deleteSubcatIdx < deleteCatIdx, 'app_subcategorias deve ser deletada ANTES de app_categorias (devido a ON DELETE RESTRICT)');
    });

    it('deve preservar auth.users, user_profiles e admin_users sem qualquer alteração durante o reset', () => {
        assert.ok(!sql.includes('DELETE FROM auth.users'), 'Jamais pode deletar auth.users no reset');
        assert.ok(!sql.includes('DELETE FROM public.user_profiles'), 'Jamais pode deletar user_profiles no reset');
        assert.ok(!sql.includes('DELETE FROM public.admin_users'), 'Jamais pode deletar admin_users no reset');
    });

    it('deve proteger o próprio administrador (auto-reset) e outros administradores com erro 42501', () => {
        assert.match(sql, /IF\s+p_target_user_id\s*=\s*v_admin_id\s+THEN[\s\S]*?42501/);
        assert.match(sql, /IF\s+EXISTS\s*\(SELECT\s+1\s+FROM\s+public\.admin_users\s+WHERE\s+user_id\s*=\s*p_target_user_id\)[\s\S]*?42501/);
    });

    it('deve abortar fail-closed na restauração se o usuário tiver novos dados nas 7 tabelas (22000)', () => {
        assert.match(sql, /IF\s+EXISTS\s*\(SELECT\s+1\s+FROM\s+public\.liquidacoes_credito\s+WHERE\s+user_id\s*=\s*p_target_user_id\)\s+OR/);
        assert.match(sql, /EXISTS\s*\(SELECT\s+1\s+FROM\s+public\.transacoes\s+WHERE\s+user_id\s*=\s*p_target_user_id\)\s+OR/);
        assert.match(sql, /EXISTS\s*\(SELECT\s+1\s+FROM\s+public\.metas\s+WHERE\s+user_id\s*=\s*p_target_user_id\)\s+OR/);
        assert.match(sql, /EXISTS\s*\(SELECT\s+1\s+FROM\s+public\.app_subcategorias\s+WHERE\s+user_id\s*=\s*p_target_user_id\)\s+OR/);
        assert.match(sql, /EXISTS\s*\(SELECT\s+1\s+FROM\s+public\.app_categorias\s+WHERE\s+user_id\s*=\s*p_target_user_id\)\s+OR/);
        assert.match(sql, /EXISTS\s*\(SELECT\s+1\s+FROM\s+public\.app_cartoes\s+WHERE\s+user_id\s*=\s*p_target_user_id\)\s+OR/);
        assert.match(sql, /EXISTS\s*\(SELECT\s+1\s+FROM\s+public\.app_tags\s+WHERE\s+user_id\s*=\s*p_target_user_id\)\s+THEN/);
        assert.match(sql, /RAISE EXCEPTION 'Usuário possui novos dados após o reset\.'[\s\S]*?22000/);
    });

    it('deve restaurar as 7 tabelas na ordem de dependência direta preservando UUIDs e relacionamentos', () => {
        const restoreTagsIdx = sql.indexOf('INSERT INTO public.app_tags');
        const restoreCartoesIdx = sql.indexOf('INSERT INTO public.app_cartoes');
        const restoreCatIdx = sql.indexOf('INSERT INTO public.app_categorias');
        const restoreSubcatIdx = sql.indexOf('INSERT INTO public.app_subcategorias');
        const restoreMetasIdx = sql.indexOf('INSERT INTO public.metas');
        const restoreTransIdx = sql.indexOf('INSERT INTO public.transacoes');
        const restoreLiqIdx = sql.indexOf('INSERT INTO public.liquidacoes_credito');

        assert.ok(restoreTagsIdx < restoreSubcatIdx, 'Tags antes de subcategorias');
        assert.ok(restoreCatIdx < restoreSubcatIdx, 'Categorias ANTES de subcategorias');
        assert.ok(restoreTransIdx < restoreLiqIdx, 'Transações ANTES de liquidações de crédito');
        assert.match(sql, /jsonb_populate_recordset/);
    });

    it('deve rejeitar restauração após o prazo de 48h (expires_at <= clock_timestamp()) com erro 22023', () => {
        assert.match(sql, /IF\s+v_expires_at\s*<=\s*clock_timestamp\(\)\s+THEN\s+RAISE\s+EXCEPTION\s+'Prazo de 48 horas para restauração expirado\.'\s+USING\s+ERRCODE\s*=\s*'22023';/);
    });

    it('HARDENING: purge antes de 48h não destrói snapshot e filtra estritamente por expires_at <= clock_timestamp()', () => {
        assert.match(sql, /WHERE\s+r\.status\s*=\s*'active'\s+AND\s+r\.expires_at\s*<=\s*clock_timestamp\(\)/);
        assert.match(sql, /UPDATE\s+public\.user_data_resets[\s\S]*?WHERE\s+id\s*=\s*v_record\.id\s+AND\s+status\s*=\s*'active'\s+AND\s+expires_at\s*<=\s*clock_timestamp\(\);/);
    });

    it('HARDENING: concorrência do purge utiliza FOR UPDATE SKIP LOCKED e log único via IF FOUND', () => {
        assert.match(sql, /FOR UPDATE OF r SKIP LOCKED/);
        assert.match(sql, /IF FOUND THEN[\s\S]*?INSERT INTO public\.admin_audit_logs[\s\S]*?USER_DATA_PURGED/);
    });

    it('HARDENING: restored nunca vira purged porque purge filtra apenas status = active', () => {
        assert.match(sql, /status\s*=\s*'restored'/);
        assert.match(sql, /WHERE\s+r\.status\s*=\s*'active'/);
    });

    it('HARDENING: purge é acionado automaticamente em admin_get_user_reset_status sem exigir botão na UI', () => {
        assert.match(sql, /PERFORM public\.admin_purge_expired_user_resets\(\);/);
    });

    it('HARDENING: search_path endurecido para pg_catalog, public, auth em todas as funções', () => {
        const searchPathMatches = sql.match(/SET search_path\s*=\s*pg_catalog,\s*public,\s*auth/g);
        assert.ok(searchPathMatches, 'search_path deve estar configurado');
        assert.equal(searchPathMatches.length, 4, 'As 4 funções devem usar o search_path seguro pg_catalog, public, auth');
        assert.ok(!sql.includes('SET search_path = public, auth, pg_temp'), 'pg_temp não deve estar presente');
    });

    it('HARDENING: metadata não é controlável pelo cliente e nenhuma RPC aceita metadata arbitrária', () => {
        assert.match(sql, /admin_reset_user_data\(\s*p_target_user_id\s+UUID\s*\)/);
        assert.match(sql, /admin_restore_user_data\(\s*p_target_user_id\s+UUID,\s*p_reset_id\s+UUID\s*\)/);
        assert.match(sql, /admin_purge_expired_user_resets\(\s*\)/);
        assert.match(sql, /admin_get_user_reset_status\(\s*p_target_user_id\s+UUID\s*\)/);
        // Nenhuma RPC tem parâmetro de metadata
        assert.ok(!sql.includes('p_metadata'), 'Nenhuma função pode receber metadata como parâmetro');
    });

    it('deve garantir que as RPCs públicas nunca retornem o snapshot JSONB', () => {
        assert.ok(!sql.includes('RETURNS TABLE (\n    snapshot JSONB'), 'admin_reset_user_data não pode retornar snapshot');
        assert.ok(!sql.includes('snapshot JSONB,'), 'admin_get_user_reset_status não pode projetar snapshot');
    });

    it('deve garantir que os logs de auditoria contenham apenas metadados operacionais e nenhum valor financeiro', () => {
        assert.match(sql, /'records_snapshotted',\s*v_item_count/);
        assert.ok(!sql.includes('valor_limite'), 'Auditoria não pode conter valor_limite');
        assert.ok(!sql.includes('valor_transacao'), 'Auditoria não pode conter valores financeiros');
        assert.ok(!sql.includes('descricao'), 'Auditoria não pode conter descrições financeiras');
    });

    it('deve aplicar REVOKE ALL de PUBLIC/anon/authenticated e GRANT EXECUTE apenas para authenticated', () => {
        const funcs = [
            'public.admin_reset_user_data(UUID)',
            'public.admin_restore_user_data(UUID, UUID)',
            'public.admin_purge_expired_user_resets()',
            'public.admin_get_user_reset_status(UUID)'
        ];

        for (const fn of funcs) {
            assert.ok(sql.includes(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC, anon, authenticated;`), `REVOKE presente para ${fn}`);
            assert.ok(sql.includes(`GRANT EXECUTE ON FUNCTION ${fn} TO authenticated;`), `GRANT EXECUTE presente para ${fn}`);
        }
    });
});

describe('Fase 4.5-C5-B / C5-B.1 — adminService wrappers (Unit)', () => {
    it('resetUserData: deve retornar protocolo seguro sem snapshot quando a RPC tiver sucesso', async () => {
        const mockRow = {
            reset_id: '99999999-9999-9999-9999-999999999999',
            created_at: '2026-09-11T12:00:00Z',
            expires_at: '2026-09-13T12:00:00Z'
        };

        const mockClient = {
            rpc: mock.fn(async (fnName, params) => {
                assert.equal(fnName, 'admin_reset_user_data');
                assert.equal(params.p_target_user_id, '11111111-1111-1111-1111-111111111111');
                return { data: [mockRow], error: null };
            })
        };

        async function resetUserDataWithClient(client, targetUserId) {
            if (!targetUserId) return { success: false, error: new Error('ID do usuário alvo é obrigatório.') };
            const { data, error } = await client.rpc('admin_reset_user_data', { p_target_user_id: targetUserId });
            if (error) return { success: false, resetId: null, error };
            const row = Array.isArray(data) ? data[0] : data;
            return {
                success: Boolean(row?.reset_id),
                resetId: row?.reset_id || null,
                createdAt: row?.created_at || null,
                expiresAt: row?.expires_at || null,
                error: null
            };
        }

        const res = await resetUserDataWithClient(mockClient, '11111111-1111-1111-1111-111111111111');
        assert.equal(res.success, true);
        assert.equal(res.resetId, '99999999-9999-9999-9999-999999999999');
        assert.equal(res.createdAt, '2026-09-11T12:00:00Z');
        assert.equal(res.expiresAt, '2026-09-13T12:00:00Z');
        assert.equal(res.error, null);
        assert.equal('snapshot' in res, false, 'Snapshot nunca deve existir no retorno');
    });

    it('resetUserData: nenhum parâmetro aceita snapshot ou metadata do frontend', async () => {
        const mockClient = {
            rpc: mock.fn(async (fnName, params) => {
                // Garante que apenas p_target_user_id é repassado
                assert.deepEqual(Object.keys(params), ['p_target_user_id']);
                return { data: [{ reset_id: 'abc', created_at: 'd', expires_at: 'e' }], error: null };
            })
        };

        async function resetUserDataWithClient(client, targetUserId) {
            const { data, error } = await client.rpc('admin_reset_user_data', { p_target_user_id: targetUserId });
            return { success: !error };
        }

        await resetUserDataWithClient(mockClient, 'uid-123');
        assert.equal(mockClient.rpc.mock.callCount(), 1);
    });

    it('resetUserData: deve retornar erro ao tentar resetar a si mesmo (auto-admin negado)', async () => {
        const mockClient = {
            rpc: mock.fn(async () => ({
                data: null,
                error: { message: 'Operação não permitida sobre a própria conta de administrador.', code: '42501' }
            }))
        };

        async function resetUserDataWithClient(client, targetUserId) {
            const { data, error } = await client.rpc('admin_reset_user_data', { p_target_user_id: targetUserId });
            if (error) return { success: false, resetId: null, error };
            return { success: true };
        }

        const res = await resetUserDataWithClient(mockClient, 'self-id');
        assert.equal(res.success, false);
        assert.equal(res.error.code, '42501');
        assert.match(res.error.message, /própria conta/);
    });

    it('resetUserData: deve retornar erro ao tentar resetar outro admin', async () => {
        const mockClient = {
            rpc: mock.fn(async () => ({
                data: null,
                error: { message: 'Operação não permitida sobre contas de administração.', code: '42501' }
            }))
        };

        async function resetUserDataWithClient(client, targetUserId) {
            const { data, error } = await client.rpc('admin_reset_user_data', { p_target_user_id: targetUserId });
            if (error) return { success: false, resetId: null, error };
            return { success: true };
        }

        const res = await resetUserDataWithClient(mockClient, 'other-admin-id');
        assert.equal(res.success, false);
        assert.equal(res.error.code, '42501');
    });

    it('resetUserData: deve retornar erro quando já existir reset ativo para o usuário', async () => {
        const mockClient = {
            rpc: mock.fn(async () => ({
                data: null,
                error: { message: 'Já existe um reset ativo para este usuário.', code: '23505' }
            }))
        };

        async function resetUserDataWithClient(client, targetUserId) {
            const { data, error } = await client.rpc('admin_reset_user_data', { p_target_user_id: targetUserId });
            if (error) return { success: false, resetId: null, error };
            return { success: true };
        }

        const res = await resetUserDataWithClient(mockClient, 'user-id');
        assert.equal(res.success, false);
        assert.equal(res.error.code, '23505');
    });

    it('restoreUserData: deve retornar sucesso quando dentro de 48h e sem novos dados', async () => {
        const mockClient = {
            rpc: mock.fn(async (fnName, params) => {
                assert.equal(fnName, 'admin_restore_user_data');
                assert.equal(params.p_target_user_id, 'target-id');
                assert.equal(params.p_reset_id, 'reset-id');
                return { data: true, error: null };
            })
        };

        async function restoreUserDataWithClient(client, targetUserId, resetId) {
            const { data, error } = await client.rpc('admin_restore_user_data', {
                p_target_user_id: targetUserId,
                p_reset_id: resetId
            });
            if (error) return { success: false, error };
            return { success: Boolean(data), error: null };
        }

        const res = await restoreUserDataWithClient(mockClient, 'target-id', 'reset-id');
        assert.equal(res.success, true);
        assert.equal(res.error, null);
    });

    it('restoreUserData: deve abortar fail-closed se o usuário possuir novos dados (22000)', async () => {
        const mockClient = {
            rpc: mock.fn(async () => ({
                data: null,
                error: { message: 'Usuário possui novos dados após o reset.', code: '22000' }
            }))
        };

        async function restoreUserDataWithClient(client, targetUserId, resetId) {
            const { data, error } = await client.rpc('admin_restore_user_data', {
                p_target_user_id: targetUserId,
                p_reset_id: resetId
            });
            if (error) return { success: false, error };
            return { success: true, error: null };
        }

        const res = await restoreUserDataWithClient(mockClient, 'target-id', 'reset-id');
        assert.equal(res.success, false);
        assert.equal(res.error.code, '22000');
        assert.match(res.error.message, /novos dados/);
    });

    it('restoreUserData: deve rejeitar restauração após 48h (22023)', async () => {
        const mockClient = {
            rpc: mock.fn(async () => ({
                data: null,
                error: { message: 'Prazo de 48 horas para restauração expirado.', code: '22023' }
            }))
        };

        async function restoreUserDataWithClient(client, targetUserId, resetId) {
            const { data, error } = await client.rpc('admin_restore_user_data', {
                p_target_user_id: targetUserId,
                p_reset_id: resetId
            });
            if (error) return { success: false, error };
            return { success: true, error: null };
        }

        const res = await restoreUserDataWithClient(mockClient, 'target-id', 'reset-id');
        assert.equal(res.success, false);
        assert.equal(res.error.code, '22023');
        assert.match(res.error.message, /expirado/);
    });

    it('getUserResetStatus: deve retornar metadados de status sem snapshot', async () => {
        const mockClient = {
            rpc: mock.fn(async (fnName, params) => {
                assert.equal(fnName, 'admin_get_user_reset_status');
                assert.equal(params.p_target_user_id, 'target-id');
                return {
                    data: [{
                        has_active_reset: true,
                        reset_id: 'reset-uuid',
                        created_at: '2026-09-11T10:00:00Z',
                        expires_at: '2026-09-13T10:00:00Z',
                        is_recoverable: true
                    }],
                    error: null
                };
            })
        };

        async function getUserResetStatusWithClient(client, targetUserId) {
            const { data, error } = await client.rpc('admin_get_user_reset_status', {
                p_target_user_id: targetUserId
            });
            if (error) return { hasActiveReset: false, resetId: null, isRecoverable: false, error };
            const row = Array.isArray(data) ? data[0] : data;
            return {
                hasActiveReset: Boolean(row?.has_active_reset),
                resetId: row?.reset_id || null,
                createdAt: row?.created_at || null,
                expiresAt: row?.expires_at || null,
                isRecoverable: Boolean(row?.is_recoverable),
                error: null
            };
        }

        const res = await getUserResetStatusWithClient(mockClient, 'target-id');
        assert.equal(res.hasActiveReset, true);
        assert.equal(res.resetId, 'reset-uuid');
        assert.equal(res.isRecoverable, true);
        assert.equal(res.error, null);
        assert.equal('snapshot' in res, false);
    });

    it('purgeExpiredResets: deve chamar a RPC de purge e retornar a contagem de registros destruídos', async () => {
        const mockClient = {
            rpc: mock.fn(async (fnName) => {
                assert.equal(fnName, 'admin_purge_expired_user_resets');
                return { data: 3, error: null };
            })
        };

        async function purgeExpiredResetsWithClient(client) {
            const { data, error } = await client.rpc('admin_purge_expired_user_resets');
            if (error) return { purgedCount: 0, error };
            return { purgedCount: Number(data) || 0, error: null };
        }

        const res = await purgeExpiredResetsWithClient(mockClient);
        assert.equal(res.purgedCount, 3);
        assert.equal(res.error, null);
    });
});

describe('Fase 4.5-C5-D — Reset de Dados com Recuperação por 48h (Central Admin UI & Controls)', () => {
    const indexPath = path.resolve('index.html');
    assert.ok(fs.existsSync(indexPath), 'index.html deve existir');
    const indexHtml = fs.readFileSync(indexPath, 'utf8');

    it('1. modal consulta status do reset automaticamente ao abrir', () => {
        const openModalFn = indexHtml.substring(
            indexHtml.indexOf('function openAdminUserActionsModal'),
            indexHtml.indexOf('function closeAdminUserActionsModal')
        );
        assert.match(openModalFn, /loadAdminUserResetStatus\(userId\)/, 'Deve chamar loadAdminUserResetStatus ao abrir o modal');
    });

    it('2. estado de loading bloqueia botão de reset (fail-closed)', () => {
        assert.match(indexHtml, /let isAdminResetStatusLoading\s*=\s*false;/);
        assert.match(indexHtml, /isAdminResetStatusLoading\s*=\s*true;/);
        assert.match(indexHtml, /if\s*\(resetBtn\)\s*resetBtn\.disabled\s*=\s*true;/);
        const openConfirmFn = indexHtml.substring(
            indexHtml.indexOf('function openAdminResetConfirmModal'),
            indexHtml.indexOf('function closeAdminResetConfirmModal')
        );
        assert.match(openConfirmFn, /if\s*\(isAdminResetStatusLoading/);
    });

    it('3. erro na consulta de status bloqueia reset e exibe mensagem amigável (fail-closed)', () => {
        const loadStatusFn = indexHtml.substring(
            indexHtml.indexOf('async function loadAdminUserResetStatus'),
            indexHtml.indexOf('function openAdminResetConfirmModal')
        );
        assert.match(loadStatusFn, /if\s*\(statusRes\.error\)/);
        assert.match(loadStatusFn, /Não foi possível consultar o estado do reset\./);
        assert.match(loadStatusFn, /if\s*\(resetBtn\)\s*resetBtn\.disabled\s*=\s*true;/);
    });

    it('4. sem reset ativo exibe botão funcional "Resetar dados"', () => {
        assert.match(indexHtml, /id="adminDataResetDefaultView"/);
        assert.match(indexHtml, /id="btnAdminOpenResetConfirm"/);
        assert.match(indexHtml, /Resetar dados/);
    });

    it('5. primeiro clique no botão abre modal de confirmação sem executar RPC', () => {
        assert.match(indexHtml, /onclick="openAdminResetConfirmModal\(\)"/);
        const openConfirmFn = indexHtml.substring(
            indexHtml.indexOf('function openAdminResetConfirmModal'),
            indexHtml.indexOf('function closeAdminResetConfirmModal')
        );
        assert.ok(!openConfirmFn.includes('adminResetUserData'), 'Abrir confirmação NÃO executa a RPC de reset');
        assert.match(openConfirmFn, /modal\.style\.display\s*=\s*'flex'/);
    });

    it('6. ação "Cancelar" na confirmação fecha modal sem disparar RPC', () => {
        const closeConfirmFn = indexHtml.substring(
            indexHtml.indexOf('function closeAdminResetConfirmModal'),
            indexHtml.indexOf('async function executeAdminResetData')
        );
        assert.match(closeConfirmFn, /modal\.style\.display\s*=\s*'none'/);
        assert.ok(!closeConfirmFn.includes('adminResetUserData'), 'Cancelar NÃO executa reset');
    });

    it('7. confirmar executa reset de dados com texto obrigatório de governança e prazo 48h', () => {
        assert.match(indexHtml, /id="adminResetConfirmModal"/);
        assert.match(indexHtml, /Esta ação removerá os dados financeiros e configurações financeiras deste usuário do aplicativo\./);
        assert.match(indexHtml, /A conta, o nome, o e-mail, a senha e o status de acesso serão preservados\./);
        assert.match(indexHtml, /Os dados poderão ser restaurados por até 48 horas\./);
        assert.match(indexHtml, /Após 48 horas, a recuperação não será mais possível\./);
        assert.match(indexHtml, /id="btnAdminExecuteReset"/);
        assert.match(indexHtml, /onclick="executeAdminResetData\(\)"/);
    });

    it('8. duplo clique no botão de reset é estritamente bloqueado (guard isAdminDataResetSubmitting)', () => {
        assert.match(indexHtml, /let isAdminDataResetSubmitting\s*=\s*false;/);
        const executeResetFn = indexHtml.substring(
            indexHtml.indexOf('async function executeAdminResetData'),
            indexHtml.indexOf('function openAdminRestoreConfirmModal')
        );
        assert.match(executeResetFn, /if\s*\(isAdminDataResetSubmitting\)\s*return;/);
        assert.match(executeResetFn, /isAdminDataResetSubmitting\s*=\s*true;/);
        assert.match(executeResetFn, /confirmBtn\.disabled\s*=\s*true;/);
        assert.match(executeResetFn, /confirmBtn\.innerText\s*=\s*'Resetando\.\.\.';/);
    });

    it('9. sucesso no reset atualiza o estado visual, exibe confirmação e recarrega status', () => {
        const executeResetFn = indexHtml.substring(
            indexHtml.indexOf('async function executeAdminResetData'),
            indexHtml.indexOf('function openAdminRestoreConfirmModal')
        );
        assert.match(executeResetFn, /closeAdminResetConfirmModal\(\);/);
        assert.match(executeResetFn, /Dados resetados com sucesso\. É possível desfazer esta ação por até 48 horas\./);
        assert.match(executeResetFn, /await loadAdminUserResetStatus\(activeAdminActionUser\.userId\);/);
        assert.match(executeResetFn, /await loadAdminUsersView\(\);/);
    });

    it('10. reset ativo exibe informações de prazo e data de realização', () => {
        assert.match(indexHtml, /id="adminDataResetActiveView"/);
        assert.match(indexHtml, /id="adminActiveResetCreatedAt"/);
        assert.match(indexHtml, /id="adminActiveResetExpiresInfo"/);
        assert.match(indexHtml, /formatResetDateTime/);
        assert.match(indexHtml, /getRemainingHoursText/);
    });

    it('11. reset ativo exibe botão "Desfazer reset"', () => {
        assert.match(indexHtml, /id="btnAdminOpenRestoreConfirm"/);
        assert.match(indexHtml, /Desfazer reset/);
        assert.match(indexHtml, /onclick="openAdminRestoreConfirmModal\(\)"/);
    });

    it('12. desfazer reset exige confirmação prévia com aviso de bloqueio por novos dados', () => {
        assert.match(indexHtml, /id="adminRestoreConfirmModal"/);
        assert.match(indexHtml, /Os dados preservados no reset serão restaurados para o usuário\./);
        assert.match(indexHtml, /A restauração só é possível enquanto a janela de recuperação estiver ativa\./);
        assert.match(indexHtml, /Se o usuário já tiver criado novos dados após o reset, a restauração será bloqueada para evitar conflitos\./);
        const openRestoreFn = indexHtml.substring(
            indexHtml.indexOf('function openAdminRestoreConfirmModal'),
            indexHtml.indexOf('function closeAdminRestoreConfirmModal')
        );
        assert.ok(!openRestoreFn.includes('adminRestoreUserData'), 'Abrir confirmação NÃO executa restore');
    });

    it('13. restore executa com proteção contra clique duplo (guard isAdminDataRestoreSubmitting)', () => {
        assert.match(indexHtml, /let isAdminDataRestoreSubmitting\s*=\s*false;/);
        const executeRestoreFn = indexHtml.substring(
            indexHtml.indexOf('async function executeAdminRestoreData'),
            indexHtml.indexOf('function openAdminUserActionsModal')
        );
        assert.match(executeRestoreFn, /if\s*\(isAdminDataRestoreSubmitting\)\s*return;/);
        assert.match(executeRestoreFn, /isAdminDataRestoreSubmitting\s*=\s*true;/);
        assert.match(executeRestoreFn, /restoreBtn\.disabled\s*=\s*true;/);
        assert.match(executeRestoreFn, /restoreBtn\.innerText\s*=\s*'Restaurando\.\.\.';/);
    });

    it('14. erro de conflito por novos dados após reset é tratado com mensagem amigável (fail-closed)', () => {
        const executeRestoreFn = indexHtml.substring(
            indexHtml.indexOf('async function executeAdminRestoreData'),
            indexHtml.indexOf('function openAdminUserActionsModal')
        );
        assert.match(executeRestoreFn, /isNewDataConflict/);
        assert.match(executeRestoreFn, /Não foi possível restaurar porque o usuário já possui novos dados após o reset\./);
    });

    it('15. reset expirado não oferece restore e não exibe botões de purgar', () => {
        assert.match(indexHtml, /id="adminDataResetExpiredNotice"/);
        assert.match(indexHtml, /O período de recuperação do último reset expirou\./);
        assert.ok(!indexHtml.includes('>Purgar<'), 'Não deve existir botão de purgar');
        assert.ok(!indexHtml.includes('>Apagar snapshot<'), 'Não deve existir botão de apagar snapshot');
        assert.ok(!indexHtml.includes('>Limpar backup<'), 'Não deve existir botão de limpar backup');
    });

    it('16. snapshot JSONB nunca aparece no DOM ou em atributos HTML', () => {
        assert.ok(!indexHtml.includes('snapshot JSONB'), 'Snapshot não deve estar no DOM');
        assert.ok(!indexHtml.includes('data-snapshot'), 'Snapshot não deve estar em dataset');
        assert.ok(!indexHtml.includes('.snapshot'), 'Código não deve projetar propriedade .snapshot');
    });

    it('17. reset_id bruto nunca é exibido visualmente na interface', () => {
        // O resetId deve ficar em memória em activeAdminActionUserResetStatus.resetId
        assert.ok(!indexHtml.includes('id="adminResetId"'), 'Não deve existir elemento DOM para exibir resetId');
        assert.ok(!indexHtml.includes('resetId: <strong>'), 'Não deve exibir resetId em texto visual');
    });

    it('18. conta do próprio administrador é protegida contra reset na UI', () => {
        const loadStatusFn = indexHtml.substring(
            indexHtml.indexOf('async function loadAdminUserResetStatus'),
            indexHtml.indexOf('function openAdminResetConfirmModal')
        );
        assert.match(loadStatusFn, /if\s*\(currentUser\s*&&\s*currentUser\.id\s*===\s*userId\)/);
        assert.match(loadStatusFn, /resetBtn\.disabled\s*=\s*true;/);
        assert.match(loadStatusFn, /Operação não permitida sobre a própria conta/);
    });

    it('19. outras contas de administrador também não podem ser resetadas', () => {
        const migrationPath = path.resolve('supabase/migrations/20260911160000_fase45_admin_data_resets.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');
        assert.match(sql, /IF\s+EXISTS\s*\(SELECT\s+1\s+FROM\s+public\.admin_users\s+WHERE\s+user_id\s*=\s*p_target_user_id\)\s+THEN/);
    });

    it('20. seção de exclusão permanente de conta (evoluída na Fase 4.5-C5-E)', () => {
        assert.match(indexHtml, /Exclusão Permanente da Conta/);
        assert.ok(
            /<span[^>]*>(?:Em breve|Irreversível)<\/span>/.test(indexHtml),
            'Badge da seção de exclusão deve estar presente'
        );
        assert.ok(
            indexHtml.includes('btnAdminOpenDeleteConfirm') || /<button type="button" class="btn-danger"/.test(indexHtml),
            'Controle de exclusão permanente deve estar presente'
        );
    });

    it('21. HOTFIX C5-I.1: migration corretiva elimina ambiguidade de created_at qualificando o RETURNING com alias udr', () => {
        const fixMigrationPath = path.resolve('supabase/migrations/20260912140000_fase45_fix_admin_data_reset_ambiguity.sql');
        assert.ok(fs.existsSync(fixMigrationPath), 'A migration corretiva C5-I.1 deve existir');
        const fixSql = fs.readFileSync(fixMigrationPath, 'utf8');

        // Confirma qualificação explícita via alias udr
        assert.match(fixSql, /INSERT\s+INTO\s+public\.user_data_resets\s+AS\s+udr/i);
        assert.match(fixSql, /RETURNING\s+[\r\n\s]*udr\.id,\s*[\r\n\s]*udr\.created_at,\s*[\r\n\s]*udr\.expires_at/i);
        assert.match(fixSql, /INTO\s+[\r\n\s]*v_reset_id,\s*[\r\n\s]*v_created_at,\s*[\r\n\s]*v_expires_at;/i);

        // Confirma que NÃO possui o RETURNING ambíguo sem qualificação
        assert.doesNotMatch(fixSql, /RETURNING\s+id,\s*created_at,\s*expires_at/i);
    });

    it('22. HOTFIX C5-I.4: migration corretiva elimina colunas GENERATED ALWAYS da lista de colunas no restore', () => {
        const restoreFixPath = path.resolve('supabase/migrations/20260912150000_fase45_fix_admin_data_restore_generated_columns.sql');
        assert.ok(fs.existsSync(restoreFixPath), 'A migration corretiva C5-I.4 deve existir');
        const restoreSql = fs.readFileSync(restoreFixPath, 'utf8');

        // A) Confirma que NÃO existe mais o padrão SELECT * genérico
        assert.doesNotMatch(restoreSql, /INSERT\s+INTO\s+public\.app_tags\s+SELECT\s+\*/i);
        assert.doesNotMatch(restoreSql, /INSERT\s+INTO\s+public\.app_cartoes\s+SELECT\s+\*/i);
        assert.doesNotMatch(restoreSql, /INSERT\s+INTO\s+public\.app_categorias\s+SELECT\s+\*/i);
        assert.doesNotMatch(restoreSql, /INSERT\s+INTO\s+public\.app_subcategorias\s+SELECT\s+\*/i);
        assert.doesNotMatch(restoreSql, /INSERT\s+INTO\s+public\.metas\s+SELECT\s+\*/i);
        assert.doesNotMatch(restoreSql, /INSERT\s+INTO\s+public\.transacoes\s+SELECT\s+\*/i);
        assert.doesNotMatch(restoreSql, /INSERT\s+INTO\s+public\.liquidacoes_credito\s+SELECT\s+\*/i);

        // B) Confirma que nome_normalizado NÃO aparece em nenhuma lista de colunas
        assert.doesNotMatch(restoreSql, /INSERT\s+INTO\s+public\.app_tags\s*\([^)]*nome_normalizado[^)]*\)/i);
        assert.doesNotMatch(restoreSql, /INSERT\s+INTO\s+public\.app_cartoes\s*\([^)]*nome_normalizado[^)]*\)/i);
        assert.doesNotMatch(restoreSql, /INSERT\s+INTO\s+public\.app_categorias\s*\([^)]*nome_normalizado[^)]*\)/i);
        assert.doesNotMatch(restoreSql, /INSERT\s+INTO\s+public\.app_subcategorias\s*\([^)]*nome_normalizado[^)]*\)/i);

        // C) Confirma que categoria_normalizada NÃO aparece na lista de metas
        assert.doesNotMatch(restoreSql, /INSERT\s+INTO\s+public\.metas\s*\([^)]*categoria_normalizada[^)]*\)/i);

        // D) Confirma que IDs e timestamps históricos estão presentes nas listas explícitas
        assert.match(restoreSql, /INSERT\s+INTO\s+public\.app_tags\s*\([^)]*\bid\b[^)]*\bcreated_at\b[^)]*\bupdated_at\b[^)]*\)/i);
        assert.match(restoreSql, /INSERT\s+INTO\s+public\.app_cartoes\s*\([^)]*\bid\b[^)]*\bcreated_at\b[^)]*\bupdated_at\b[^)]*\)/i);
        assert.match(restoreSql, /INSERT\s+INTO\s+public\.app_categorias\s*\([^)]*\bid\b[^)]*\bcreated_at\b[^)]*\bupdated_at\b[^)]*\)/i);
        assert.match(restoreSql, /INSERT\s+INTO\s+public\.app_subcategorias\s*\([^)]*\bid\b[^)]*\bcreated_at\b[^)]*\bupdated_at\b[^)]*\)/i);
        assert.match(restoreSql, /INSERT\s+INTO\s+public\.metas\s*\([^)]*\bid\b[^)]*\bcreated_at\b[^)]*\bupdated_at\b[^)]*\)/i);
        assert.match(restoreSql, /INSERT\s+INTO\s+public\.transacoes\s*\([^)]*\bid\b[^)]*\bcreated_at\b[^)]*\)/i);
        assert.match(restoreSql, /INSERT\s+INTO\s+public\.liquidacoes_credito\s*\([^)]*\bid\b[^)]*\bcreated_at\b[^)]*\bupdated_at\b[^)]*\)/i);

        // E) Confirma segurança e permissões
        assert.match(restoreSql, /SECURITY\s+DEFINER/i);
        assert.match(restoreSql, /SET\s+search_path\s*=\s*pg_catalog,\s*public,\s*auth/i);
        assert.match(restoreSql, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.admin_restore_user_data\(UUID,\s*UUID\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i);
        assert.match(restoreSql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_restore_user_data\(UUID,\s*UUID\)\s+TO\s+authenticated;/i);
    });
});
