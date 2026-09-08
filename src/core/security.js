/**
 * Utilitários de Segurança e Sanitização — Base 3.0
 * Módulo ES6 desacoplado de DOM, Supabase e Estado Global.
 */

/**
 * Sanitiza strings para prevenir vulnerabilidades XSS ao interpolar HTML.
 * @param {any} str 
 * @returns {string}
 */
export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Valida se a senha informada atende aos requisitos de segurança:
 * - Mínimo de 8 caracteres
 * - Pelo menos 1 letra maiúscula
 * - Pelo menos 1 número
 * - Pelo menos 1 caractere especial (!@#$%^&*)
 * @param {string} password 
 * @returns {boolean}
 */
export function isStrongPassword(password) {
    const strongRegex = new RegExp("^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{8,})");
    return strongRegex.test(password);
}
