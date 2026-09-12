/**
 * Serviço Administrativo e de Autorização — Fase 4.5-B / 4.5-B2 / 4.5-B3 / 4.5-B4 / 4.5-B5 / 4.5-C3
 * Wrappers puros e desacoplados de governança e permissões administrativas.
 * Mantém isolamento estrito em relação ao serviço de autenticação padrão (authService).
 */

import { supabaseClient } from './supabaseClient.js';

/**
 * Consulta se o usuário autenticado na sessão atual possui perfil de administrador.
 * Princípio da Falha Segura (Fail-Safe Defaults):
 * - Se não houver sessão ativa, retorna false.
 * - Em caso de erro de rede, permissão ou resposta indefinida, retorna false.
 * - Detalhes internos de exceção não são expostos a camadas inseguras.
 *
 * @returns {Promise<boolean>} Retorna true se for admin confirmado no banco, false caso contrário.
 */
export async function checkIsAdmin() {
    try {
        const { data, error } = await supabaseClient.rpc('is_admin');

        if (error) {
            console.warn('[adminService] Não foi possível verificar privilégios administrativos:', error.message);
            return false;
        }

        return Boolean(data);
    } catch (err) {
        console.warn('[adminService] Exceção ao consultar status administrativo. Acesso padrão seguro (false):', err);
        return false;
    }
}

/**
 * Consulta a função canônica has_app_access().
 * Retorna true se:
 * A) auth.uid() pertence a public.admin_users (is_admin())
 * OU
 * B) o perfil em public.user_profiles possui access_status = 'approved'.
 *
 * Falha fechado (retorna false) em caso de erro, deslogado ou perfil não aprovado.
 *
 * @returns {Promise<boolean>} Retorna true se tiver permissão de uso do app, false caso contrário.
 */
export async function checkHasAppAccess() {
    try {
        const { data, error } = await supabaseClient.rpc('has_app_access');

        if (error) {
            console.warn('[adminService] Não foi possível verificar has_app_access:', error.message);
            return false;
        }

        return Boolean(data);
    } catch (err) {
        console.warn('[adminService] Exceção ao consultar has_app_access. Falha segura (false):', err);
        return false;
    }
}

/**
 * Consulta o status de acesso e perfil do próprio usuário autenticado.
 * Princípio da Falha Segura (Fail-Safe Defaults):
 * - Permite descobrir SOMENTE o status da própria conta (via RLS: user_id = auth.uid()).
 * - Distingue com clareza:
 *   * 'unknown'        -> Sem sessão ativa / deslogado
 *   * 'needs_profile'  -> Usuário autenticado que ainda NÃO possui perfil em user_profiles (legado)
 *   * 'pending'        -> Cadastro realizado, aguardando aprovação do administrador
 *   * 'approved'       -> Acesso concedido
 *   * 'rejected'       -> Acesso rejeitado
 *   * 'suspended'      -> Acesso suspenso
 * - Em caso de erro de rede ou falha, retorna status 'pending' (bloqueado por padrão).
 *
 * @returns {Promise<{ isAdmin: boolean, hasAccess: boolean, status: string, profile: object | null, error: object | null }>}
 */
export async function getMyAccessStatus() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.user) {
            return { isAdmin: false, hasAccess: false, status: 'unknown', profile: null, error: new Error('Usuário não autenticado.') };
        }

        const isAdmin = await checkIsAdmin();

        const { data, error } = await supabaseClient
            .from('user_profiles')
            .select('user_id, display_name, access_status, created_at, approved_at')
            .eq('user_id', session.user.id)
            .maybeSingle();

        if (error) {
            console.warn('[adminService] Erro ao consultar perfil de acesso próprio:', error.message);
            return {
                isAdmin,
                hasAccess: isAdmin,
                status: isAdmin ? 'approved' : 'pending',
                profile: null,
                error
            };
        }

        if (!data) {
            // Conta legada autenticada que ainda não possui perfil cadastrado
            return {
                isAdmin,
                hasAccess: isAdmin,
                status: isAdmin ? 'approved' : 'needs_profile',
                profile: null,
                error: null
            };
        }

        const isApproved = data.access_status === 'approved';
        const hasAccess = isAdmin || isApproved;

        return {
            isAdmin,
            hasAccess,
            status: data.access_status || 'pending',
            profile: data,
            error: null
        };
    } catch (err) {
        console.warn('[adminService] Exceção ao consultar status de acesso próprio. Acesso padrão seguro (pending):', err);
        return { isAdmin: false, hasAccess: false, status: 'pending', profile: null, error: err };
    }
}

/**
 * Permite que um usuário legado autenticado (sem perfil) preencha seu nome para identificação.
 * Invoca a Stored Procedure restrita 'complete_legacy_profile'.
 *
 * Requisitos e Segurança:
 * - Não aceita user_id, access_status ou roles como argumentos (o banco extrai auth.uid() e define status='pending').
 * - Valida localmente o tamanho antes do envio (2 a 80 caracteres após trim).
 * - Falha fechado: retorna false em qualquer erro de rede ou validação.
 *
 * @param {string} displayName - Nome para identificação do usuário
 * @returns {Promise<{ success: boolean, error: object | null }>}
 */
export async function completeLegacyProfile(displayName) {
    const cleanName = String(displayName || '').trim();

    if (cleanName.length < 2) {
        return { success: false, error: new Error('O nome para identificação do usuário é obrigatório e deve ter no mínimo 2 caracteres.') };
    }

    if (cleanName.length > 80) {
        return { success: false, error: new Error('O nome para identificação do usuário deve ter no máximo 80 caracteres.') };
    }

    try {
        const { data, error } = await supabaseClient.rpc('complete_legacy_profile', {
            p_display_name: cleanName
        });

        if (error) {
            console.warn('[adminService] Erro ao completar cadastro legado:', error.message);
            return { success: false, error };
        }

        return { success: Boolean(data), error: null };
    } catch (err) {
        console.warn('[adminService] Exceção ao completar cadastro legado:', err);
        return { success: false, error: err };
    }
}

/**
 * Lista usuários para a Central Administrativa com projeção restrita.
 * Invoca a RPC restrita 'admin_list_users'.
 *
 * @param {Object} [options={}]
 * @param {string|null} [options.search=null] - Termo de busca (nome ou email)
 * @param {string|null} [options.status=null] - Filtro de status ('approved', 'pending', 'rejected', 'suspended', 'needs_profile')
 * @param {number} [options.limit=50] - Limite de registros por página (1 a 100)
 * @param {number} [options.offset=0] - Deslocamento para paginação
 * @returns {Promise<{ users: Array, error: object | null }>}
 */
export async function listAdminUsers({ search = null, status = null, limit = 50, offset = 0 } = {}) {
    const cleanStatus = status ? String(status).trim().toLowerCase() : null;
    const validStatuses = ['needs_profile', 'pending', 'approved', 'rejected', 'suspended'];

    if (cleanStatus && !validStatuses.includes(cleanStatus)) {
        return {
            users: [],
            error: new Error(`Status de filtro inválido (${cleanStatus}). Valores permitidos: ${validStatuses.join(', ')}.`)
        };
    }

    try {
        const { data, error } = await supabaseClient.rpc('admin_list_users', {
            p_search: search ? String(search).trim() : null,
            p_status: cleanStatus,
            p_limit: Number.isInteger(limit) ? limit : 50,
            p_offset: Number.isInteger(offset) ? offset : 0
        });

        if (error) {
            console.warn('[adminService] Erro ao listar usuários administrativos:', error.message);
            return { users: [], error };
        }

        return { users: Array.isArray(data) ? data : [], error: null };
    } catch (err) {
        console.warn('[adminService] Exceção ao listar usuários administrativos:', err);
        return { users: [], error: err };
    }
}

/**
 * Altera o status de acesso de um usuário (aprovado, rejeitado, suspenso).
 * Invoca a RPC restrita 'admin_set_user_access'.
 *
 * @param {string} userId - UUID do usuário alvo
 * @param {'approved' | 'rejected' | 'suspended'} newStatus - Novo status de acesso
 * @returns {Promise<{ success: boolean, error: object | null }>}
 */
export async function setUserAccess(userId, newStatus) {
    if (!userId) {
        return { success: false, error: new Error('O identificador do usuário é obrigatório.') };
    }

    const cleanStatus = String(newStatus || '').trim().toLowerCase();
    const validStatuses = ['approved', 'rejected', 'suspended'];

    if (!validStatuses.includes(cleanStatus)) {
        return {
            success: false,
            error: new Error(`Status inválido. Valores aceitos: ${validStatuses.join(', ')}.`)
        };
    }

    try {
        const { data, error } = await supabaseClient.rpc('admin_set_user_access', {
            p_user_id: userId,
            p_new_status: cleanStatus
        });

        if (error) {
            console.warn('[adminService] Erro ao alterar acesso do usuário:', error.message);
            return { success: false, error };
        }

        return { success: Boolean(data), error: null };
    } catch (err) {
        console.warn('[adminService] Exceção ao alterar acesso do usuário:', err);
        return { success: false, error: err };
    }
}

/**
 * Obtém métricas agregadas de atividade e engajamento técnico por usuário.
 * Invoca a RPC restrita 'admin_get_activity_metrics'.
 *
 * Princípio da Privacidade e Falha Segura:
 * - Retorna apenas contagens em faixas ('0', '1-5', '6-20', '20+'), timestamps e flags de recursos.
 * - Não expõe valores financeiros, transações ou saldos.
 * - Falha fechado: em caso de erro, retorna array vazio e o objeto de erro.
 *
 * @returns {Promise<{ metrics: Array, error: object | null }>}
 */
export async function getActivityMetrics() {
    try {
        const { data, error } = await supabaseClient.rpc('admin_get_activity_metrics');

        if (error) {
            console.warn('[adminService] Erro ao obter métricas de atividade:', error.message);
            return { metrics: [], error };
        }

        return { metrics: Array.isArray(data) ? data : [], error: null };
    } catch (err) {
        console.warn('[adminService] Exceção ao obter métricas de atividade:', err);
        return { metrics: [], error: err };
    }
}

/**
 * Obtém resumo global de atividade, engajamento e recursos do sistema.
 * Invoca a RPC restrita 'admin_get_activity_summary'.
 *
 * Princípio da Falha Segura:
 * - Retorna métricas globais agregadas.
 * - Em caso de erro, retorna summary nulo e o objeto de erro.
 *
 * @returns {Promise<{ summary: object | null, error: object | null }>}
 */
export async function getActivitySummary() {
    try {
        const { data, error } = await supabaseClient.rpc('admin_get_activity_summary');

        if (error) {
            console.warn('[adminService] Erro ao obter resumo global de atividade:', error.message);
            return { summary: null, error };
        }

        const summaryResult = Array.isArray(data) ? (data[0] || null) : (data || null);
        return { summary: summaryResult, error: null };
    } catch (err) {
        console.warn('[adminService] Exceção ao obter resumo global de atividade:', err);
        return { summary: null, error: err };
    }
}

/**
 * Executa o reset transitório dos dados financeiros de um usuário (Fase 4.5-C5-B).
 * Gera um snapshot completo em user_data_resets recuperável por até 48 horas e zera as 7 tabelas ativas.
 *
 * Princípio da Privacidade e Segurança:
 * - Apenas administradores confirmados.
 * - Auto-reset e reset de outros administradores são sumariamente rejeitados.
 * - Nunca retorna dados financeiros ou o snapshot; apenas confirmação de protocolo (resetId, timestamps).
 *
 * @param {string} targetUserId UUID do usuário alvo
 * @returns {Promise<{ success: boolean, resetId: string | null, createdAt: string | null, expiresAt: string | null, error: object | null }>}
 */
export async function resetUserData(targetUserId) {
    if (!targetUserId || typeof targetUserId !== 'string') {
        return {
            success: false,
            resetId: null,
            createdAt: null,
            expiresAt: null,
            error: new Error('ID do usuário alvo é obrigatório.')
        };
    }

    try {
        const { data, error } = await supabaseClient.rpc('admin_reset_user_data', {
            p_target_user_id: targetUserId
        });

        if (error) {
            console.warn('[adminService] Erro ao executar reset de dados do usuário:', error.message);
            return {
                success: false,
                resetId: null,
                createdAt: null,
                expiresAt: null,
                error
            };
        }

        const row = Array.isArray(data) ? data[0] : data;
        return {
            success: Boolean(row?.reset_id),
            resetId: row?.reset_id || null,
            createdAt: row?.created_at || null,
            expiresAt: row?.expires_at || null,
            error: null
        };
    } catch (err) {
        console.warn('[adminService] Exceção ao executar reset de dados do usuário:', err);
        return {
            success: false,
            resetId: null,
            createdAt: null,
            expiresAt: null,
            error: err
        };
    }
}

/**
 * Restaura integralmente o snapshot JSONB dos dados financeiros de um usuário (Fase 4.5-C5-B).
 * Fail-closed: se o usuário criou quaisquer novos dados após o reset, a operação é abortada.
 *
 * @param {string} targetUserId UUID do usuário alvo
 * @param {string} resetId UUID do registro de reset ativo
 * @returns {Promise<{ success: boolean, error: object | null }>}
 */
export async function restoreUserData(targetUserId, resetId) {
    if (!targetUserId || !resetId) {
        return {
            success: false,
            error: new Error('targetUserId e resetId são obrigatórios para restauração.')
        };
    }

    try {
        const { data, error } = await supabaseClient.rpc('admin_restore_user_data', {
            p_target_user_id: targetUserId,
            p_reset_id: resetId
        });

        if (error) {
            console.warn('[adminService] Erro ao restaurar dados do usuário:', error.message);
            return { success: false, error };
        }

        return { success: Boolean(data), error: null };
    } catch (err) {
        console.warn('[adminService] Exceção ao restaurar dados do usuário:', err);
        return { success: false, error: err };
    }
}

/**
 * Consulta o status de reset de um usuário (se possui snapshot ativo e se é recuperável).
 * Não expõe dados financeiros.
 *
 * @param {string} targetUserId UUID do usuário alvo
 * @returns {Promise<{ hasActiveReset: boolean, resetId: string | null, createdAt: string | null, expiresAt: string | null, isRecoverable: boolean, error: object | null }>}
 */
export async function getUserResetStatus(targetUserId) {
    if (!targetUserId || typeof targetUserId !== 'string') {
        return {
            hasActiveReset: false,
            resetId: null,
            createdAt: null,
            expiresAt: null,
            isRecoverable: false,
            error: new Error('ID do usuário alvo é obrigatório.')
        };
    }

    try {
        const { data, error } = await supabaseClient.rpc('admin_get_user_reset_status', {
            p_target_user_id: targetUserId
        });

        if (error) {
            console.warn('[adminService] Erro ao consultar status de reset:', error.message);
            return {
                hasActiveReset: false,
                resetId: null,
                createdAt: null,
                expiresAt: null,
                isRecoverable: false,
                error
            };
        }

        const row = Array.isArray(data) ? (data[0] || {}) : (data || {});
        return {
            hasActiveReset: Boolean(row.has_active_reset),
            resetId: row.reset_id || null,
            createdAt: row.created_at || null,
            expiresAt: row.expires_at || null,
            isRecoverable: Boolean(row.is_recoverable),
            error: null
        };
    } catch (err) {
        console.warn('[adminService] Exceção ao consultar status de reset:', err);
        return {
            hasActiveReset: false,
            resetId: null,
            createdAt: null,
            expiresAt: null,
            isRecoverable: false,
            error: err
        };
    }
}

/**
 * Rotina administrativa interna de manutenção para purge de snapshots expirados (> 48h).
 *
 * REGRA DE ARQUITETURA E UX (Fase 4.5-C5-B.1):
 * - NÃO VINCULAR A BOTÕES OU AÇÕES MANUAIS DE USUÁRIO NA UI.
 * - A eliminação de snapshots expirados ocorre automaticamente no backend
 *   durante consultas de status (getUserResetStatus).
 * - Esta função é mantida no service exclusivamente para testes e tarefas de
 *   manutenção interna programada.
 *
 * @returns {Promise<{ purgedCount: number, error: object | null }>}
 */
export async function purgeExpiredResets() {
    try {
        const { data, error } = await supabaseClient.rpc('admin_purge_expired_user_resets');

        if (error) {
            console.warn('[adminService] Erro ao purgar resets expirados:', error.message);
            return { purgedCount: 0, error };
        }

        return { purgedCount: Number(data) || 0, error: null };
    } catch (err) {
        console.warn('[adminService] Exceção ao purgar resets expirados:', err);
        return { purgedCount: 0, error: err };
    }
}

/**
 * Dispara solicitação de redefinição de senha para um usuário gerenciado (Fase 4.5-C5-C).
 * Envia e-mail oficial de redefinição via Supabase Auth resetPasswordForEmail e registra auditoria.
 *
 * Princípio da Privacidade & Menor Privilégio:
 * - O administrador nunca conhece a senha atual do usuário.
 * - O administrador nunca define diretamente a nova senha.
 * - O administrador nunca tem acesso ao token/link gerado.
 * - O e-mail de destino é somente leitura (não editável).
 * - Proteção estrita contra rate limit (429) com indicação do tempo de espera.
 *
 * @param {string} targetEmail E-mail do usuário alvo
 * @param {string} targetUserId UUID do usuário alvo
 * @returns {Promise<{ success: boolean, rateLimited: boolean, retryAfterSeconds: number | null, error: object | null }>}
 */
export async function requestUserPasswordReset(targetEmail, targetUserId) {
    const cleanEmail = String(targetEmail || '').trim().toLowerCase();
    const cleanUserId = String(targetUserId || '').trim();

    if (!cleanEmail || !cleanUserId) {
        return {
            success: false,
            rateLimited: false,
            retryAfterSeconds: null,
            error: new Error('E-mail e identificador do usuário são obrigatórios para redefinição de senha.')
        };
    }

    try {
        // 1. Validação prévia de autorização e registro em log de auditoria via RPC administrativa segura
        // Executa ANTES do envio de e-mail para validar autorização do admin,
        // validar se o usuário existe em auth.users e impedir auto-reset ou reset de administradores.
        const { error: auditErr } = await supabaseClient.rpc('admin_log_password_reset_request', {
            p_target_user_id: cleanUserId
        });

        if (auditErr) {
            console.warn('[adminService] Validação ou auditoria da redefinição rejeitada pelo banco:', auditErr.message);
            return {
                success: false,
                rateLimited: false,
                retryAfterSeconds: null,
                error: auditErr
            };
        }

        // 2. Dispara o envio oficial de e-mail de recuperação pelo Supabase Auth
        // Utiliza origem e pathname canônicos limpos (sem fragmento/hash anexado aqui),
        // pois o servidor de autenticação do Supabase anexa automaticamente seus tokens no fragmento:
        // #access_token=...&type=recovery&refresh_token=...
        let redirectUrl = '';
        if (typeof window !== 'undefined' && window.location) {
            redirectUrl = `${window.location.origin}${window.location.pathname}`;
        }

        const { error: authError } = await supabaseClient.auth.resetPasswordForEmail(cleanEmail, {
            redirectTo: redirectUrl || undefined
        });

        if (authError) {
            // Detecção robusta de Rate Limiting (código HTTP 429 ou mensagens com "rate limit" / "security purposes")
            const msg = (authError.message || '').toLowerCase();
            const isRateLimit = authError.status === 429 ||
                msg.includes('rate limit') ||
                msg.includes('security purposes') ||
                msg.includes('too many requests');

            // Extrai segundos recomendados de espera, se informados na mensagem
            let retryAfterSeconds = null;
            const secondsMatch = msg.match(/after\s+(\d+)\s+seconds/i);
            if (secondsMatch && secondsMatch[1]) {
                retryAfterSeconds = parseInt(secondsMatch[1], 10);
            }

            return {
                success: false,
                rateLimited: isRateLimit,
                retryAfterSeconds,
                error: authError
            };
        }

        return {
            success: true,
            rateLimited: false,
            retryAfterSeconds: null,
            error: null
        };
    } catch (err) {
        console.warn('[adminService] Exceção ao solicitar redefinição de senha de usuário:', err);
        return {
            success: false,
            rateLimited: false,
            retryAfterSeconds: null,
            error: err
        };
    }
}

/**
 * Exclui permanentemente e de forma irreversível a conta e todos os dados de um usuário (Fase 4.5-C5-E.1).
 * Invoca a Edge Function dedicada 'admin-delete-user' que realiza:
 * 1. Validação rigorosa de sessão do administrador chamador (JWT);
 * 2. Bloqueio estrito de auto-exclusão e de exclusão de contas administrativas;
 * 3. Validação segura e captura de identidade mínima via RPC admin_prepare_user_deletion (sem apagar dados);
 * 4. Operação canônica primária: auth.admin.deleteUser (aciona os ON DELETE CASCADE relacionais no PostgreSQL);
 * 5. Gravação pós-sucesso da trilha perene de auditoria (USER_ACCOUNT_DELETED) em admin_audit_logs.
 *
 * @param {string} targetUserId UUID do usuário alvo a ser excluído permanentemente
 * @returns {Promise<{ success: boolean, auditWarning: string | null, error: object | null }>}
 */
export async function deleteUserAccount(targetUserId) {
    const cleanUserId = String(targetUserId || '').trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!cleanUserId || !uuidRegex.test(cleanUserId)) {
        return {
            success: false,
            auditWarning: null,
            error: new Error('Identificador de usuário inválido ou ausente para exclusão permanente.')
        };
    }

    try {
        const { data, error } = await supabaseClient.functions.invoke('admin-delete-user', {
            body: { target_user_id: cleanUserId }
        });

        if (error) {
            console.warn('[adminService] Erro ao invocar Edge Function admin-delete-user:', error.message);
            let customMsg = error.message;
            if (data?.error) {
                customMsg = data.error;
            }
            return {
                success: false,
                auditWarning: null,
                error: new Error(customMsg)
            };
        }

        if (data?.error) {
            console.warn('[adminService] Falha retornada pela Edge Function admin-delete-user:', data.error);
            return {
                success: false,
                auditWarning: null,
                error: new Error(data.error)
            };
        }

        if (data?.audit_warning) {
            console.warn('[adminService] Aviso na auditoria pós-exclusão:', data.audit_warning);
        }

        return {
            success: true,
            auditWarning: data?.audit_warning || null,
            error: null
        };
    } catch (err) {
        console.error('[adminService] Exceção ao executar deleteUserAccount:', err);
        return {
            success: false,
            auditWarning: null,
            error: err instanceof Error ? err : new Error(String(err))
        };
    }
}



