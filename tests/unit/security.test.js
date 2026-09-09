import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    escapeHtml,
    isStrongPassword
} from '../../src/core/security.js';

describe('security — escapeHtml', () => {
    it('deve escapar os 5 caracteres HTML sensíveis (&, <, >, ", \')', () => {
        assert.equal(escapeHtml('&'), '&amp;');
        assert.equal(escapeHtml('<'), '&lt;');
        assert.equal(escapeHtml('>'), '&gt;');
        assert.equal(escapeHtml('"'), '&quot;');
        assert.equal(escapeHtml("'"), '&#039;');
    });

    it('deve sanitizar payloads comuns de XSS', () => {
        const xss1 = '<script>alert("XSS")</script>';
        assert.equal(escapeHtml(xss1), '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');

        const xss2 = '<img src=x onerror="alert(\'XSS\')">';
        assert.equal(escapeHtml(xss2), '&lt;img src=x onerror=&quot;alert(&#039;XSS&#039;)&quot;&gt;');
    });

    it('deve converter números e outros tipos primitivos para string segura', () => {
        assert.equal(escapeHtml(12345), '12345');
        assert.equal(escapeHtml(true), 'true');
    });

    it('deve retornar string vazia para valores falsy (null, undefined, vazio)', () => {
        assert.equal(escapeHtml(null), '');
        assert.equal(escapeHtml(undefined), '');
        assert.equal(escapeHtml(''), '');
    });
});

describe('security — isStrongPassword', () => {
    it('deve aprovar senhas válidas com 8+ caracteres, maiúscula, número e caractere especial', () => {
        assert.equal(isStrongPassword('MinhaSenha@2026'), true);
        assert.equal(isStrongPassword('Abc123!@'), true);
        assert.equal(isStrongPassword('P@ssw0rdSecure'), true);
    });

    it('deve testar e aprovar cada um dos caracteres especiais suportados (!@#$%^&*)', () => {
        assert.equal(isStrongPassword('Senha123!'), true);
        assert.equal(isStrongPassword('Senha123@'), true);
        assert.equal(isStrongPassword('Senha123#'), true);
        assert.equal(isStrongPassword('Senha123$'), true);
        assert.equal(isStrongPassword('Senha123%'), true);
        assert.equal(isStrongPassword('Senha123^'), true);
        assert.equal(isStrongPassword('Senha123&'), true);
        assert.equal(isStrongPassword('Senha123*'), true);
    });

    it('deve reprovar senhas com menos de 8 caracteres, mesmo que atendam outros critérios', () => {
        assert.equal(isStrongPassword('Ab1!cd'), false); // 6 chars
        assert.equal(isStrongPassword('Senha1!'), false); // 7 chars
    });

    it('deve reprovar senhas sem letra maiúscula', () => {
        assert.equal(isStrongPassword('minhasenha@2026'), false);
        assert.equal(isStrongPassword('abc123!@'), false);
    });

    it('deve reprovar senhas sem número', () => {
        assert.equal(isStrongPassword('MinhaSenha@ABC'), false);
        assert.equal(isStrongPassword('Abcdefg!@#'), false);
    });

    it('deve reprovar senhas sem caractere especial', () => {
        assert.equal(isStrongPassword('MinhaSenha2026'), false);
        assert.equal(isStrongPassword('Abcdefgh1234'), false);
    });

    it('deve reprovar entradas vazias ou nulas', () => {
        assert.equal(isStrongPassword(''), false);
        assert.equal(isStrongPassword(null), false);
        assert.equal(isStrongPassword(undefined), false);
    });
});
