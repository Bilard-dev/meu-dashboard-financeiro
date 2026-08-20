// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');
const { mockUser } = require('./fixtures/mockData');

test.describe('Dinheiro Físico 2.0 - Saques, Espécie e Controle de Caixa', () => {

    test('1. Saque R$ 200,00 e Gasto em Espécie R$ 60,00 resulta em Saldo R$ 140,00', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-saque-1',
                    user_id: mockUser.id,
                    tipo: 'Saque',
                    data: '2026-08-01',
                    descricao: 'Saque Banco 24h',
                    valor: 200.00,
                    pagamento: 'PIX',
                    cartao: null,
                    categoria: 'Saque / Caixa',
                    custo: 'Variável'
                },
                {
                    id: 'tx-despesa-1',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-02',
                    descricao: 'Almoço em Dinheiro',
                    valor: 60.00,
                    pagamento: 'Dinheiro',
                    cartao: null,
                    categoria: 'Alimentação',
                    custo: 'Variável'
                }
            ]
        });

        const kpi = page.locator('#kpi-dinheiro-vivo');
        await expect(kpi).toContainText('140,00');
        // Saldo positivo mantém cor normal (warning/amarelo)
        await expect(kpi).toHaveCSS('color', 'rgb(245, 158, 11)');
    });

    test('2. Múltiplos saques acumulam corretamente no saldo físico', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-saque-1',
                    user_id: mockUser.id,
                    tipo: 'Saque',
                    data: '2026-08-01',
                    descricao: 'Saque 1',
                    valor: 200.00,
                    pagamento: 'PIX',
                    categoria: 'Saque / Caixa',
                    custo: 'Variável'
                },
                {
                    id: 'tx-saque-2',
                    user_id: mockUser.id,
                    tipo: 'Saque',
                    data: '2026-08-05',
                    descricao: 'Saque 2',
                    valor: 300.00,
                    pagamento: 'PIX',
                    categoria: 'Saque / Caixa',
                    custo: 'Variável'
                },
                {
                    id: 'tx-despesa-1',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-06',
                    descricao: 'Farmácia',
                    valor: 50.00,
                    pagamento: 'Dinheiro',
                    categoria: 'Saúde',
                    custo: 'Variável'
                }
            ]
        });

        // 200 + 300 - 50 = 450
        const kpi = page.locator('#kpi-dinheiro-vivo');
        await expect(kpi).toContainText('450,00');
    });

    test('3. Gasto em dinheiro sem saque prévio resulta em saldo negativo sem clamp', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-despesa-1',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-02',
                    descricao: 'Padaria em espécie',
                    valor: 60.00,
                    pagamento: 'Dinheiro',
                    categoria: 'Alimentação',
                    custo: 'Variável'
                }
            ]
        });

        const kpi = page.locator('#kpi-dinheiro-vivo');
        // Exibe saldo negativo -R$ 60,00
        await expect(kpi).toContainText('-R$');
        await expect(kpi).toContainText('60,00');
        // Saldo negativo recebe cor de perigo (danger/vermelho rgb(239, 68, 68))
        await expect(kpi).toHaveCSS('color', 'rgb(239, 68, 68)');
    });

    test('4. Receita com pagamento "Dinheiro" NÃO aumenta o saldo físico', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-rec-1',
                    user_id: mockUser.id,
                    tipo: 'Receita',
                    data: '2026-08-05',
                    descricao: 'Salário em Dinheiro',
                    valor: 5000.00,
                    pagamento: 'Dinheiro',
                    categoria: 'Salário',
                    custo: 'Variável'
                }
            ]
        });

        // Sem saques registrados, o saldo físico deve permanecer R$ 0,00
        const kpi = page.locator('#kpi-dinheiro-vivo');
        await expect(kpi).toContainText('0,00');
        await expect(kpi).not.toContainText('5.000,00');
    });

    test('5. Receita com pagamento "Dinheiro" NÃO diminui o saldo físico', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-saque-1',
                    user_id: mockUser.id,
                    tipo: 'Saque',
                    data: '2026-08-01',
                    descricao: 'Saque Inicial',
                    valor: 500.00,
                    pagamento: 'PIX',
                    categoria: 'Saque / Caixa',
                    custo: 'Variável'
                },
                {
                    id: 'tx-rec-1',
                    user_id: mockUser.id,
                    tipo: 'Receita',
                    data: '2026-08-05',
                    descricao: 'Transferência Recebida',
                    valor: 2000.00,
                    pagamento: 'Dinheiro',
                    categoria: 'Renda Extra',
                    custo: 'Variável'
                }
            ]
        });

        // Saldo físico deve ser exatamente o saque de R$ 500,00 (não pode ser subtraído como gasto)
        const kpi = page.locator('#kpi-dinheiro-vivo');
        await expect(kpi).toContainText('500,00');
    });

    test('6. Edição de Saque (R$ 200,00 -> R$ 300,00) pelo fluxo real recalcula o saldo', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-saque-edit',
                    user_id: mockUser.id,
                    tipo: 'Saque',
                    data: '2026-08-01',
                    descricao: 'Saque Original',
                    valor: 200.00,
                    pagamento: 'PIX',
                    categoria: 'Saque / Caixa',
                    custo: 'Variável'
                }
            ]
        });

        await expect(page.locator('#kpi-dinheiro-vivo')).toContainText('200,00');

        // Clica em Editar na tabela do Extrato
        await page.locator('#resumoExtratoTableBody tr').first().locator('button[title="Editar"]').click();

        // Altera o valor no formulário
        await page.locator('#i_valor').fill('300.00');
        await page.locator('#btnSalvar').click();

        // Aguarda retorno ao resumo
        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('300,00');

        // Confirma que o KPI atualizou para R$ 300,00
        await expect(page.locator('#kpi-dinheiro-vivo')).toContainText('300,00');
    });

    test('7. Exclusão de Saque pelo fluxo real recalcula o saldo', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-saque-del',
                    user_id: mockUser.id,
                    tipo: 'Saque',
                    data: '2026-08-01',
                    descricao: 'Saque para Deletar',
                    valor: 200.00,
                    pagamento: 'PIX',
                    categoria: 'Saque / Caixa',
                    custo: 'Variável'
                }
            ]
        });

        await expect(page.locator('#kpi-dinheiro-vivo')).toContainText('200,00');

        // Clica no botão Excluir (🗑️) no resumo
        const deleteBtn = page.locator('tr:has-text("Saque para Deletar") button[title="Excluir"]').first();
        await deleteBtn.click();

        // Confirma que o item sumiu e o saldo físico voltou para R$ 0,00
        await expect(page.locator('#resumoExtratoTableBody')).not.toContainText('Saque para Deletar');
        await expect(page.locator('#kpi-dinheiro-vivo')).toContainText('0,00');
    });

    test('8. Edição de Despesa em Dinheiro pelo fluxo real recalcula o saldo', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-saque-1',
                    user_id: mockUser.id,
                    tipo: 'Saque',
                    data: '2026-08-01',
                    descricao: 'Saque Caixa',
                    valor: 500.00,
                    pagamento: 'PIX',
                    categoria: 'Saque / Caixa',
                    custo: 'Variável'
                },
                {
                    id: 'tx-despesa-edit',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-02',
                    descricao: 'Feira Livre',
                    valor: 100.00,
                    pagamento: 'Dinheiro',
                    categoria: 'Alimentação',
                    custo: 'Variável'
                }
            ]
        });

        // 500 - 100 = 400
        await expect(page.locator('#kpi-dinheiro-vivo')).toContainText('400,00');

        // Edita a despesa de 100 para 150
        await page.locator('#resumoExtratoTableBody tr').filter({ hasText: 'Feira Livre' }).locator('button[title="Editar"]').click();
        await page.locator('#i_valor').fill('150.00');
        await page.locator('#btnSalvar').click();

        // Aguarda retorno ao resumo
        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);
        await expect(page.locator('#resumoExtratoTableBody')).toContainText('150,00');

        // 500 - 150 = 350
        await expect(page.locator('#kpi-dinheiro-vivo')).toContainText('350,00');
    });

    test('9. Exclusão de Despesa em Dinheiro pelo fluxo real restaura o saldo físico', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-saque-1',
                    user_id: mockUser.id,
                    tipo: 'Saque',
                    data: '2026-08-01',
                    descricao: 'Saque Caixa',
                    valor: 500.00,
                    pagamento: 'PIX',
                    categoria: 'Saque / Caixa',
                    custo: 'Variável'
                },
                {
                    id: 'tx-despesa-del',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-02',
                    descricao: 'Lanche Deletar',
                    valor: 80.00,
                    pagamento: 'Dinheiro',
                    categoria: 'Alimentação',
                    custo: 'Variável'
                }
            ]
        });

        // 500 - 80 = 420
        await expect(page.locator('#kpi-dinheiro-vivo')).toContainText('420,00');

        // Exclui a despesa
        const deleteBtn = page.locator('tr:has-text("Lanche Deletar") button[title="Excluir"]').first();
        await deleteBtn.click();

        // Confirma que a despesa sumiu e saldo físico volta para R$ 500,00
        await expect(page.locator('#resumoExtratoTableBody')).not.toContainText('Lanche Deletar');
        await expect(page.locator('#kpi-dinheiro-vivo')).toContainText('500,00');
    });

    test('10. Alterar pagamento de Dinheiro para PIX remove o débito do saldo físico', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-saque-1',
                    user_id: mockUser.id,
                    tipo: 'Saque',
                    data: '2026-08-01',
                    descricao: 'Saque Caixa',
                    valor: 500.00,
                    pagamento: 'PIX',
                    categoria: 'Saque / Caixa',
                    custo: 'Variável'
                },
                {
                    id: 'tx-despesa-troca',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-02',
                    descricao: 'Mercado Troca Pagamento',
                    valor: 120.00,
                    pagamento: 'Dinheiro',
                    categoria: 'Alimentação',
                    custo: 'Variável'
                }
            ]
        });

        // Inicial: 500 - 120 = 380
        await expect(page.locator('#kpi-dinheiro-vivo')).toContainText('380,00');

        // Edita para forma de pagamento PIX
        await page.locator('#resumoExtratoTableBody tr').filter({ hasText: 'Mercado Troca Pagamento' }).locator('button[title="Editar"]').click();
        await page.locator('#i_pagamento').selectOption('PIX');
        await page.locator('#btnSalvar').click();

        // Aguarda retorno ao resumo
        await expect(page.locator('#tab-resumo')).toHaveClass(/active/);

        // Como virou PIX, o saldo físico volta para R$ 500,00
        await expect(page.locator('#kpi-dinheiro-vivo')).toContainText('500,00');
    });

    test('11. Saque NÃO entra nas despesas mensais do Dashboard', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-saque-1',
                    user_id: mockUser.id,
                    tipo: 'Saque',
                    data: '2026-08-01',
                    descricao: 'Saque vultoso',
                    valor: 1000.00,
                    pagamento: 'PIX',
                    categoria: 'Saque / Caixa',
                    custo: 'Variável'
                },
                {
                    id: 'tx-despesa-1',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-02',
                    descricao: 'Almoço',
                    valor: 45.00,
                    pagamento: 'Dinheiro',
                    categoria: 'Alimentação',
                    custo: 'Variável'
                }
            ]
        });

        // KPI de Despesas deve ser estritamente R$ 45,00 (não R$ 1.045,00)
        await expect(page.locator('#kpi-despesas')).toContainText('45,00');
        await expect(page.locator('#kpi-despesas')).not.toContainText('1.045,00');

        // Saldo Dinheiro Vivo = 1000 - 45 = 955,00
        await expect(page.locator('#kpi-dinheiro-vivo')).toContainText('955,00');
    });

    test('12. As três receitas legadas simuladas não afetam o saldo físico', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            transactions: [
                {
                    id: 'tx-leg-1',
                    user_id: mockUser.id,
                    tipo: 'Receita',
                    data: '2026-08-01',
                    descricao: 'SALDO MES JULHO',
                    valor: 29.34,
                    pagamento: 'Dinheiro',
                    categoria: 'SALDO MES ANTERIOR',
                    custo: 'Variável'
                },
                {
                    id: 'tx-leg-2',
                    user_id: mockUser.id,
                    tipo: 'Receita',
                    data: '2026-08-05',
                    descricao: 'PGTO SALARIO',
                    valor: 4925.84,
                    pagamento: 'Dinheiro',
                    categoria: 'PGTO SALARIO',
                    custo: 'Variável'
                },
                {
                    id: 'tx-leg-3',
                    user_id: mockUser.id,
                    tipo: 'Receita',
                    data: '2026-08-05',
                    descricao: 'APORTE NUBANK',
                    valor: 437.71,
                    pagamento: 'Dinheiro',
                    categoria: 'POUPANÇA',
                    custo: 'Variável'
                },
                {
                    id: 'tx-saque-1',
                    user_id: mockUser.id,
                    tipo: 'Saque',
                    data: '2026-08-10',
                    descricao: 'Saque de Teste',
                    valor: 200.00,
                    pagamento: 'PIX',
                    categoria: 'Saque / Caixa',
                    custo: 'Variável'
                },
                {
                    id: 'tx-gasto-1',
                    user_id: mockUser.id,
                    tipo: 'Despesa',
                    data: '2026-08-11',
                    descricao: 'Lanche em Dinheiro',
                    valor: 50.00,
                    pagamento: 'Dinheiro',
                    categoria: 'Alimentação',
                    custo: 'Variável'
                }
            ]
        });

        // Saldo físico deve ser EXATAMENTE: 200 (saque) - 50 (despesa) = R$ 150,00
        // Não pode ser somado com as receitas (não vira R$ 5.542,89) e nem subtraído (não vira negativo)
        const kpi = page.locator('#kpi-dinheiro-vivo');
        await expect(kpi).toContainText('150,00');
    });

});
