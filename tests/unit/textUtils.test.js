import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeCatalogName,
    normalizeText,
    extractTagsFromDesc,
    buildDescWithTags
} from '../../src/core/textUtils.js';

describe('textUtils — normalizeCatalogName', () => {
    it('deve converter para minúsculas e remover espaços extras nas pontas', () => {
        assert.equal(normalizeCatalogName('  Alimentação  '), 'alimentação');
        assert.equal(normalizeCatalogName('INVESTIMENTOS'), 'investimentos');
    });

    it('deve colapsar múltiplos espaços em branco no meio do texto', () => {
        assert.equal(normalizeCatalogName('Mercado    Central'), 'mercado central');
        assert.equal(normalizeCatalogName('Cartão   de   Crédito   Black'), 'cartão de crédito black');
    });

    it('deve normalizar espaços não-quebráveis (NBSP / \\u00a0)', () => {
        assert.equal(normalizeCatalogName('Compras\u00a0Online'), 'compras online');
    });

    it('deve retornar string vazia para valores nulos, indefinidos, vazios ou não-string', () => {
        assert.equal(normalizeCatalogName(null), '');
        assert.equal(normalizeCatalogName(undefined), '');
        assert.equal(normalizeCatalogName(''), '');
        assert.equal(normalizeCatalogName('   '), '');
        assert.equal(normalizeCatalogName(123), '');
        assert.equal(normalizeCatalogName({}), '');
    });
});

describe('textUtils — normalizeText', () => {
    it('deve remover acentos e diacríticos', () => {
        assert.equal(normalizeText('Água'), 'agua');
        assert.equal(normalizeText('Café & Ação'), 'cafeacao');
        assert.equal(normalizeText('Promoção Épica'), 'promocaoepica');
    });

    it('deve remover pontuação e caracteres especiais, mantendo letras e números', () => {
        assert.equal(normalizeText('R$ 1.250,50 - PIX!'), 'r125050pix');
        assert.equal(normalizeText('[Tag] Descrição #123'), 'tagdescricao123');
    });

    it('deve retornar string vazia para valores nulos, indefinidos ou vazios', () => {
        assert.equal(normalizeText(null), '');
        assert.equal(normalizeText(undefined), '');
        assert.equal(normalizeText(''), '');
    });
});

describe('textUtils — extractTagsFromDesc', () => {
    it('deve extrair uma única tag ancorada no início entre colchetes', () => {
        assert.deepEqual(extractTagsFromDesc('[Mercado] Compras da semana'), ['Mercado']);
    });

    it('deve extrair múltiplas tags separadas por vírgula', () => {
        assert.deepEqual(
            extractTagsFromDesc('[Mercado, Essencial, Família] Compras da semana'),
            ['Mercado', 'Essencial', 'Família']
        );
    });

    it('deve ignorar espaços em branco extras dentro dos colchetes de tags', () => {
        assert.deepEqual(
            extractTagsFromDesc('[  Lazer  ,   Viagem   ] Passagem aérea'),
            ['Lazer', 'Viagem']
        );
    });

    it('deve retornar array vazio quando não houver tags no início', () => {
        assert.deepEqual(extractTagsFromDesc('Compras da semana sem tags'), []);
    });

    it('deve preservar colchetes legítimos no meio/fim do texto sem considerá-los tags', () => {
        assert.deepEqual(extractTagsFromDesc('Livro [Edição Especial 2026]'), []);
        assert.deepEqual(extractTagsFromDesc('Curso [Módulo 1] Aula 2'), []);
    });

    it('deve extrair a tag inicial e NÃO capturar colchetes legítimos subsequentes', () => {
        assert.deepEqual(
            extractTagsFromDesc('[Lazer] Jogo [Edição de Colecionador]'),
            ['Lazer']
        );
    });

    it('deve retornar array vazio para descrições nulas, vazias ou indefinidas', () => {
        assert.deepEqual(extractTagsFromDesc(null), []);
        assert.deepEqual(extractTagsFromDesc(undefined), []);
        assert.deepEqual(extractTagsFromDesc(''), []);
        assert.deepEqual(extractTagsFromDesc('[] Sem tag dentro'), []);
    });
});

describe('textUtils — buildDescWithTags', () => {
    it('deve adicionar tags a uma descrição limpa', () => {
        const result = buildDescWithTags('Compras da semana', 'Mercado, Essencial');
        assert.equal(result, '[Mercado, Essencial] Compras da semana');
    });

    it('deve substituir tags existentes sem duplicar colchetes no início', () => {
        const result = buildDescWithTags('[TagAntiga] Compras da semana', 'NovaTag');
        assert.equal(result, '[NovaTag] Compras da semana');
    });

    it('deve remover prefixo de tags se a string de tags estiver vazia', () => {
        const result = buildDescWithTags('[TagAntiga] Compras da semana', '');
        assert.equal(result, 'Compras da semana');
        assert.equal(buildDescWithTags('[TagAntiga] Compras', '   '), 'Compras');
    });

    it('deve preservar colchetes legítimos no corpo da descrição ao atualizar tags', () => {
        const result = buildDescWithTags('Livro [Edição Especial]', 'Cultura');
        assert.equal(result, '[Cultura] Livro [Edição Especial]');
    });

    it('deve preservar colchetes legítimos ao substituir uma tag existente', () => {
        const result = buildDescWithTags('[Lazer] Jogo [Edição de Colecionador]', 'Games');
        assert.equal(result, '[Games] Jogo [Edição de Colecionador]');
    });

    it('deve limpar espaços em branco das tags fornecidas', () => {
        const result = buildDescWithTags('Item', '  TagA  ,   TagB  ');
        assert.equal(result, '[TagA, TagB] Item');
    });

    it('deve tratar adequadamente descrição base nula ou vazia', () => {
        assert.equal(buildDescWithTags('', 'Mercado'), '[Mercado] ');
        assert.equal(buildDescWithTags(null, 'Mercado'), '[Mercado] ');
        assert.equal(buildDescWithTags(null, null), '');
    });
});
