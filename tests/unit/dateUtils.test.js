import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseLocalDate,
    formatLocalDateInput,
    addMonths,
    MONTH_NAMES_BR
} from '../../src/core/dateUtils.js';

describe('dateUtils — parseLocalDate', () => {
    it('deve fazer o parse de string YYYY-MM-DD para Date com horário fixado às 12:00:00 local', () => {
        const d = parseLocalDate('2026-09-09');
        assert.ok(d instanceof Date);
        assert.equal(d.getFullYear(), 2026);
        assert.equal(d.getMonth(), 8); // Setembro (base 0)
        assert.equal(d.getDate(), 9);
        assert.equal(d.getHours(), 12);
        assert.equal(d.getMinutes(), 0);
        assert.equal(d.getSeconds(), 0);
    });

    it('deve ignorar a parte de hora se string contiver T (ex: ISO)', () => {
        const d = parseLocalDate('2026-12-31T23:59:59.999Z');
        assert.ok(d instanceof Date);
        assert.equal(d.getFullYear(), 2026);
        assert.equal(d.getMonth(), 11); // Dezembro
        assert.equal(d.getDate(), 31);
        assert.equal(d.getHours(), 12);
    });

    it('deve retornar null para valores nulos, indefinidos, vazios ou tipos inválidos', () => {
        assert.equal(parseLocalDate(null), null);
        assert.equal(parseLocalDate(undefined), null);
        assert.equal(parseLocalDate(''), null);
        assert.equal(parseLocalDate(12345), null);
        assert.equal(parseLocalDate({}), null);
    });

    it('deve retornar null para strings com datas inválidas (ex: formato incorreto)', () => {
        assert.equal(parseLocalDate('data-invalida'), null);
        assert.equal(parseLocalDate('2026-99-99'), null);
    });

    it('deve tratar corretamente ano bissexto (29 de Fevereiro)', () => {
        const leapDate = parseLocalDate('2024-02-29');
        assert.ok(leapDate instanceof Date);
        assert.equal(leapDate.getFullYear(), 2024);
        assert.equal(leapDate.getMonth(), 1); // Fevereiro
        assert.equal(leapDate.getDate(), 29);
    });

    it('deve tratar corretamente o último dia de Fevereiro em ano comum', () => {
        const nonLeapDate = parseLocalDate('2026-02-28');
        assert.ok(nonLeapDate instanceof Date);
        assert.equal(nonLeapDate.getFullYear(), 2026);
        assert.equal(nonLeapDate.getMonth(), 1);
        assert.equal(nonLeapDate.getDate(), 28);
    });

    it('deve tratar viradas de mês e de ano com precisão', () => {
        const janFirst = parseLocalDate('2026-01-01');
        assert.equal(janFirst.getFullYear(), 2026);
        assert.equal(janFirst.getMonth(), 0);
        assert.equal(janFirst.getDate(), 1);

        const decLast = parseLocalDate('2026-12-31');
        assert.equal(decLast.getFullYear(), 2026);
        assert.equal(decLast.getMonth(), 11);
        assert.equal(decLast.getDate(), 31);
    });
});

describe('dateUtils — formatLocalDateInput', () => {
    it('deve formatar um objeto Date válido para string YYYY-MM-DD', () => {
        const d = new Date(2026, 8, 9, 15, 30, 0); // 09/09/2026
        assert.equal(formatLocalDateInput(d), '2026-09-09');
    });

    it('deve aplicar padStart com zero para meses e dias com 1 dígito', () => {
        const d = new Date(2026, 2, 5, 8, 0, 0); // 05/03/2026
        assert.equal(formatLocalDateInput(d), '2026-03-05');
    });

    it('deve usar a data atual quando chamado sem parâmetros', () => {
        const formatted = formatLocalDateInput();
        assert.match(formatted, /^\d{4}-\d{2}-\d{2}$/);
    });

    it('deve retornar a data atual quando passado argumento inválido (ex: Date inválido)', () => {
        const invalidDate = new Date('data-invalida');
        const formatted = formatLocalDateInput(invalidDate);
        assert.match(formatted, /^\d{4}-\d{2}-\d{2}$/);
    });

    it('deve formatar corretamente datas de virada de ano e ano bissexto', () => {
        const leapDate = new Date(2024, 1, 29, 12, 0, 0);
        assert.equal(formatLocalDateInput(leapDate), '2024-02-29');

        const endOfYear = new Date(2026, 11, 31, 23, 59, 59);
        assert.equal(formatLocalDateInput(endOfYear), '2026-12-31');

        const startOfYear = new Date(2027, 0, 1, 0, 0, 1);
        assert.equal(formatLocalDateInput(startOfYear), '2027-01-01');
    });
});

describe('dateUtils — addMonths', () => {
    it('deve avançar meses dentro do mesmo ano', () => {
        const result = addMonths(2026, 0, 3); // Jan + 3 = Abril
        assert.deepEqual(result, { year: 2026, month: 3 });
    });

    it('deve avançar meses com virada de ano (ex: Nov + 3 = Fev do ano seguinte)', () => {
        const result = addMonths(2026, 10, 3); // Nov (10) + 3 = Fev (1) / 2027
        assert.deepEqual(result, { year: 2027, month: 1 });
    });

    it('deve recuar meses com virada de ano anterior (ex: Jan - 1 = Dez do ano anterior)', () => {
        const result = addMonths(2026, 0, -1); // Jan (0) - 1 = Dez (11) / 2025
        assert.deepEqual(result, { year: 2025, month: 11 });
    });

    it('deve suportar saltos de múltiplos anos para frente e para trás', () => {
        const forward = addMonths(2026, 5, 24); // Jun 2026 + 24 meses = Jun 2028
        assert.deepEqual(forward, { year: 2028, month: 5 });

        const backward = addMonths(2026, 5, -24); // Jun 2026 - 24 meses = Jun 2024
        assert.deepEqual(backward, { year: 2024, month: 5 });
    });

    it('deve manter ano e mês inalterados com offset 0', () => {
        const result = addMonths(2026, 8, 0);
        assert.deepEqual(result, { year: 2026, month: 8 });
    });
});

describe('dateUtils — MONTH_NAMES_BR', () => {
    it('deve conter exatamente os 12 meses em português brasileiro', () => {
        assert.equal(MONTH_NAMES_BR.length, 12);
        assert.deepEqual(MONTH_NAMES_BR, [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ]);
    });
});
