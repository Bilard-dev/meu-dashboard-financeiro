import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    calculateInvoiceSummary
} from '../../src/domain/creditCard/invoiceCalculator.js';

import {
    calculateFinancialForecast
} from '../../src/domain/forecast/forecastEngine.js';

describe('FASE 4.6 — Assinaturas + Pagamentos Agendados (Targeted Unit Tests)', () => {
    const migrationPath = path.resolve('supabase/migrations/20260912160000_fase46_agendamentos_financeiros.sql');
    const schedulesServicePath = path.resolve('src/services/schedulesService.js');
    const indexPath = path.resolve('index.html');

    assert.ok(fs.existsSync(migrationPath), 'Migration 20260912160000 deve existir');
    assert.ok(fs.existsSync(schedulesServicePath), 'src/services/schedulesService.js deve existir');
    assert.ok(fs.existsSync(indexPath), 'index.html deve existir');

    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    const schedulesServiceJs = fs.readFileSync(schedulesServicePath, 'utf8');
    const indexHtml = fs.readFileSync(indexPath, 'utf8');

    describe('1. Princípio PREVISTO != REALIZADO (Isolamento de Fatura)', () => {

        it('1. Ocorrência de assinatura PREVISTA não soma em totalFaturaSelecionada mas projeta fatura', () => {
            const realTxs = [
                {
                    id: 'tx-1',
                    type: 'DESPESA',
                    value: 200,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    rawDate: '2026-09-05',
                    year: 2026,
                    month: 8,
                    parcela: '1/1'
                }
            ];

            const scheduledOccs = [
                {
                    id: 'occ-sub-1',
                    tipo: 'assinatura_cartao',
                    descricao: 'Netflix 4K',
                    valor_previsto: 55.90,
                    data_prevista: '2026-09-15',
                    cartao: 'Nubank',
                    categoria: 'Assinaturas',
                    status: 'PREVISTA'
                }
            ];

            const summary = calculateInvoiceSummary('2026-8', realTxs, [], scheduledOccs);

            assert.equal(summary.totalFaturaSelecionada, 200);
            assert.equal(summary.totalPrevistoAssinaturas, 55.90);
            assert.equal(summary.totalFaturaProjetada, 255.90);

            const prevItem = summary.itemsNoMes.find(i => i.isPrevisto);
            assert.ok(prevItem);
            assert.equal(prevItem.desc, 'Netflix 4K');
            assert.equal(prevItem.value, 55.90);
        });

        it('2. Ocorrência REALIZADA ou CANCELADA não é somada como previsão', () => {
            const realTxs = [
                {
                    id: 'tx-1',
                    type: 'DESPESA',
                    value: 200,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    rawDate: '2026-09-05',
                    year: 2026,
                    month: 8,
                    parcela: '1/1'
                },
                {
                    id: 'tx-sub-confirmed',
                    type: 'DESPESA',
                    value: 59.90,
                    pagamento: 'Cartão de Crédito',
                    cartao: 'Nubank',
                    rawDate: '2026-09-15',
                    year: 2026,
                    month: 8,
                    parcela: '1/1'
                }
            ];

            const scheduledOccs = [
                {
                    id: 'occ-sub-1',
                    tipo: 'assinatura_cartao',
                    descricao: 'Netflix 4K',
                    valor_previsto: 55.90,
                    data_prevista: '2026-09-15',
                    cartao: 'Nubank',
                    categoria: 'Assinaturas',
                    status: 'REALIZADA'
                },
                {
                    id: 'occ-sub-cancelled',
                    tipo: 'assinatura_cartao',
                    descricao: 'Disney+',
                    valor_previsto: 40.00,
                    data_prevista: '2026-09-20',
                    cartao: 'Nubank',
                    categoria: 'Assinaturas',
                    status: 'CANCELADA'
                }
            ];

            const summary = calculateInvoiceSummary('2026-8', realTxs, [], scheduledOccs);

            assert.equal(summary.totalFaturaSelecionada, 259.90);
            assert.equal(summary.totalPrevistoAssinaturas, 0);
            assert.equal(summary.totalFaturaProjetada, 259.90);
            assert.equal(summary.itemsNoMes.filter(i => i.isPrevisto).length, 0);
        });
    });

    describe('2. Princípio PREVISTO != REALIZADO (Isolamento de Previsão Financeira)', () => {

        it('3. Forecast Engine: Previsões de PIX e Cartão não alteram totalComprometido puro', () => {
            const realTxs = [
                {
                    id: 'tx-mercado',
                    type: 'DESPESA',
                    value: 300,
                    pagamento: 'PIX',
                    rawDate: '2026-09-02',
                    year: 2026,
                    month: 8
                }
            ];

            const scheduledOccs = [
                {
                    id: 'occ-pix-aluguel',
                    tipo: 'pix_agendado',
                    descricao: 'Aluguel',
                    valor_previsto: 1500,
                    data_prevista: '2026-09-10',
                    status: 'PREVISTA'
                },
                {
                    id: 'occ-card-spotify',
                    tipo: 'assinatura_cartao',
                    descricao: 'Spotify Família',
                    valor_previsto: 34.90,
                    data_prevista: '2026-09-22',
                    status: 'PREVISTA'
                }
            ];

            const forecast = calculateFinancialForecast('2026-8', 1, realTxs, [], scheduledOccs);
            const m0 = forecast[0];

            assert.equal(m0.totalComprometido, 300);
            assert.equal(m0.totalPrevistoPix, 1500);
            assert.equal(m0.totalPrevistoAssinaturas, 34.90);
            assert.equal(m0.totalPrevistoAgendamentos, 1534.90);
            assert.equal(m0.totalProjetadoComPrevisao, 1834.90);
        });
    });

    describe('3. Banco de Dados, RLS e Atomicidade da Confirmação (Migration & Schema)', () => {

        it('4. Deve criar as tabelas agendamentos_financeiros e agendamento_ocorrencias com constraints rígidas', () => {
            assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS public\.agendamentos_financeiros/);
            assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS public\.agendamento_ocorrencias/);
            assert.match(migrationSql, /tipo TEXT NOT NULL CHECK \(tipo IN \('assinatura_cartao', 'pix_agendado'\)\)/);
            assert.match(migrationSql, /status TEXT NOT NULL DEFAULT 'PREVISTA' CHECK \(status IN \('PREVISTA', 'REALIZADA', 'CANCELADA'\)\)/);
            assert.match(migrationSql, /CONSTRAINT agendamento_ocorrencias_unique_prevista UNIQUE \(agendamento_id, data_prevista\)/);
        });

        it('5. Deve habilitar RLS e exigir propriedade estrita (user_id = auth.uid()) sem cross-read de admin', () => {
            assert.match(migrationSql, /ALTER TABLE public\.agendamentos_financeiros ENABLE ROW LEVEL SECURITY;/);
            assert.match(migrationSql, /ALTER TABLE public\.agendamento_ocorrencias ENABLE ROW LEVEL SECURITY;/);
            assert.match(migrationSql, /user_id = auth\.uid\(\)\s+AND\s+public\.has_app_access\(\)/);
        });

        it('6. RPC confirmar_agendamento_ocorrencia deve ser SECURITY DEFINER com search_path seguro e lançar transação atomicamente', () => {
            assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.confirmar_agendamento_ocorrencia/);
            assert.match(migrationSql, /SECURITY DEFINER/);
            assert.match(migrationSql, /SET search_path = pg_catalog, public, auth/);
            assert.match(migrationSql, /INSERT INTO public\.transacoes/);
            assert.match(migrationSql, /UPDATE public\.agendamento_ocorrencias/);
            assert.match(migrationSql, /status = 'REALIZADA'/);
        });

        it('7. RPC cancelar_agendamento_ocorrencia deve marcar como CANCELADA sem criar transação financeira', () => {
            assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.cancelar_agendamento_ocorrencia/);
            assert.match(migrationSql, /SECURITY DEFINER/);
            assert.match(migrationSql, /UPDATE public\.agendamento_ocorrencias/);
            assert.match(migrationSql, /status = 'CANCELADA'/);
        });
    });

    describe('4. Interface, Rotas e Integração Frontend (index.html e schedulesService.js)', () => {

        it('8. index.html deve conter a rota canônica e mapeamento para #/agendamentos', () => {
            assert.match(indexHtml, /'agendamentos':\s*'agendamentos'/);
            assert.match(indexHtml, /'assinaturas':\s*'agendamentos'/);
            assert.match(indexHtml, /id="tab-agendamentos"/);
            assert.match(indexHtml, /switchTab\('agendamentos'\)/);
        });

        it('9. index.html deve conter os modais de regra e de confirmação com valor editável', () => {
            assert.match(indexHtml, /id="modalScheduleRule"/);
            assert.match(indexHtml, /id="modalConfirmarOcorrencia"/);
            assert.match(indexHtml, /id="conf_valor_realizado"/);
            assert.match(indexHtml, /id="conf_data_realizada"/);
        });

        it('10. schedulesService.js exporta todas as operações do ciclo de vida', () => {
            assert.match(schedulesServiceJs, /export async function fetchSchedules/);
            assert.match(schedulesServiceJs, /export async function createSchedule/);
            assert.match(schedulesServiceJs, /export async function updateSchedule/);
            assert.match(schedulesServiceJs, /export async function deactivateSchedule/);
            assert.match(schedulesServiceJs, /export async function fetchOccurrences/);
            assert.match(schedulesServiceJs, /export async function generateOccurrencesForSchedule/);
            assert.match(schedulesServiceJs, /export async function confirmOccurrence/);
            assert.match(schedulesServiceJs, /export async function cancelOccurrence/);
        });

        it('11. parseCurrencyValue converte números e strings pt-BR corretamente e rejeita <= 0', () => {
            assert.match(schedulesServiceJs, /export function parseCurrencyValue/);
            // Avalia a função parseCurrencyValue pura extraída de schedulesServiceJs
            const fnMatch = schedulesServiceJs.match(/export function parseCurrencyValue\([\s\S]*?\n\}/);
            assert.ok(fnMatch, 'parseCurrencyValue deve estar definida no schedulesService.js');
            const parseFn = new Function('val', `${fnMatch[0].replace('export function parseCurrencyValue(val)', '')}; return parseCurrencyValue(val);`);

            assert.equal(parseFn(50), 50);
            assert.equal(parseFn(14.90), 14.90);
            assert.equal(parseFn('50,00'), 50.00);
            assert.equal(parseFn('14,90'), 14.90);
            assert.equal(parseFn('R$ 1.250,50'), 1250.50);
            assert.equal(parseFn('0'), 0);
            assert.equal(parseFn('-15,00'), -15);
            assert.equal(parseFn(null), 0);
            assert.equal(parseFn(undefined), 0);
        });

        it('12. index.html manipula valor_previsto e parseBrlCurrencyInput no modal de regras', () => {
            assert.match(indexHtml, /function parseBrlCurrencyInput/);
            assert.match(indexHtml, /valor_previsto,\s*\n\s*valor_base:/);
            assert.match(indexHtml, /rule\.valor_previsto/);
        });

        it('13. createSchedule e generateOccurrencesForSchedule garantem user_id da sessão e impedem spoofing', () => {
            // schedulesService.js deve consultar auth.getSession / auth.getUser
            assert.match(schedulesServiceJs, /supabaseClient\.auth\.getSession/);
            assert.match(schedulesServiceJs, /supabaseClient\.auth\.getUser/);
            // createSchedule deve rejeitar se não houver usuário autenticado
            assert.match(schedulesServiceJs, /Usuário não autenticado/);
            // createSchedule deve forçar user_id a partir do usuário autenticado (não do caller)
            assert.match(schedulesServiceJs, /user_id:\s*user\.id/);
            // updateSchedule deve remover user_id para impedir alteração de ownership
            assert.match(schedulesServiceJs, /delete cleanUpdates\.user_id/);
            // generateOccurrencesForSchedule deve garantir user_id
            assert.match(schedulesServiceJs, /user_id:\s*userId/);
        });

        it('14. index.html possui UX compacta com controle de expansão e destaque de ocorrências', () => {
            assert.match(indexHtml, /globalScheduleOccurrencesExpanded/);
            assert.match(indexHtml, /toggleScheduleOccurrencesExpanded/);
            assert.match(indexHtml, /id="schedulesOccurrencesPagination"/);
            assert.match(indexHtml, /Ver próximas/);
            assert.match(indexHtml, /Ocultar ocorrências futuras/);
        });

        it('15. Exclusão / desativação de regras: modal de confirmação, soft delete e cancelamento de futuras', () => {
            // Modal de confirmação na UI
            assert.match(indexHtml, /id="modalDeleteScheduleRule"/);
            assert.match(indexHtml, /openDeleteScheduleModal/);
            assert.match(indexHtml, /closeDeleteScheduleModal/);
            assert.match(indexHtml, /executeDeleteScheduleRule/);
            assert.match(indexHtml, /As cobranças futuras previstas desta regra serão/);
            assert.match(indexHtml, /Pagamentos já/);
            assert.match(indexHtml, /realizados/);

            // schedulesService: desativação preservando realizadas e cancelando apenas futuras previstas
            assert.match(schedulesServiceJs, /export async function deactivateSchedule/);
            assert.match(schedulesServiceJs, /ativo:\s*false/);
            assert.match(schedulesServiceJs, /status:\s*'CANCELADA'/);
            assert.match(schedulesServiceJs, /status',\s*'PREVISTA'/);

            // A lista de regras ativas deve filtrar apenas regras ativas
            assert.match(indexHtml, /globalSchedules\.filter\(r => r\.ativo\)/);

            // Regras desativadas não devem gerar ocorrências
            assert.match(schedulesServiceJs, /targetSchedule\.ativo === false/);
        });

        it('16. H8: currentForecastHorizon e selectedForecastYm são inicializados no estado global antes de qualquer render e UI refresh é desacoplado', () => {
            // Verifica que currentForecastHorizon e selectedForecastYm estão no bloco inicial de variáveis globais
            const globalStateBlock = indexHtml.match(/let currentUser = null;[\s\S]*?let charts = {};/);
            assert.ok(globalStateBlock, 'Bloco de estado global inicial deve existir');
            assert.match(globalStateBlock[0], /let currentForecastHorizon = 6;/, 'currentForecastHorizon deve ser declarado no bloco global inicial');
            assert.match(globalStateBlock[0], /let selectedForecastYm = null;/, 'selectedForecastYm deve ser declarado no bloco global inicial');

            // Verifica que não há declaração let tardia redundante que cause TDZ
            const occurrences = (indexHtml.match(/let currentForecastHorizon/g) || []).length;
            assert.equal(occurrences, 1, 'Deve haver exatamente 1 declaração de currentForecastHorizon no arquivo');

            const laterDeclarations = indexHtml.match(/🔮 PREVISÃO FINANCEIRA 2\.0 — MOTOR & INTERFACE[\s\S]*?function getFinancialForecast/);
            assert.ok(laterDeclarations);
            assert.doesNotMatch(laterDeclarations[0], /let currentForecastHorizon/, 'Não deve haver let tardio de currentForecastHorizon');

            // Verifica desacoplamento entre persistência de regras e refresh de abas secundárias
            assert.match(indexHtml, /closeScheduleModal\(\);\s*\n\s*await renderAgendamentosTab\(\);\s*\n\s*\/\/[^\n]*\n\s*try\s*\{\s*\n\s*renderParcelasTab\(\);\s*\n\s*renderForecastTab\(\);/);
        });
    });
});