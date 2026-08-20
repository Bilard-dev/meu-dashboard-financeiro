/**
 * Dados simulados e controlados para a suíte de testes do Playwright.
 * 100% isolado do Supabase de produção.
 */

const mockUser = {
    id: 'test-user-uuid-1234',
    email: 'test@example.com',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z'
};

const mockTransactions = [
    {
        id: 'tx-001-pix',
        user_id: 'test-user-uuid-1234',
        tipo: 'Despesa',
        data: '2026-08-10',
        descricao: '[Essencial] Supermercado Mensal',
        valor: 450.00,
        pagamento: 'PIX',
        cartao: null,
        parcela: null,
        fatura_destino: 'ATUAL',
        categoria: 'Alimentação',
        subcategoria: 'Supermercado',
        custo: 'Fixo',
        created_at: '2026-08-10T10:00:00.000Z'
    },
    {
        id: 'tx-002-dinheiro',
        user_id: 'test-user-uuid-1234',
        tipo: 'Despesa',
        data: '2026-08-12',
        descricao: '[Viagem] Almoço Restaurante em Espécie',
        valor: 60.00,
        pagamento: 'Dinheiro',
        cartao: null,
        parcela: null,
        fatura_destino: 'ATUAL',
        categoria: 'Alimentação',
        subcategoria: 'Restaurante',
        custo: 'Variável',
        created_at: '2026-08-12T12:00:00.000Z'
    },
    {
        id: 'tx-003-saque',
        user_id: 'test-user-uuid-1234',
        tipo: 'Saque',
        data: '2026-08-05',
        descricao: 'Saque Caixa 24h',
        valor: 200.00,
        pagamento: 'Conta Corrente',
        cartao: null,
        parcela: null,
        fatura_destino: 'ATUAL',
        categoria: 'Outros',
        subcategoria: 'Saque',
        custo: 'Variável',
        created_at: '2026-08-05T09:00:00.000Z'
    },
    {
        id: 'tx-004-debito',
        user_id: 'test-user-uuid-1234',
        tipo: 'Despesa',
        data: '2026-08-14',
        descricao: 'Farmácia Remédios',
        valor: 85.00,
        pagamento: 'Débito',
        cartao: null,
        parcela: null,
        fatura_destino: 'ATUAL',
        categoria: 'Saúde',
        subcategoria: 'Farmácia',
        custo: 'Variável',
        created_at: '2026-08-14T14:00:00.000Z'
    },
    {
        id: 'tx-005-parcelado',
        user_id: 'test-user-uuid-1234',
        tipo: 'Despesa',
        data: '2026-08-15',
        descricao: 'Notebook Trabalho',
        valor: 300.00,
        pagamento: 'Cartão de Crédito',
        cartao: 'Nubank',
        parcela: '1/10',
        fatura_destino: 'ATUAL',
        categoria: 'Trabalho',
        subcategoria: 'Equipamentos',
        custo: 'Fixo',
        created_at: '2026-08-15T16:00:00.000Z'
    },
    {
        id: 'tx-006-recorrente',
        user_id: 'test-user-uuid-1234',
        tipo: 'Despesa',
        data: '2026-08-01',
        descricao: 'Netflix Assinatura',
        valor: 55.90,
        pagamento: 'Cartão de Crédito',
        cartao: 'Nubank',
        parcela: 'RECORRENTE',
        fatura_destino: 'ATUAL',
        categoria: 'Lazer',
        subcategoria: 'Streaming',
        custo: 'Fixo',
        created_at: '2026-08-01T08:00:00.000Z'
    },
    {
        id: 'tx-007-receita',
        user_id: 'test-user-uuid-1234',
        tipo: 'Receita',
        data: '2026-08-05',
        descricao: 'Salário Mensal',
        valor: 8000.00,
        pagamento: 'Conta Corrente',
        cartao: null,
        parcela: null,
        fatura_destino: 'ATUAL',
        categoria: 'Salário',
        subcategoria: 'Mensal',
        custo: 'Fixo',
        created_at: '2026-08-05T08:00:00.000Z'
    },
    {
        id: 'tx-008-investimento-1',
        user_id: 'test-user-uuid-1234',
        tipo: 'Investimento',
        data: '2026-08-06',
        descricao: 'Aporte Tesouro Direto',
        valor: 1500.00,
        pagamento: 'PIX',
        cartao: null,
        parcela: null,
        fatura_destino: 'ATUAL',
        categoria: 'Investimentos',
        subcategoria: 'Renda Fixa',
        custo: 'Fixo',
        created_at: '2026-08-06T10:00:00.000Z'
    },
    {
        id: 'tx-009-investimento-2',
        user_id: 'test-user-uuid-1234',
        tipo: 'Investimento',
        data: '2026-08-15',
        descricao: 'Ações Dividendos',
        valor: 1000.00,
        pagamento: 'PIX',
        cartao: null,
        parcela: null,
        fatura_destino: 'ATUAL',
        categoria: 'Investimentos',
        subcategoria: 'Renda Variável',
        custo: 'Fixo',
        created_at: '2026-08-15T11:00:00.000Z'
    },
    {
        id: 'tx-010-regressao-2024',
        user_id: 'test-user-uuid-1234',
        tipo: 'Despesa',
        data: '2026-08-17',
        descricao: 'Compra Antiga com Fatura 2024',
        valor: 1200.00,
        pagamento: 'Cartão de Crédito',
        cartao: 'Itaú',
        parcela: '1/1',
        fatura_destino: '2024-5', // Junho/2024
        categoria: 'Outros',
        subcategoria: 'Diversos',
        custo: 'Variável',
        created_at: '2026-08-17T15:00:00.000Z'
    }
];

const mockSharedExpenses = [
    {
        id: 'shared-001',
        created_by: 'test-user-uuid-1234',
        data: '2026-08-12',
        descricao: 'Jantar Casal',
        valor_total: 200.00,
        valor_meu: 100.00,
        valor_parceiro: 100.00,
        categoria: 'Alimentação',
        subcategoria: 'Restaurante',
        pagamento: 'PIX',
        cartao: null,
        status: 'Pendente',
        created_at: '2026-08-12T20:00:00.000Z'
    },
    {
        id: 'shared-002',
        created_by: 'test-user-uuid-1234',
        data: '2026-08-10',
        descricao: 'Contas Casa - Luz',
        valor_total: 300.00,
        valor_meu: 180.00,
        valor_parceiro: 120.00,
        categoria: 'Casa',
        subcategoria: 'Energia',
        pagamento: 'PIX',
        cartao: null,
        status: 'Pago',
        created_at: '2026-08-10T10:00:00.000Z'
    }
];

const mockMetas = [
    {
        id: 'meta-001-alimentacao',
        user_id: 'test-user-uuid-1234',
        categoria: 'Alimentação',
        categoria_normalizada: 'alimentação',
        valor_limite: 1000.00,
        created_at: '2026-08-01T10:00:00.000Z',
        updated_at: '2026-08-01T10:00:00.000Z'
    },
    {
        id: 'meta-002-saude',
        user_id: 'test-user-uuid-1234',
        categoria: 'Saúde',
        categoria_normalizada: 'saúde',
        valor_limite: 300.00,
        created_at: '2026-08-01T10:00:00.000Z',
        updated_at: '2026-08-01T10:00:00.000Z'
    },
    {
        id: 'meta-003-lazer',
        user_id: 'test-user-uuid-1234',
        categoria: 'Lazer',
        categoria_normalizada: 'lazer',
        valor_limite: 200.00,
        created_at: '2026-08-01T10:00:00.000Z',
        updated_at: '2026-08-01T10:00:00.000Z'
    }
];

const mockBudgets = {
    'Alimentação': 1000,
    'Saúde': 300,
    'Lazer': 200
};

const mockCategorias = [
    { id: 'cat-001-uuid', user_id: 'test-user-uuid-1234', nome: 'Alimentação', nome_normalizado: 'alimentação', ativo: true, ordem: 0, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: 'cat-002-uuid', user_id: 'test-user-uuid-1234', nome: 'Transporte', nome_normalizado: 'transporte', ativo: true, ordem: 1, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: 'cat-003-uuid', user_id: 'test-user-uuid-1234', nome: 'Moradia', nome_normalizado: 'moradia', ativo: true, ordem: 2, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: 'cat-004-uuid', user_id: 'test-user-uuid-1234', nome: 'Lazer', nome_normalizado: 'lazer', ativo: true, ordem: 3, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: 'cat-005-uuid', user_id: 'test-user-uuid-1234', nome: 'Saúde', nome_normalizado: 'saúde', ativo: true, ordem: 4, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: 'cat-006-uuid', user_id: 'test-user-uuid-1234', nome: 'Trabalho', nome_normalizado: 'trabalho', ativo: true, ordem: 5, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: 'cat-007-uuid', user_id: 'test-user-uuid-1234', nome: 'Educação', nome_normalizado: 'educação', ativo: true, ordem: 6, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: 'cat-008-uuid', user_id: 'test-user-uuid-1234', nome: 'Outros', nome_normalizado: 'outros', ativo: true, ordem: 7, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: 'cat-009-uuid', user_id: 'test-user-uuid-1234', nome: 'Salário', nome_normalizado: 'salário', ativo: true, ordem: 8, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: 'cat-010-uuid', user_id: 'test-user-uuid-1234', nome: 'Rendimentos', nome_normalizado: 'rendimentos', ativo: true, ordem: 9, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' }
];

const mockSubcategorias = [
    { id: 'sub-001-uuid', user_id: 'test-user-uuid-1234', categoria_id: 'cat-001-uuid', nome: 'Supermercado', nome_normalizado: 'supermercado', ativo: true, ordem: 0, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: 'sub-002-uuid', user_id: 'test-user-uuid-1234', categoria_id: 'cat-001-uuid', nome: 'Restaurante', nome_normalizado: 'restaurante', ativo: true, ordem: 1, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: 'sub-003-uuid', user_id: 'test-user-uuid-1234', categoria_id: 'cat-002-uuid', nome: 'Combustível', nome_normalizado: 'combustível', ativo: true, ordem: 0, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: 'sub-004-uuid', user_id: 'test-user-uuid-1234', categoria_id: 'cat-006-uuid', nome: 'Equipamentos', nome_normalizado: 'equipamentos', ativo: true, ordem: 0, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: 'sub-005-uuid', user_id: 'test-user-uuid-1234', categoria_id: 'cat-005-uuid', nome: 'Farmácia', nome_normalizado: 'farmácia', ativo: true, ordem: 0, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' }
];

const mockCartoes = [
    { id: 'card-001-uuid', user_id: 'test-user-uuid-1234', nome: 'Nubank', nome_normalizado: 'nubank', dia_fechamento: 25, dia_vencimento: 5, cor: '#820ad1', ativo: true, ordem: 0, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: 'card-002-uuid', user_id: 'test-user-uuid-1234', nome: 'Inter Black', nome_normalizado: 'inter black', dia_fechamento: 10, dia_vencimento: 20, cor: '#ff7a00', ativo: true, ordem: 1, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' }
];

const mockTags = [
    { id: 'tag-001-uuid', user_id: 'test-user-uuid-1234', nome: 'Viagem', nome_normalizado: 'viagem', cor: '#0ea5e9', ativo: true, ordem: 0, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: 'tag-002-uuid', user_id: 'test-user-uuid-1234', nome: 'Família', nome_normalizado: 'família', cor: '#10b981', ativo: true, ordem: 1, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' }
];

module.exports = {
    mockUser,
    mockTransactions,
    mockSharedExpenses,
    mockMetas,
    mockBudgets,
    mockCategorias,
    mockSubcategorias,
    mockCartoes,
    mockTags
};
