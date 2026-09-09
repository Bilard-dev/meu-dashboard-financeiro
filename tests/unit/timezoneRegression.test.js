import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseLocalDate,
    formatLocalDateInput
} from '../../src/core/dateUtils.js';

describe('Regressão de Timezone — Preservação de Data Civil Local (UTC-3 / America/Sao_Paulo)', () => {
    before(() => {
        // Fixa explicitamente o timezone para America/Sao_Paulo (UTC-3)
        process.env.TZ = 'America/Sao_Paulo';
    });

    it('deve preservar a data civil de lançamentos noturnos às 21:30 (em UTC-3 já é dia seguinte em UTC)', () => {
        // Em UTC-3, 21:30 de 09/09 equivale a 10/09 00:30 UTC.
        // O toISOString() geraria '2026-09-10', mas formatLocalDateInput DEVE gerar '2026-09-09'.
        const lateNight = new Date('2026-09-09T21:30:00-03:00');
        assert.equal(formatLocalDateInput(lateNight), '2026-09-09');

        const lateNightObj = new Date(2026, 8, 9, 21, 30, 0);
        assert.equal(formatLocalDateInput(lateNightObj), '2026-09-09');
    });

    it('deve preservar a data civil em horário crítico próximo de meia-noite às 23:30', () => {
        // Em UTC-3, 23:30 de 09/09 equivale a 10/09 02:30 UTC.
        const nearMidnight = new Date('2026-09-09T23:30:00-03:00');
        assert.equal(formatLocalDateInput(nearMidnight), '2026-09-09');

        const nearMidnightObj = new Date(2026, 8, 9, 23, 30, 0);
        assert.equal(formatLocalDateInput(nearMidnightObj), '2026-09-09');
    });

    it('deve preservar a data civil na madrugada às 00:30', () => {
        const earlyMorning = new Date('2026-09-09T00:30:00-03:00');
        assert.equal(formatLocalDateInput(earlyMorning), '2026-09-09');

        const earlyMorningObj = new Date(2026, 8, 9, 0, 30, 0);
        assert.equal(formatLocalDateInput(earlyMorningObj), '2026-09-09');
    });

    it('deve preservar a data civil na virada de mês (31 de Janeiro às 23:30 -> 1 de Fevereiro às 00:30)', () => {
        const endOfJan = new Date('2026-01-31T23:30:00-03:00');
        assert.equal(formatLocalDateInput(endOfJan), '2026-01-31');

        const startOfFeb = new Date('2026-02-01T00:30:00-03:00');
        assert.equal(formatLocalDateInput(startOfFeb), '2026-02-01');
    });

    it('deve preservar a data civil na virada de ano (31 de Dezembro às 23:30 -> 1 de Janeiro às 00:30)', () => {
        const newYearsEve = new Date('2026-12-31T23:30:00-03:00');
        assert.equal(formatLocalDateInput(newYearsEve), '2026-12-31');

        const newYearsDay = new Date('2027-01-01T00:30:00-03:00');
        assert.equal(formatLocalDateInput(newYearsDay), '2027-01-01');
    });

    it('deve preservar a data civil no último dia de Fevereiro (ano bissexto vs comum)', () => {
        const leapFeb = new Date('2024-02-29T23:30:00-03:00');
        assert.equal(formatLocalDateInput(leapFeb), '2024-02-29');

        const nonLeapFeb = new Date('2026-02-28T23:30:00-03:00');
        assert.equal(formatLocalDateInput(nonLeapFeb), '2026-02-28');
    });

    it('deve fazer o parse de YYYY-MM-DD fixando meio-dia para evitar deslocamento retrógrado em fusos negativos', () => {
        const parsed = parseLocalDate('2026-09-09');
        assert.ok(parsed instanceof Date);
        assert.equal(parsed.getFullYear(), 2026);
        assert.equal(parsed.getMonth(), 8);
        assert.equal(parsed.getDate(), 9);
        assert.equal(parsed.getHours(), 12);
    });

    it('deve garantir idempotência em roundtrip (parseLocalDate -> formatLocalDateInput)', () => {
        const testDates = [
            '2026-01-01',
            '2026-02-28',
            '2024-02-29',
            '2026-06-30',
            '2026-09-09',
            '2026-12-31'
        ];

        for (const str of testDates) {
            const parsed = parseLocalDate(str);
            const formatted = formatLocalDateInput(parsed);
            assert.equal(formatted, str, `Falha no roundtrip para a data: ${str}`);
        }
    });

    it('deve demonstrar a imunidade contra o bug de toISOString() em horários noturnos no Brasil', () => {
        const nightTime = new Date('2026-09-09T22:00:00-03:00');

        // toISOString() geraria '2026-09-10' (incorreto para data civil do usuário brasileiro)
        const naiveIsoDate = nightTime.toISOString().split('T')[0];
        assert.equal(naiveIsoDate, '2026-09-10');

        // formatLocalDateInput() gera '2026-09-09' (correto!)
        const correctLocalDate = formatLocalDateInput(nightTime);
        assert.equal(correctLocalDate, '2026-09-09');
    });
});
