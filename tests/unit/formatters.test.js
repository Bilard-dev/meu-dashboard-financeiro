import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    formatCurrency,
    formatFaturaBadge
} from '../../src/core/formatters.js';

describe('formatters — formatCurrency', () => {
    it('deve formatar valor positivo no padrão de moeda BRL', () => {
        const result = formatCurrency(1234.56);
        // Suporta NBSP ou espaço simples do toLocaleString
        assert.ok(result.includes('1.234,56') || result.includes('1234,56'));
        assert.ok(result.includes('R$'));
    });

    it('deve formatar zero no padrão BRL', () => {
        const result = formatCurrency(0);
        assert.ok(result.includes('0,00'));
        assert.ok(result.includes('R$'));
    });

    it('deve formatar valores negativos', () => {
        const result = formatCurrency(-500.75);
        assert.ok(result.includes('500,75'));
        assert.ok(result.includes('-') || result.includes('('));
    });

    it('deve formatar grandes valores monetários com separadores de milhar', () => {
        const result = formatCurrency(1000000);
        assert.ok(result.includes('1.000.000,00'));
    });

    it('deve retornar máscara quando o modo de privacidade estiver ativo (isPrivacy = true)', () => {
        assert.equal(formatCurrency(1250.00, true), 'R$ ****,**');
        assert.equal(formatCurrency(0, true), 'R$ ****,**');
        assert.equal(formatCurrency(-999.99, true), 'R$ ****,**');
    });
});

describe('formatters — formatFaturaBadge', () => {
    it('deve retornar string vazia para itens nulos, indefinidos ou vazios', () => {
        assert.equal(formatFaturaBadge(null), '');
        assert.equal(formatFaturaBadge(undefined), '');
        assert.equal(formatFaturaBadge({}), '');
    });

    it('deve retornar string vazia se a forma de pagamento não for cartão de crédito e não tiver cartão', () => {
        const itemPix = { pagamento: 'PIX', valor: 100, rawDate: '2026-08-15' };
        assert.equal(formatFaturaBadge(itemPix), '');

        const itemDinheiro = { pagamento: 'Dinheiro', valor: 50, data: '2026-08-15' };
        assert.equal(formatFaturaBadge(itemDinheiro), '');
    });

    it('deve retornar string vazia se o item não contiver data nem rawDate', () => {
        const itemSemData = { pagamento: 'Cartão de Crédito', cartao: 'Nubank' };
        assert.equal(formatFaturaBadge(itemSemData), '');
    });

    it('deve formatar a fatura atual quando faturaDestino não for definida ou for padrão', () => {
        const item = {
            pagamento: 'Cartão de Crédito',
            cartao: 'Nubank',
            rawDate: '2026-08-15'
        };
        assert.equal(formatFaturaBadge(item), 'Fatura Agosto/2026');
    });

    it('deve formatar a próxima fatura quando faturaDestino for "PROXIMA"', () => {
        const item = {
            pagamento: 'Cartão de Crédito',
            cartao: 'Nubank',
            rawDate: '2026-08-15',
            faturaDestino: 'PROXIMA'
        };
        assert.equal(formatFaturaBadge(item), 'Fatura Setembro/2026');
    });

    it('deve tratar virada de ano com faturaDestino "PROXIMA" em Dezembro', () => {
        const item = {
            pagamento: 'Cartão de Crédito',
            cartao: 'Inter',
            data: '2026-12-20',
            faturaDestino: 'PROXIMA'
        };
        assert.equal(formatFaturaBadge(item), 'Fatura Janeiro/2027');
    });

    it('deve formatar fatura com destino explícito absoluto no formato "YYYY-M" (base 0)', () => {
        const item = {
            pagamento: 'Cartão de Crédito',
            cartao: 'XP',
            rawDate: '2026-08-10',
            faturaDestino: '2026-10' // Mês 10 = Novembro (base 0)
        };
        assert.equal(formatFaturaBadge(item), 'Fatura Novembro/2026');
    });

    it('deve formatar fatura com destino explícito para o ano seguinte no formato "YYYY-M" (base 0)', () => {
        const item = {
            pagamento: 'Cartão de Crédito',
            cartao: 'Itaú',
            rawDate: '2026-09-09',
            faturaDestino: '2027-2' // Mês 2 = Março (base 0)
        };
        assert.equal(formatFaturaBadge(item), 'Fatura Março/2027');
    });
});
