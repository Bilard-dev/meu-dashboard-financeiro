/**
 * Serviço de Assinaturas e Pagamentos Agendados — Fase 4.6
 * Gerencia regras persistentes e ocorrências previstas (PREVISTO ≠ REALIZADO).
 */

import { supabaseClient } from './supabaseClient.js';

/**
 * Lista todas as regras de agendamentos do usuário autenticado.
 * @returns {Promise<{ data: Array<object>, error: object | null }>}
 */
export async function fetchSchedules() {
    try {
        const { data, error } = await supabaseClient
            .from('agendamentos_financeiros')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (err) {
        console.error('[schedulesService] Erro ao buscar agendamentos:', err);
        return { data: [], error: err };
    }
}

/**
 * Converte valor numérico ou string em moeda brasileira/decimal para Number seguro.
 * @param {string|number} val
 * @returns {number}
 */
export function parseCurrencyValue(val) {
    if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
    if (!val) return 0;
    const cleaned = String(val).trim().replace(/[R$\s]/g, '');
    if (cleaned.includes(',') && cleaned.includes('.')) {
        return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
    }
    if (cleaned.includes(',')) {
        return parseFloat(cleaned.replace(',', '.')) || 0;
    }
    return parseFloat(cleaned) || 0;
}

/**
 * Cria uma nova regra de agendamento financeiro e gera suas ocorrências iniciais.
 * @param {object} schedulePayload
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export async function createSchedule(schedulePayload) {
    try {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        let user = sessionData?.session?.user;
        if (!user) {
            const { data: userData } = await supabaseClient.auth.getUser();
            user = userData?.user;
        }

        if (!user || !user.id) {
            throw new Error('Usuário não autenticado.');
        }

        const rawValor = schedulePayload.valor_previsto !== undefined ? schedulePayload.valor_previsto : schedulePayload.valor_base;
        const valorParsed = parseCurrencyValue(rawValor);

        const cleanPayload = {
            user_id: user.id,
            tipo: schedulePayload.tipo,
            descricao: String(schedulePayload.descricao || '').trim(),
            valor_previsto: valorParsed,
            categoria: String(schedulePayload.categoria || '').trim(),
            subcategoria: schedulePayload.subcategoria ? String(schedulePayload.subcategoria).trim() : null,
            cartao: schedulePayload.tipo === 'assinatura_cartao' ? String(schedulePayload.cartao || '').trim() : null,
            dia_vencimento: schedulePayload.dia_vencimento ? Number(schedulePayload.dia_vencimento) : null,
            data_inicio: schedulePayload.data_inicio || new Date().toISOString().split('T')[0],
            recorrencia: schedulePayload.recorrencia || 'mensal',
            ativo: schedulePayload.ativo !== false
        };

        if (!cleanPayload.descricao || cleanPayload.descricao.length < 2) {
            throw new Error('A descrição deve conter no mínimo 2 caracteres.');
        }

        if (!cleanPayload.valor_previsto || cleanPayload.valor_previsto <= 0) {
            throw new Error('O valor previsto deve ser maior que zero.');
        }

        if (!cleanPayload.data_inicio) {
            throw new Error('A data de início é obrigatória.');
        }

        if (cleanPayload.tipo === 'assinatura_cartao' && !cleanPayload.cartao) {
            throw new Error('Para assinaturas no cartão, o cartão deve ser informado.');
        }

        const { data, error } = await supabaseClient
            .from('agendamentos_financeiros')
            .insert(cleanPayload)
            .select()
            .single();

        if (error) throw error;

        // Gera ocorrências para o horizonte padrão (12 meses para mensal, 1 para única)
        await generateOccurrencesForSchedule(data, cleanPayload.recorrencia === 'unica' ? 1 : 12);

        return { data, error: null };
    } catch (err) {
        console.error('[schedulesService] Erro ao criar agendamento:', err);
        return { data: null, error: err };
    }
}

/**
 * Atualiza uma regra de agendamento existente.
 * Ocorrências já REALIZADAS permanecem 100% inalteradas.
 * @param {string} scheduleId
 * @param {object} updates
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export async function updateSchedule(scheduleId, updates) {
    try {
        const cleanUpdates = { ...updates, updated_at: new Date().toISOString() };
        delete cleanUpdates.id;
        delete cleanUpdates.user_id;
        delete cleanUpdates.created_at;

        const rawValor = cleanUpdates.valor_previsto !== undefined ? cleanUpdates.valor_previsto : cleanUpdates.valor_base;
        if (rawValor !== undefined) {
            cleanUpdates.valor_previsto = parseCurrencyValue(rawValor);
            delete cleanUpdates.valor_base;
        }

        const { data, error } = await supabaseClient
            .from('agendamentos_financeiros')
            .update(cleanUpdates)
            .eq('id', scheduleId)
            .select()
            .single();

        if (error) throw error;

        // Se o valor previsto mudou, atualiza apenas as ocorrências futuras ainda no status PREVISTA
        if (cleanUpdates.valor_previsto && Number(cleanUpdates.valor_previsto) > 0) {
            await supabaseClient
                .from('agendamento_ocorrencias')
                .update({
                    valor_previsto: Number(cleanUpdates.valor_previsto),
                    updated_at: new Date().toISOString()
                })
                .eq('agendamento_id', scheduleId)
                .eq('status', 'PREVISTA');
        }

        return { data, error: null };
    } catch (err) {
        console.error('[schedulesService] Erro ao atualizar agendamento:', err);
        return { data: null, error: err };
    }
}

/**
 * Desativa uma regra de agendamento (soft delete/desativação).
 * Ocorrências históricas são preservadas. Ocorrências futuras PREVISTAS são canceladas.
 * @param {string} scheduleId
 * @returns {Promise<{ success: boolean, error: object | null }>}
 */
export async function deactivateSchedule(scheduleId) {
    try {
        const { error: updateError } = await supabaseClient
            .from('agendamentos_financeiros')
            .update({ ativo: false, updated_at: new Date().toISOString() })
            .eq('id', scheduleId);

        if (updateError) throw updateError;

        // Cancela ocorrências futuras que ainda estavam previstas
        const todayStr = new Date().toISOString().split('T')[0];
        await supabaseClient
            .from('agendamento_ocorrencias')
            .update({ status: 'CANCELADA', updated_at: new Date().toISOString() })
            .eq('agendamento_id', scheduleId)
            .eq('status', 'PREVISTA')
            .gte('data_prevista', todayStr);

        return { success: true, error: null };
    } catch (err) {
        console.error('[schedulesService] Erro ao desativar agendamento:', err);
        return { success: false, error: err };
    }
}

/**
 * Busca ocorrências de agendamento filtradas por intervalo e/ou status.
 * @param {object} [filters={}]
 * @returns {Promise<{ data: Array<object>, error: object | null }>}
 */
export async function fetchOccurrences(filters = {}) {
    try {
        let query = supabaseClient
            .from('agendamento_ocorrencias')
            .select(`
                *,
                agendamento:agendamentos_financeiros (
                    tipo,
                    descricao,
                    categoria,
                    subcategoria,
                    cartao,
                    ativo
                )
            `)
            .order('data_prevista', { ascending: true });

        if (filters.startDate) {
            query = query.gte('data_prevista', filters.startDate);
        }
        if (filters.endDate) {
            query = query.lte('data_prevista', filters.endDate);
        }
        if (filters.status) {
            query = query.eq('status', filters.status);
        }
        if (filters.agendamentoId) {
            query = query.eq('agendamento_id', filters.agendamentoId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return { data: data || [], error: null };
    } catch (err) {
        console.error('[schedulesService] Erro ao buscar ocorrências:', err);
        return { data: [], error: err };
    }
}

/**
 * Gera ocorrências futuras de forma idempotente para uma regra (sem criar duplicatas).
 * @param {object} schedule
 * @param {number} [horizonMonths=12]
 * @returns {Promise<{ generated: number, error: object | null }>}
 */
export async function generateOccurrencesForSchedule(schedule, horizonMonths = 12) {
    if (!schedule) {
        return { generated: 0, error: null };
    }

    let targetSchedule = schedule;
    if (typeof schedule === 'string') {
        const { data, error } = await supabaseClient
            .from('agendamentos_financeiros')
            .select('*')
            .eq('id', schedule)
            .single();
        if (error || !data) {
            return { generated: 0, error: error || new Error('Agendamento não encontrado.') };
        }
        targetSchedule = data;
    }

    if (!targetSchedule.id || targetSchedule.ativo === false) {
        return { generated: 0, error: null };
    }

    try {
        let userId = targetSchedule.user_id;
        if (!userId) {
            const { data: sessionData } = await supabaseClient.auth.getSession();
            userId = sessionData?.session?.user?.id;
            if (!userId) {
                const { data: userData } = await supabaseClient.auth.getUser();
                userId = userData?.user?.id;
            }
        }

        if (!userId) {
            throw new Error('Usuário não autenticado para gerar ocorrências.');
        }

        const startDate = new Date(targetSchedule.data_inicio + 'T12:00:00');
        const count = targetSchedule.recorrencia === 'unica' ? 1 : Math.max(1, horizonMonths);
        const dayOfMonth = targetSchedule.dia_vencimento || startDate.getDate();

        const occurrencesToInsert = [];

        for (let i = 0; i < count; i++) {
            const occurrenceDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
            // Ajusta o dia para não estourar o mês (ex: dia 31 em fevereiro)
            const maxDaysInMonth = new Date(occurrenceDate.getFullYear(), occurrenceDate.getMonth() + 1, 0).getDate();
            const targetDay = Math.min(dayOfMonth, maxDaysInMonth);
            occurrenceDate.setDate(targetDay);

            const yyyy = occurrenceDate.getFullYear();
            const mm = String(occurrenceDate.getMonth() + 1).padStart(2, '0');
            const dd = String(occurrenceDate.getDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;

            occurrencesToInsert.push({
                user_id: userId,
                agendamento_id: targetSchedule.id,
                data_prevista: dateStr,
                valor_previsto: targetSchedule.valor_previsto,
                status: 'PREVISTA'
            });
        }

        // Inserção com ignorar conflito (idempotente)
        const { data, error } = await supabaseClient
            .from('agendamento_ocorrencias')
            .upsert(occurrencesToInsert, {
                onConflict: 'agendamento_id, data_prevista',
                ignoreDuplicates: true
            })
            .select();

        if (error) throw error;
        return { generated: data?.length || 0, error: null };
    } catch (err) {
        console.error('[schedulesService] Erro ao gerar ocorrências:', err);
        return { generated: 0, error: err };
    }
}

/**
 * Confirma uma ocorrência prevista, transformando-a em transação real atômica.
 * O valor realizado pode ser diferente do valor previsto.
 * @param {string} occurrenceId
 * @param {number} valorRealizado
 * @param {string|null} [dataRealizada=null]
 * @returns {Promise<{ success: boolean, data: object | null, error: object | null }>}
 */
export async function confirmOccurrence(occurrenceId, valorRealizado, dataRealizada = null) {
    try {
        const val = Number(valorRealizado);
        if (isNaN(val) || val <= 0) {
            throw new Error('O valor efetivamente pago/cobrado deve ser maior que zero.');
        }

        const { data, error } = await supabaseClient.rpc('confirmar_agendamento_ocorrencia', {
            p_ocorrencia_id: occurrenceId,
            p_valor_realizado: val,
            p_data_realizada: dataRealizada || null
        });

        if (error) throw error;
        return { success: true, data, error: null };
    } catch (err) {
        console.error('[schedulesService] Erro ao confirmar ocorrência:', err);
        return { success: false, data: null, error: err };
    }
}

/**
 * Cancela uma ocorrência prevista futura de forma controlada sem apagar histórico.
 * @param {string} occurrenceId
 * @returns {Promise<{ success: boolean, error: object | null }>}
 */
export async function cancelOccurrence(occurrenceId) {
    try {
        const { data, error } = await supabaseClient.rpc('cancelar_agendamento_ocorrencia', {
            p_ocorrencia_id: occurrenceId
        });

        if (error) throw error;
        return { success: true, error: null };
    } catch (err) {
        console.error('[schedulesService] Erro ao cancelar ocorrência:', err);
        return { success: false, error: err };
    }
}
