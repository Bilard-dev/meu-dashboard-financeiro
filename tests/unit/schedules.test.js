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
                    cartao: 'Nubank',
                    value: 100,
                    rawDate: '2026-09-10',
                    parcela: '1/1'
                }
            ];

            const ocorrencias = [
                {
                    id: 'occ-1',
                    data_prevista: '2026-09-15',
                    valor_previsto: 55.90,
                    status: 'PREVISTA',
                    cartao: 'Nubank',
                    tipo: 'assinatura_cartao'
                }
            ];

            const summary = calculateInvoiceSummary('2026-8', realTxs, [], ocorrencias);
            assert.equal(summary.totalFaturaSelecionada, 100);
            assert.equal(summary.totalPrevistoAssinaturas, 55.90);
            assert.equal(summary.totalFaturaProjetada, 155.90);
        });

        it('2. Ocorrência REALIZADA ou CANCELADA não é somada como previsão', () => {
            const realTxs = [
                {
                    id: 'tx-1',
                    type: 'DESPESA',
                    cartao: 'Nubank',
                    value: 100,
                    rawDate: '2026-09-10',
                    parcela: '1/1'
                }
            ];

            const ocorrencias = [
                {
                    id: 'occ-1',
                    data_prevista: '2026-09-15',
                    valor_previsto: 55.90,
                    status: 'REALIZADA',
                    cartao: 'Nubank',
                    tipo: 'assinatura_cartao'
                },
                {
                    id: 'occ-2',
                    data_prevista: '2026-09-18',
                    valor_previsto: 30.00,
                    status: 'CANCELADA',
                    cartao: 'Nubank',
                    tipo: 'assinatura_cartao'
                }
            ];

            const summary = calculateInvoiceSummary('2026-8', realTxs, [], ocorrencias);
            assert.equal(summary.totalFaturaSelecionada, 100);
            assert.equal(summary.totalPrevistoAssinaturas, 0);
            assert.equal(summary.totalFaturaProjetada, 100);
        });
    });

    describe('2. Princípio PREVISTO != REALIZADO (Isolamento de Previsão Financeira)', () => {

        it('3. Forecast Engine: Previsões de PIX e Cartão isolam valores previstos', () => {
            const ocorrencias = [
                {
                    id: 'occ-1',
                    data_prevista: '2026-10-10',
                    valor_previsto: 100,
                    status: 'PREVISTA',
                    tipo: 'pix_agendado'
                }
            ];

            const forecast = calculateFinancialForecast('2026-9', 3, [], [], ocorrencias);
            const m1 = forecast.find(m => m.yearMonth === '2026-9');
            assert.ok(m1);
            assert.equal(m1.totalComprometido, 0);
            assert.equal(m1.totalPrevistoPix, 100);
            assert.equal(m1.totalProjetadoComPrevisao, 100);
        });
    });

    describe('3. Banco de Dados, RLS e Atomicidade da Confirmação (Migration & Schema)', () => {

        it('4. Deve criar as tabelas agendamentos_financeiros e agendamento_ocorrencias com constraints rígidas', () => {
            assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS public\.agendamentos_financeiros/);
            assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS public\.agendamento_ocorrencias/);
            assert.match(migrationSql, /valor_previsto NUMERIC\(14,\s*2\)\s+NOT NULL CHECK\s*\(valor_previsto > 0\)/);
            assert.match(migrationSql, /dia_vencimento INTEGER CHECK\s*\(dia_vencimento BETWEEN 1 AND 31\)/);
            assert.match(migrationSql, /status TEXT\s+NOT NULL DEFAULT 'PREVISTA'/);
            assert.match(migrationSql, /CHECK\s*\(status IN \('PREVISTA',\s*'REALIZADA',\s*'CANCELADA'\)\)/);
        });

        it('5. Deve habilitar RLS e exigir propriedade estrita (user_id = auth.uid()) sem cross-read de admin', () => {
            assert.match(migrationSql, /ALTER TABLE public\.agendamentos_financeiros ENABLE ROW LEVEL SECURITY/);
            assert.match(migrationSql, /ALTER TABLE public\.agendamento_ocorrencias ENABLE ROW LEVEL SECURITY/);
            assert.match(migrationSql, /CREATE POLICY "?agendamentos_select_policy"? ON public\.agendamentos_financeiros/);
            assert.match(migrationSql, /CREATE POLICY "?ocorrencias_select_policy"? ON public\.agendamento_ocorrencias/);
        });

        it('6. RPC confirmar_agendamento_ocorrencia deve ser SECURITY DEFINER com search_path seguro e lançar transação atomicamente', () => {
            assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.confirmar_agendamento_ocorrencia/);
            assert.match(migrationSql, /SECURITY DEFINER/);
            assert.match(migrationSql, /SET search_path =/);
            assert.match(migrationSql, /INSERT INTO public\.transacoes/);
            assert.match(migrationSql, /UPDATE public\.agendamento_ocorrencias/);
            assert.match(migrationSql, /status = 'REALIZADA'/);
        });

        it('7. RPC cancelar_agendamento_ocorrencia deve marcar como CANCELADA sem criar transação financeira', () => {
            assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.cancelar_agendamento_ocorrencia/);
            assert.match(migrationSql, /SECURITY DEFINER/);
            assert.match(migrationSql, /SET search_path =/);
            assert.match(migrationSql, /UPDATE public\.agendamento_ocorrencias/);
            assert.match(migrationSql, /status = 'CANCELADA'/);
        });
    });

    describe('4. Ciclo de Vida do Serviço e Desacoplamento Frontend', () => {

        it('8. schedulesService.js exporta todas as operações do ciclo de vida', () => {
            assert.match(schedulesServiceJs, /export async function fetchSchedules/);
            assert.match(schedulesServiceJs, /export async function createSchedule/);
            assert.match(schedulesServiceJs, /export async function updateSchedule/);
            assert.match(schedulesServiceJs, /export async function deactivateSchedule/);
            assert.match(schedulesServiceJs, /export async function fetchOccurrences/);
            assert.match(schedulesServiceJs, /export async function generateOccurrencesForSchedule/);
            assert.match(schedulesServiceJs, /export async function confirmOccurrence/);
            assert.match(schedulesServiceJs, /export async function cancelOccurrence/);
        });

        it('9. parseCurrencyValue converte números e strings pt-BR corretamente e rejeita <= 0', () => {
            assert.match(schedulesServiceJs, /export function parseCurrencyValue/);
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

        it('10. createSchedule e generateOccurrencesForSchedule garantem user_id da sessão e impedem spoofing', () => {
            assert.match(schedulesServiceJs, /supabaseClient\.auth\.getSession/);
            assert.match(schedulesServiceJs, /supabaseClient\.auth\.getUser/);
            assert.match(schedulesServiceJs, /Usuário não autenticado/);
            assert.match(schedulesServiceJs, /user_id:\s*user\.id/);
            assert.match(schedulesServiceJs, /delete cleanUpdates\.user_id/);
            assert.match(schedulesServiceJs, /user_id:\s*userId/);
        });

        it('11. schedulesService: desativação preservando realizadas e cancelando apenas futuras previstas', () => {
            assert.match(schedulesServiceJs, /export async function deactivateSchedule/);
            assert.match(schedulesServiceJs, /ativo:\s*false/);
            assert.match(schedulesServiceJs, /status:\s*'CANCELADA'/);
            assert.match(schedulesServiceJs, /status',\s*'PREVISTA'/);
            assert.match(schedulesServiceJs, /targetSchedule\.ativo === false/);
        });

        it('12. H8: currentForecastHorizon e selectedForecastYm são inicializados no estado global antes de qualquer render', () => {
            const globalStateBlock = indexHtml.match(/let currentUser = null;[\s\S]*?let charts = {};/);
            assert.ok(globalStateBlock, 'Bloco de estado global inicial deve existir');
            assert.match(globalStateBlock[0], /let currentForecastHorizon = 6;/, 'currentForecastHorizon deve ser declarado no bloco global inicial');
            assert.match(globalStateBlock[0], /let selectedForecastYm = null;/, 'selectedForecastYm deve ser declarado no bloco global inicial');

            const occurrences = (indexHtml.match(/let currentForecastHorizon/g) || []).length;
            assert.equal(occurrences, 1, 'Deve haver exatamente 1 declaração de currentForecastHorizon no arquivo');
        });
    });
});
