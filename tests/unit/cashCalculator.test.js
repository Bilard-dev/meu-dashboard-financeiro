import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCashBalance } from '../../src/domain/cash/cashCalculator.js';

describe('cashCalculator — calculateCashBalance', () => {
    it('deve retornar zeros para entradas nulas, indefinidas ou array vazio', () => {
        const emptyResult = { totalSaques: 0, totalGastoEspecie: 0, saldoDinheiroVivo: 0 };
        assert.deepEqual(calculateCashBalance(null), emptyResult);
        assert.deepEqual(calculateCashBalance(undefined), emptyResult);
        assert.deepEqual(calculateCashBalance([]), emptyResult);
        assert.deepEqual(calculateCashBalance('invalido'), emptyResult);
    });

    it('deve acumular um único saque corretamente', () => {
        const txs = [
            { type: 'SAQUE', value: 200, pagamento: 'PIX', desc: 'Saque 24h' }
        ];
        const res = calculateCashBalance(txs);
        assert.equal(res.totalSaques, 200);
        assert.equal(res.totalGastoEspecie, 0);
        assert.equal(res.saldoDinheiroVivo, 200);
    });

    it('deve acumular múltiplos saques no total de saques', () => {
        const txs = [
            { type: 'SAQUE', value: 200, pagamento: 'PIX' },
            { type: 'SAQUE', value: 300, pagamento: 'PIX' },
            { type: 'SAQUE', value: 150.50, pagamento: 'Outros' }
        ];
        const res = calculateCashBalance(txs);
        assert.equal(res.totalSaques, 650.50);
        assert.equal(res.totalGastoEspecie, 0);
        assert.equal(res.saldoDinheiroVivo, 650.50);
    });

    it('deve acumular despesas pagas em "Dinheiro"', () => {
        const txs = [
            { type: 'DESPESA', value: 60, pagamento: 'Dinheiro', desc: 'Almoço' },
            { type: 'DESPESA', value: 40, pagamento: 'Dinheiro', desc: 'Feira' }
        ];
        const res = calculateCashBalance(txs);
        assert.equal(res.totalSaques, 0);
        assert.equal(res.totalGastoEspecie, 100);
        assert.equal(res.saldoDinheiroVivo, -100);
    });

    it('deve reconhecer tanto "Dinheiro" quanto "Dinheiro Vivo (Espécie)" como gastos em espécie', () => {
        const txs = [
            { type: 'DESPESA', value: 50, pagamento: 'Dinheiro' },
            { type: 'DESPESA', value: 30, pagamento: 'Dinheiro Vivo (Espécie)' }
        ];
        const res = calculateCashBalance(txs);
        assert.equal(res.totalGastoEspecie, 80);
        assert.equal(res.saldoDinheiroVivo, -80);
    });

    it('deve calcular corretamente saldo com saques e despesas combinados', () => {
        const txs = [
            { type: 'SAQUE', value: 500, pagamento: 'PIX' },
            { type: 'DESPESA', value: 120, pagamento: 'Dinheiro' },
            { type: 'DESPESA', value: 30, pagamento: 'Dinheiro' }
        ];
        const res = calculateCashBalance(txs);
        assert.equal(res.totalSaques, 500);
        assert.equal(res.totalGastoEspecie, 150);
        assert.equal(res.saldoDinheiroVivo, 350);
    });

    it('deve preservar saldo negativo sem clamp quando gastos superam saques', () => {
        const txs = [
            { type: 'SAQUE', value: 100, pagamento: 'PIX' },
            { type: 'DESPESA', value: 150, pagamento: 'Dinheiro' }
        ];
        const res = calculateCashBalance(txs);
        assert.equal(res.totalSaques, 100);
        assert.equal(res.totalGastoEspecie, 150);
        assert.equal(res.saldoDinheiroVivo, -50);
    });

    it('NÃO deve contabilizar despesas pagas em PIX, Cartão de Crédito ou Débito como espécie', () => {
        const txs = [
            { type: 'SAQUE', value: 500, pagamento: 'PIX' },
            { type: 'DESPESA', value: 200, pagamento: 'PIX' },
            { type: 'DESPESA', value: 300, pagamento: 'Cartão de Crédito', cartao: 'Nubank' },
            { type: 'DESPESA', value: 100, pagamento: 'Débito' }
        ];
        const res = calculateCashBalance(txs);
        assert.equal(res.totalSaques, 500);
        assert.equal(res.totalGastoEspecie, 0);
        assert.equal(res.saldoDinheiroVivo, 500);
    });

    it('NÃO deve permitir que Receitas com pagamento "Dinheiro" alterem o saldo físico', () => {
        const txs = [
            { type: 'SAQUE', value: 500, pagamento: 'PIX' },
            { type: 'RECEITA', value: 5000, pagamento: 'Dinheiro', desc: 'Salário' },
            { type: 'RECEITA', value: 2000, pagamento: 'Dinheiro', desc: 'Renda Extra' }
        ];
        const res = calculateCashBalance(txs);
        assert.equal(res.totalSaques, 500);
        assert.equal(res.totalGastoEspecie, 0);
        assert.equal(res.saldoDinheiroVivo, 500);
    });

    it('NÃO deve permitir que Investimentos alterem o saldo físico', () => {
        const txs = [
            { type: 'SAQUE', value: 400, pagamento: 'PIX' },
            { type: 'INVESTIMENTO', value: 1000, pagamento: 'PIX', desc: 'Tesouro Selic' }
        ];
        const res = calculateCashBalance(txs);
        assert.equal(res.totalSaques, 400);
        assert.equal(res.totalGastoEspecie, 0);
        assert.equal(res.saldoDinheiroVivo, 400);
    });

    it('deve suportar objetos brutos do banco com propriedades "tipo" e "valor"', () => {
        const rawTxs = [
            { tipo: 'Saque', valor: 250.00, pagamento: 'PIX' },
            { tipo: 'Despesa', valor: 50.00, pagamento: 'Dinheiro' }
        ];
        const res = calculateCashBalance(rawTxs);
        assert.equal(res.totalSaques, 250);
        assert.equal(res.totalGastoEspecie, 50);
        assert.equal(res.saldoDinheiroVivo, 200);
    });

    it('deve apresentar equivalência estrita com a lógica original do monólito', () => {
        const complexDataset = [
            { type: 'SAQUE', value: 1000, pagamento: 'PIX' },
            { type: 'DESPESA', value: 45, pagamento: 'Dinheiro' },
            { type: 'DESPESA', value: 155, pagamento: 'Dinheiro Vivo (Espécie)' },
            { type: 'DESPESA', value: 300, pagamento: 'PIX' },
            { type: 'DESPESA', value: 500, pagamento: 'Cartão de Crédito', cartao: 'XP' },
            { type: 'RECEITA', value: 6000, pagamento: 'Dinheiro' },
            { type: 'INVESTIMENTO', value: 1500, pagamento: 'PIX' },
            { type: 'SAQUE', value: 500, pagamento: 'Outros' }
        ];

        // Lógica antiga original do monólito:
        const oldSaques = complexDataset.filter(d => d.type === 'SAQUE').reduce((a, b) => a + b.value, 0);
        const oldGasto = complexDataset.filter(d => d.type === 'DESPESA' && (d.pagamento === 'Dinheiro' || d.pagamento === 'Dinheiro Vivo (Espécie)')).reduce((a, b) => a + b.value, 0);
        const oldSaldo = oldSaques - oldGasto;

        // Nova função pura de domínio:
        const newResult = calculateCashBalance(complexDataset);

        assert.equal(newResult.totalSaques, oldSaques);
        assert.equal(newResult.totalGastoEspecie, oldGasto);
        assert.equal(newResult.saldoDinheiroVivo, oldSaldo);
    });
});
