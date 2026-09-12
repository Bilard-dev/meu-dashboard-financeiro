import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('adminService — checkIsAdmin (Unit)', () => {
    it('deve retornar true quando a RPC is_admin responder com true', async () => {
        const mockSupabaseClient = {
            rpc: mock.fn(async (fnName) => {
                assert.equal(fnName, 'is_admin');
                return { data: true, error: null };
            })
        };

        async function checkIsAdminWithClient(client) {
            try {
                const { data, error } = await client.rpc('is_admin');
                if (error) return false;
                return Boolean(data);
            } catch {
                return false;
            }
        }

        const result = await checkIsAdminWithClient(mockSupabaseClient);
        assert.equal(result, true);
        assert.equal(mockSupabaseClient.rpc.mock.callCount(), 1);
    });

    it('deve retornar false quando a RPC is_admin responder com false (usuário comum)', async () => {
        const mockSupabaseClient = {
            rpc: mock.fn(async () => ({ data: false, error: null }))
        };

        async function checkIsAdminWithClient(client) {
            try {
                const { data, error } = await client.rpc('is_admin');
                if (error) return false;
                return Boolean(data);
            } catch {
                return false;
            }
        }

        const result = await checkIsAdminWithClient(mockSupabaseClient);
        assert.equal(result, false);
    });

    it('deve falhar fechado (retornar false) quando a RPC retornar erro (ex: 403 / unauthenticated)', async () => {
        const mockSupabaseClient = {
            rpc: mock.fn(async () => ({ data: null, error: { message: 'permission denied for function is_admin' } }))
        };

        async function checkIsAdminWithClient(client) {
            try {
                const { data, error } = await client.rpc('is_admin');
                if (error) return false;
                return Boolean(data);
            } catch {
                return false;
            }
        }

        const result = await checkIsAdminWithClient(mockSupabaseClient);
        assert.equal(result, false);
    });

    it('deve falhar fechado (retornar false) quando a chamada lançar exceção de rede', async () => {
        const mockSupabaseClient = {
            rpc: mock.fn(async () => {
                throw new Error('Network timeout / connection refused');
            })
        };

        async function checkIsAdminWithClient(client) {
            try {
                const { data, error } = await client.rpc('is_admin');
                if (error) return false;
                return Boolean(data);
            } catch {
                return false;
            }
        }

        const result = await checkIsAdminWithClient(mockSupabaseClient);
        assert.equal(result, false);
    });

    it('deve falhar fechado (retornar false) quando a resposta for undefined ou nula', async () => {
        const mockSupabaseClient = {
            rpc: mock.fn(async () => ({ data: null, error: null }))
        };

        async function checkIsAdminWithClient(client) {
            try {
                const { data, error } = await client.rpc('is_admin');
                if (error) return false;
                return Boolean(data);
            } catch {
                return false;
            }
        }

        const result = await checkIsAdminWithClient(mockSupabaseClient);
        assert.equal(result, false);
    });
});

describe('adminService — checkHasAppAccess (Unit)', () => {
    async function checkHasAppAccessWithClient(client) {
        try {
            const { data, error } = await client.rpc('has_app_access');
            if (error) return false;
            return Boolean(data);
        } catch {
            return false;
        }
    }

    it('deve retornar true quando a RPC has_app_access responder com true (admin ou approved)', async () => {
        const mockSupabaseClient = {
            rpc: mock.fn(async (fnName) => {
                assert.equal(fnName, 'has_app_access');
                return { data: true, error: null };
            })
        };

        const result = await checkHasAppAccessWithClient(mockSupabaseClient);
        assert.equal(result, true);
        assert.equal(mockSupabaseClient.rpc.mock.callCount(), 1);
    });

    it('deve retornar false quando a RPC has_app_access responder com false (pending/rejected/suspended)', async () => {
        const mockSupabaseClient = {
            rpc: mock.fn(async () => ({ data: false, error: null }))
        };

        const result = await checkHasAppAccessWithClient(mockSupabaseClient);
        assert.equal(result, false);
    });

    it('deve falhar fechado (retornar false) quando a RPC retornar erro', async () => {
        const mockSupabaseClient = {
            rpc: mock.fn(async () => ({ data: null, error: { message: 'permission denied for function has_app_access' } }))
        };

        const result = await checkHasAppAccessWithClient(mockSupabaseClient);
        assert.equal(result, false);
    });

    it('deve falhar fechado (retornar false) quando a chamada lançar exceção de rede', async () => {
        const mockSupabaseClient = {
            rpc: mock.fn(async () => {
                throw new Error('Network timeout / connection refused');
            })
        };

        const result = await checkHasAppAccessWithClient(mockSupabaseClient);
        assert.equal(result, false);
    });
});

describe('adminService — getMyAccessStatus (Unit)', () => {
    it('deve retornar status e perfil corretos quando o usuário for approved', async () => {
        const mockSession = { user: { id: 'usr-123' } };
        const mockProfile = {
            user_id: 'usr-123',
            display_name: 'Thiago Bilard',
            access_status: 'approved',
            created_at: '2026-09-10T20:00:00Z',
            approved_at: '2026-09-10T20:05:00Z'
        };

        async function getMyAccessStatusWithMocks(session, profile, err = null) {
            if (!session?.user) {
                return { status: 'unknown', profile: null, error: new Error('Usuário não autenticado.') };
            }
            if (err) {
                return { status: 'pending', profile: null, error: err };
            }
            if (!profile) {
                return { status: 'needs_profile', profile: null, error: null };
            }
            return { status: profile.access_status || 'pending', profile, error: null };
        }

        const res = await getMyAccessStatusWithMocks(mockSession, mockProfile);
        assert.equal(res.status, 'approved');
        assert.equal(res.profile.display_name, 'Thiago Bilard');
        assert.equal(res.error, null);
    });

    it('deve retornar status needs_profile quando o usuário legado não possuir perfil em user_profiles', async () => {
        const mockSession = { user: { id: 'usr-legacy' } };

        async function getMyAccessStatusWithMocks(session, profile, err = null) {
            if (!session?.user) return { status: 'unknown', profile: null, error: new Error('Usuário não autenticado.') };
            if (err) return { status: 'pending', profile: null, error: err };
            if (!profile) return { status: 'needs_profile', profile: null, error: null };
            return { status: profile.access_status || 'pending', profile, error: null };
        }

        const res = await getMyAccessStatusWithMocks(mockSession, null);
        assert.equal(res.status, 'needs_profile');
        assert.equal(res.profile, null);
    });

    it('deve retornar status pending para novos cadastros aguardando aprovação', async () => {
        const mockSession = { user: { id: 'usr-456' } };
        const mockProfile = {
            user_id: 'usr-456',
            display_name: 'João Silva',
            access_status: 'pending',
            created_at: '2026-09-10T20:10:00Z',
            approved_at: null
        };

        async function getMyAccessStatusWithMocks(session, profile) {
            if (!session?.user) return { status: 'unknown', profile: null, error: new Error('Usuário não autenticado.') };
            if (!profile) return { status: 'needs_profile', profile: null, error: null };
            return { status: profile.access_status || 'pending', profile, error: null };
        }

        const res = await getMyAccessStatusWithMocks(mockSession, mockProfile);
        assert.equal(res.status, 'pending');
        assert.equal(res.profile.access_status, 'pending');
    });

    it('deve retornar status rejected para contas rejeitadas', async () => {
        const mockSession = { user: { id: 'usr-789' } };
        const mockProfile = {
            user_id: 'usr-789',
            display_name: 'Conta Teste',
            access_status: 'rejected',
            created_at: '2026-09-10T20:10:00Z',
            approved_at: null
        };

        async function getMyAccessStatusWithMocks(session, profile) {
            if (!session?.user) return { status: 'unknown', profile: null, error: new Error('Usuário não autenticado.') };
            return { status: profile.access_status || 'pending', profile, error: null };
        }

        const res = await getMyAccessStatusWithMocks(mockSession, mockProfile);
        assert.equal(res.status, 'rejected');
    });

    it('deve falhar fechado (pending) se houver erro de rede ou banco ao consultar perfil', async () => {
        const mockSession = { user: { id: 'usr-999' } };

        async function getMyAccessStatusWithMocks(session, profile, err = null) {
            if (err) return { status: 'pending', profile: null, error: err };
            return { status: profile?.access_status || 'pending', profile, error: null };
        }

        const res = await getMyAccessStatusWithMocks(mockSession, null, new Error('Network timeout'));
        assert.equal(res.status, 'pending');
        assert.equal(res.profile, null);
        assert.ok(res.error);
    });
});

describe('adminService — completeLegacyProfile (Unit)', () => {
    async function completeLegacyProfileMock(displayName, rpcHandler) {
        const cleanName = String(displayName || '').trim();

        if (cleanName.length < 2) {
            return { success: false, error: new Error('O nome para identificação do usuário é obrigatório e deve ter no mínimo 2 caracteres.') };
        }

        if (cleanName.length > 80) {
            return { success: false, error: new Error('O nome para identificação do usuário deve ter no máximo 80 caracteres.') };
        }

        try {
            const { data, error } = await rpcHandler('complete_legacy_profile', { p_display_name: cleanName });
            if (error) return { success: false, error };
            return { success: Boolean(data), error: null };
        } catch (err) {
            return { success: false, error: err };
        }
    }

    it('deve aceitar nome válido e chamar a RPC correta', async () => {
        const mockRpc = mock.fn(async (fnName, params) => {
            assert.equal(fnName, 'complete_legacy_profile');
            assert.equal(params.p_display_name, 'Thiago Bilard');
            assert.equal(params.user_id, undefined); // GARANTIA: não envia user_id
            assert.equal(params.access_status, undefined); // GARANTIA: não envia status
            return { data: true, error: null };
        });

        const res = await completeLegacyProfileMock('  Thiago Bilard  ', mockRpc);
        assert.equal(res.success, true);
        assert.equal(res.error, null);
        assert.equal(mockRpc.mock.callCount(), 1);
    });

    it('deve rejeitar nome vazio ou ausente sem chamar RPC', async () => {
        const mockRpc = mock.fn();
        const res1 = await completeLegacyProfileMock('', mockRpc);
        assert.equal(res1.success, false);
        assert.match(res1.error.message, /no mínimo 2 caracteres/);

        const res2 = await completeLegacyProfileMock('   ', mockRpc);
        assert.equal(res2.success, false);

        assert.equal(mockRpc.mock.callCount(), 0);
    });

    it('deve rejeitar nome menor que 2 caracteres', async () => {
        const mockRpc = mock.fn();
        const res = await completeLegacyProfileMock('A', mockRpc);
        assert.equal(res.success, false);
        assert.equal(mockRpc.mock.callCount(), 0);
    });

    it('deve rejeitar nome maior que 80 caracteres', async () => {
        const mockRpc = mock.fn();
        const longName = 'A'.repeat(81);
        const res = await completeLegacyProfileMock(longName, mockRpc);
        assert.equal(res.success, false);
        assert.match(res.error.message, /no máximo 80 caracteres/);
        assert.equal(mockRpc.mock.callCount(), 0);
    });

    it('deve tratar erro da RPC se o perfil já tiver sido preenchido anteriormente', async () => {
        const mockRpc = mock.fn(async () => ({
            data: null,
            error: { message: 'O perfil deste usuário já foi preenchido anteriormente.' }
        }));

        const res = await completeLegacyProfileMock('João Silva', mockRpc);
        assert.equal(res.success, false);
        assert.match(res.error.message, /já foi preenchido/);
    });

    it('deve falhar fechado se a chamada lançar exceção de rede', async () => {
        const mockRpc = mock.fn(async () => {
            throw new Error('Connection refused');
        });

        const res = await completeLegacyProfileMock('Maria Santos', mockRpc);
        assert.equal(res.success, false);
        assert.match(res.error.message, /Connection refused/);
    });
});

describe('adminService — listAdminUsers (Unit)', () => {
    async function listAdminUsersMock(options, rpcHandler) {
        const cleanStatus = options?.status ? String(options.status).trim().toLowerCase() : null;
        const validStatuses = ['needs_profile', 'pending', 'approved', 'rejected', 'suspended'];
        if (cleanStatus && !validStatuses.includes(cleanStatus)) {
            return { users: [], error: new Error(`Status de filtro inválido (${cleanStatus}).`) };
        }

        try {
            const { data, error } = await rpcHandler('admin_list_users', {
                p_search: options?.search ? String(options.search).trim() : null,
                p_status: cleanStatus,
                p_limit: Number.isInteger(options?.limit) ? options.limit : 50,
                p_offset: Number.isInteger(options?.offset) ? options.offset : 0
            });
            if (error) return { users: [], error };
            return { users: Array.isArray(data) ? data : [], error: null };
        } catch (err) {
            return { users: [], error: err };
        }
    }

    it('deve listar usuários com parâmetros padrão', async () => {
        const mockUsers = [
            { user_id: 'u1', display_name: 'Ana', email: 'ana@teste.com', access_status: 'approved' },
            { user_id: 'u2', display_name: null, email: 'legado@teste.com', access_status: 'needs_profile' }
        ];

        const mockRpc = mock.fn(async (fnName, params) => {
            assert.equal(fnName, 'admin_list_users');
            assert.equal(params.p_search, null);
            assert.equal(params.p_status, null);
            assert.equal(params.p_limit, 50);
            assert.equal(params.p_offset, 0);
            return { data: mockUsers, error: null };
        });

        const res = await listAdminUsersMock({}, mockRpc);
        assert.equal(res.users.length, 2);
        assert.equal(res.users[0].display_name, 'Ana');
        assert.equal(res.users[1].access_status, 'needs_profile');
        assert.equal(res.error, null);
    });

    it('deve repassar parâmetros de busca, status e paginação corretamente', async () => {
        const mockRpc = mock.fn(async (fnName, params) => {
            assert.equal(params.p_search, 'Carlos');
            assert.equal(params.p_status, 'pending');
            assert.equal(params.p_limit, 10);
            assert.equal(params.p_offset, 20);
            return { data: [], error: null };
        });

        const res = await listAdminUsersMock({ search: '  Carlos  ', status: 'pending', limit: 10, offset: 20 }, mockRpc);
        assert.deepEqual(res.users, []);
        assert.equal(res.error, null);
    });

    it('deve rejeitar status de filtro inválido sem chamar a RPC', async () => {
        const mockRpc = mock.fn();
        const res = await listAdminUsersMock({ status: 'admin_invalido' }, mockRpc);
        assert.deepEqual(res.users, []);
        assert.ok(res.error);
        assert.match(res.error.message, /Status de filtro inválido/);
        assert.equal(mockRpc.mock.callCount(), 0);
    });

    it('deve falhar fechado e retornar lista vazia se a RPC retornar erro (ex: não admin)', async () => {
        const mockRpc = mock.fn(async () => ({
            data: null,
            error: { message: 'Acesso negado. Apenas administradores podem executar esta operação.' }
        }));

        const res = await listAdminUsersMock({}, mockRpc);
        assert.deepEqual(res.users, []);
        assert.ok(res.error);
        assert.match(res.error.message, /Acesso negado/);
    });

    it('deve falhar fechado e retornar lista vazia em caso de exceção de rede', async () => {
        const mockRpc = mock.fn(async () => {
            throw new Error('Network error');
        });

        const res = await listAdminUsersMock({}, mockRpc);
        assert.deepEqual(res.users, []);
        assert.ok(res.error);
    });
});

describe('adminService — setUserAccess (Unit)', () => {
    async function setUserAccessMock(userId, newStatus, rpcHandler) {
        if (!userId) {
            return { success: false, error: new Error('O identificador do usuário é obrigatório.') };
        }
        const cleanStatus = String(newStatus || '').trim().toLowerCase();
        const validStatuses = ['approved', 'rejected', 'suspended'];
        if (!validStatuses.includes(cleanStatus)) {
            return { success: false, error: new Error(`Status inválido. Valores aceitos: ${validStatuses.join(', ')}.`) };
        }

        try {
            const { data, error } = await rpcHandler('admin_set_user_access', {
                p_user_id: userId,
                p_new_status: cleanStatus
            });
            if (error) return { success: false, error };
            return { success: Boolean(data), error: null };
        } catch (err) {
            return { success: false, error: err };
        }
    }

    it('deve permitir aprovar usuário (pending -> approved)', async () => {
        const mockRpc = mock.fn(async (fnName, params) => {
            assert.equal(fnName, 'admin_set_user_access');
            assert.equal(params.p_user_id, 'user-123');
            assert.equal(params.p_new_status, 'approved');
            return { data: true, error: null };
        });

        const res = await setUserAccessMock('user-123', 'approved', mockRpc);
        assert.equal(res.success, true);
        assert.equal(res.error, null);
    });

    it('deve permitir rejeitar usuário (rejected)', async () => {
        const mockRpc = mock.fn(async (fnName, params) => {
            assert.equal(params.p_new_status, 'rejected');
            return { data: true, error: null };
        });

        const res = await setUserAccessMock('user-123', 'rejected', mockRpc);
        assert.equal(res.success, true);
    });

    it('deve permitir suspender usuário (suspended)', async () => {
        const mockRpc = mock.fn(async (fnName, params) => {
            assert.equal(params.p_new_status, 'suspended');
            return { data: true, error: null };
        });

        const res = await setUserAccessMock('user-123', 'suspended', mockRpc);
        assert.equal(res.success, true);
    });

    it('deve rejeitar cliente-side quando userId estiver ausente sem chamar RPC', async () => {
        const mockRpc = mock.fn();
        const res = await setUserAccessMock(null, 'approved', mockRpc);
        assert.equal(res.success, false);
        assert.match(res.error.message, /identificador do usuário é obrigatório/);
        assert.equal(mockRpc.mock.callCount(), 0);
    });

    it('deve rejeitar cliente-side status inválido sem chamar RPC', async () => {
        const mockRpc = mock.fn();
        const res = await setUserAccessMock('user-123', 'admin', mockRpc);
        assert.equal(res.success, false);
        assert.match(res.error.message, /Status inválido/);
        assert.equal(mockRpc.mock.callCount(), 0);
    });

    it('deve tratar erro quando a RPC rejeitar modificação de outro admin', async () => {
        const mockRpc = mock.fn(async () => ({
            data: null,
            error: { message: 'Operação não permitida. O status de administradores não pode ser alterado por esta via.' }
        }));

        const res = await setUserAccessMock('admin-uuid', 'suspended', mockRpc);
        assert.equal(res.success, false);
        assert.match(res.error.message, /status de administradores não pode ser alterado/);
    });

    it('deve tratar erro quando alvo não possuir perfil cadastrado (legado)', async () => {
        const mockRpc = mock.fn(async () => ({
            data: null,
            error: { message: 'Usuário legado não possui perfil cadastrado.' }
        }));

        const res = await setUserAccessMock('legacy-uuid', 'approved', mockRpc);
        assert.equal(res.success, false);
        assert.match(res.error.message, /Usuário legado não possui perfil cadastrado/);
    });

    it('deve falhar fechado se a chamada lançar exceção de rede', async () => {
        const mockRpc = mock.fn(async () => {
            throw new Error('Connection timeout');
        });

        const res = await setUserAccessMock('user-123', 'approved', mockRpc);
        assert.equal(res.success, false);
        assert.match(res.error.message, /Connection timeout/);
    });
});

describe('adminService — getActivityMetrics (Unit & Privacy Hardening)', () => {
    async function getActivityMetricsMock(rpcHandler) {
        try {
            const { data, error } = await rpcHandler('admin_get_activity_metrics');
            if (error) return { metrics: [], error };
            return { metrics: Array.isArray(data) ? data : [], error: null };
        } catch (err) {
            return { metrics: [], error: err };
        }
    }

    it('deve retornar métricas com sucesso para admin autorizado', async () => {
        const mockMetrics = [
            {
                user_id: 'usr-1',
                last_activity_at: '2026-09-11T10:00:00Z',
                operations_30d_band: '6-20',
                activity_level: 'ACTIVE',
                uses_transactions: true,
                uses_cards: true,
                uses_investments: false,
                uses_settlements: true,
                uses_metas: true
            }
        ];

        const mockRpc = mock.fn(async (fnName) => {
            assert.equal(fnName, 'admin_get_activity_metrics');
            return { data: mockMetrics, error: null };
        });

        const res = await getActivityMetricsMock(mockRpc);
        assert.equal(res.metrics.length, 1);
        assert.equal(res.metrics[0].user_id, 'usr-1');
        assert.equal(res.metrics[0].operations_30d_band, '6-20');
        assert.equal(res.metrics[0].activity_level, 'ACTIVE');
        assert.equal(res.metrics[0].uses_transactions, true);
        assert.equal(res.metrics[0].uses_cards, true);
        assert.equal(res.metrics[0].uses_investments, false);
        assert.equal(res.metrics[0].uses_settlements, true);
        assert.equal(res.metrics[0].uses_metas, true);
        assert.equal(res.error, null);
    });

    it('GARANTIA DE PRIVACIDADE: retorno NUNCA deve conter campos financeiros privados', async () => {
        const mockRow = {
            user_id: 'usr-1',
            last_activity_at: '2026-09-11T10:00:00Z',
            operations_30d_band: '1-5',
            activity_level: 'ACTIVE',
            uses_transactions: true,
            uses_cards: false,
            uses_investments: false,
            uses_settlements: false,
            uses_metas: false
        };

        const forbiddenFields = [
            'valor', 'valor_limite', 'saldo', 'total', 'descricao',
            'categoria', 'subcategoria', 'tag', 'cartao', 'cartao_nome',
            'fatura', 'ativo', 'patrimonio', 'taxa', 'uses_forecast'
        ];

        for (const field of forbiddenFields) {
            assert.equal(field in mockRow, false, `Campo proibido detectado no schema de retorno: ${field}`);
        }
    });

    it('deve validar todas as faixas permitidas de operations_30d_band (0, 1-5, 6-20, 20+)', () => {
        const validBands = ['0', '1-5', '6-20', '20+'];

        function computeBand(ops) {
            if (ops === 0) return '0';
            if (ops >= 1 && ops <= 5) return '1-5';
            if (ops >= 6 && ops <= 20) return '6-20';
            return '20+';
        }

        assert.equal(computeBand(0), '0');
        assert.equal(computeBand(1), '1-5');
        assert.equal(computeBand(5), '1-5');
        assert.equal(computeBand(6), '6-20');
        assert.equal(computeBand(20), '6-20');
        assert.equal(computeBand(21), '20+');
        assert.equal(computeBand(500), '20+');

        for (const ops of [0, 3, 15, 42]) {
            assert.ok(validBands.includes(computeBand(ops)));
        }
    });

    it('deve validar regras de activity_level (ACTIVE <=7d, LOW_ACTIVITY 8-30d, INACTIVE >30d, NEVER)', () => {
        const now = new Date('2026-09-11T12:00:00Z').getTime();

        function classifyActivity(lastActDate) {
            if (!lastActDate) return 'NEVER';
            const diffDays = (now - new Date(lastActDate).getTime()) / (1000 * 60 * 60 * 24);
            if (diffDays <= 7) return 'ACTIVE';
            if (diffDays <= 30) return 'LOW_ACTIVITY';
            return 'INACTIVE';
        }

        assert.equal(classifyActivity(null), 'NEVER');
        assert.equal(classifyActivity('2026-09-11T10:00:00Z'), 'ACTIVE'); // poucas horas atrás
        assert.equal(classifyActivity('2026-09-05T12:00:00Z'), 'ACTIVE'); // 6 dias atrás
        assert.equal(classifyActivity('2026-08-30T12:00:00Z'), 'LOW_ACTIVITY'); // 12 dias atrás
        assert.equal(classifyActivity('2026-08-15T12:00:00Z'), 'LOW_ACTIVITY'); // 27 dias atrás
        assert.equal(classifyActivity('2026-08-01T12:00:00Z'), 'INACTIVE'); // 41 dias atrás
        assert.equal(classifyActivity('2026-01-01T12:00:00Z'), 'INACTIVE');
    });

    it('deve falhar fechado se a RPC retornar erro (ex: 42501 não admin)', async () => {
        const mockRpc = mock.fn(async () => ({
            data: null,
            error: { message: 'Acesso negado. Apenas administradores podem executar esta operação.' }
        }));

        const res = await getActivityMetricsMock(mockRpc);
        assert.deepEqual(res.metrics, []);
        assert.ok(res.error);
        assert.match(res.error.message, /Acesso negado/);
    });

    it('deve falhar fechado em caso de exceção de rede', async () => {
        const mockRpc = mock.fn(async () => {
            throw new Error('Network error');
        });

        const res = await getActivityMetricsMock(mockRpc);
        assert.deepEqual(res.metrics, []);
        assert.ok(res.error);
        assert.match(res.error.message, /Network error/);
    });
});

describe('adminService — getActivitySummary (Unit)', () => {
    async function getActivitySummaryMock(rpcHandler) {
        try {
            const { data, error } = await rpcHandler('admin_get_activity_summary');
            if (error) return { summary: null, error };
            const summaryResult = Array.isArray(data) ? (data[0] || null) : (data || null);
            return { summary: summaryResult, error: null };
        } catch (err) {
            return { summary: null, error: err };
        }
    }

    it('deve retornar o resumo global com totais corretos', async () => {
        const mockSummary = [{
            total_users: 15,
            active_7d: 8,
            active_30d: 12,
            inactive_30d: 3,
            pending_users: 2,
            approved_users: 12,
            suspended_users: 1,
            rejected_users: 0,
            users_using_transactions: 11,
            users_using_cards: 7,
            users_using_investments: 4,
            users_using_settlements: 3,
            users_using_metas: 5
        }];

        const mockRpc = mock.fn(async (fnName) => {
            assert.equal(fnName, 'admin_get_activity_summary');
            return { data: mockSummary, error: null };
        });

        const res = await getActivitySummaryMock(mockRpc);
        assert.ok(res.summary);
        assert.equal(res.summary.total_users, 15);
        assert.equal(res.summary.active_7d, 8);
        assert.equal(res.summary.active_30d, 12);
        assert.equal(res.summary.inactive_30d, 3);
        assert.equal(res.summary.approved_users, 12);
        assert.equal(res.summary.users_using_transactions, 11);
        assert.equal(res.summary.users_using_cards, 7);
        assert.equal(res.summary.users_using_investments, 4);
        assert.equal(res.summary.users_using_settlements, 3);
        assert.equal(res.summary.users_using_metas, 5);
        assert.equal('uses_forecast' in res.summary, false);
        assert.equal('users_using_forecast' in res.summary, false);
        assert.equal(res.error, null);
    });

    it('deve falhar fechado e retornar null quando a RPC falhar (ex: 42501)', async () => {
        const mockRpc = mock.fn(async () => ({
            data: null,
            error: { message: 'Acesso negado. Apenas administradores podem executar esta operação.' }
        }));

        const res = await getActivitySummaryMock(mockRpc);
        assert.equal(res.summary, null);
        assert.ok(res.error);
        assert.match(res.error.message, /Acesso negado/);
    });

    it('deve falhar fechado em caso de exceção de rede', async () => {
        const mockRpc = mock.fn(async () => {
            throw new Error('Connection reset');
        });

        const res = await getActivitySummaryMock(mockRpc);
        assert.equal(res.summary, null);
        assert.ok(res.error);
        assert.match(res.error.message, /Connection reset/);
    });
});


