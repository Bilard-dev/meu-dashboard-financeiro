import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    getPrivacyMode,
    setPrivacyMode,
    togglePrivacyMode,
    getRoutingSync,
    setRoutingSync,
    getPendingRenameData,
    setPendingRenameData,
    clearPendingRenameData,
    getFilteredExtratoData,
    setFilteredExtratoData,
    getCustomInvestmentCategoryNames,
    addCustomInvestmentCategoryName,
    hasCustomInvestmentCategoryName,
    resetCustomInvestmentCategoryNames
} from '../../src/store/state.js';

describe('state — Privacy Mode', () => {
    beforeEach(() => {
        setPrivacyMode(false);
    });

    it('deve definir e recuperar o estado de privacidade com booleanos e truthy/falsy', () => {
        assert.equal(getPrivacyMode(), false);
        setPrivacyMode(true);
        assert.equal(getPrivacyMode(), true);
        setPrivacyMode(0);
        assert.equal(getPrivacyMode(), false);
        setPrivacyMode('truthy');
        assert.equal(getPrivacyMode(), true);
    });

    it('deve alternar o estado com togglePrivacyMode e retornar o novo valor', () => {
        assert.equal(getPrivacyMode(), false);
        const newState = togglePrivacyMode();
        assert.equal(newState, true);
        assert.equal(getPrivacyMode(), true);
        const secondState = togglePrivacyMode();
        assert.equal(secondState, false);
        assert.equal(getPrivacyMode(), false);
    });
});

describe('state — Routing Sync', () => {
    beforeEach(() => {
        setRoutingSync(false);
    });

    it('deve definir e recuperar a flag de sincronização de rota', () => {
        assert.equal(getRoutingSync(), false);
        setRoutingSync(true);
        assert.equal(getRoutingSync(), true);
        setRoutingSync(false);
        assert.equal(getRoutingSync(), false);
    });
});

describe('state — Pending Rename Data', () => {
    beforeEach(() => {
        clearPendingRenameData();
    });

    it('deve armazenar, recuperar e limpar dados de renomeação de catálogos', () => {
        assert.equal(getPendingRenameData(), null);

        const payload = { type: 'categoria', oldName: 'Alimentação', newName: 'Mercado' };
        setPendingRenameData(payload);
        assert.deepEqual(getPendingRenameData(), payload);

        clearPendingRenameData();
        assert.equal(getPendingRenameData(), null);
    });
});

describe('state — Filtered Extrato Data', () => {
    beforeEach(() => {
        setFilteredExtratoData([]);
    });

    it('deve armazenar e recuperar a lista filtrada de transações', () => {
        assert.deepEqual(getFilteredExtratoData(), []);

        const mockList = [{ id: 1, valor: 100 }, { id: 2, valor: 250 }];
        setFilteredExtratoData(mockList);
        assert.deepEqual(getFilteredExtratoData(), mockList);
    });

    it('deve garantir que entradas inválidas sejam normalizadas para array vazio', () => {
        setFilteredExtratoData(null);
        assert.deepEqual(getFilteredExtratoData(), []);
        setFilteredExtratoData('invalido');
        assert.deepEqual(getFilteredExtratoData(), []);
    });
});

describe('state — Custom Investment Categories', () => {
    beforeEach(() => {
        resetCustomInvestmentCategoryNames();
    });

    it('deve gerenciar conjunto de categorias customizadas de investimento', () => {
        const initialSet = getCustomInvestmentCategoryNames();
        assert.ok(initialSet instanceof Set);
        assert.equal(initialSet.size, 0);

        addCustomInvestmentCategoryName('criptomoedas');
        addCustomInvestmentCategoryName('renda fixa');

        assert.equal(hasCustomInvestmentCategoryName('criptomoedas'), true);
        assert.equal(hasCustomInvestmentCategoryName('renda fixa'), true);
        assert.equal(hasCustomInvestmentCategoryName('alimentacao'), false);

        resetCustomInvestmentCategoryNames();
        assert.equal(getCustomInvestmentCategoryNames().size, 0);
        assert.equal(hasCustomInvestmentCategoryName('criptomoedas'), false);
    });

    it('deve ignorar adições vazias ou nulas ao conjunto de investimentos', () => {
        addCustomInvestmentCategoryName('');
        addCustomInvestmentCategoryName(null);
        addCustomInvestmentCategoryName(undefined);
        assert.equal(getCustomInvestmentCategoryNames().size, 0);
    });
});
