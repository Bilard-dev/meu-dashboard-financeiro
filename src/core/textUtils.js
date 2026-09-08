/**
 * Utilitários Puros de Texto, Strings e Tags — Base 3.0
 * Módulo ES6 desacoplado de DOM, Supabase e Estado Global.
 */

/**
 * Normaliza nomes de catálogos (categorias, subcategorias, cartões, tags)
 * removendo espaços extras e convertendo para minúsculas para comparações consistentes.
 * @param {string} str 
 * @returns {string}
 */
export function normalizeCatalogName(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/[\u00a0\s]+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * Normaliza textos para buscas no extrato e investimentos
 * removendo acentos, pontuações e convertendo para minúsculas.
 * @param {string} str 
 * @returns {string}
 */
export function normalizeText(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

/**
 * Extrai tags ancoradas no início de uma descrição no padrão "[Tag1, Tag2] Descrição".
 * Preserva colchetes legítimos que não estejam no início.
 * @param {string} desc 
 * @returns {string[]}
 */
export function extractTagsFromDesc(desc) {
    if (!desc) return [];
    const match = desc.match(/^\s*\[(.*?)\]/);
    if (!match) return [];
    return match[1].split(',').map(t => t.trim()).filter(t => t.length > 0);
}

/**
 * Constrói a descrição final formatada com prefixo de tags "[Tag1, Tag2] Descrição".
 * Remove prefixos de tags anteriores para evitar duplicações e preserva colchetes legítimos da descrição.
 * @param {string} baseDesc 
 * @param {string} tagsInput 
 * @returns {string}
 */
export function buildDescWithTags(baseDesc, tagsInput) {
    let cleanDesc = (baseDesc || '').replace(/^\s*\[(.*?)\]\s*/, '').trim();
    if (!tagsInput || tagsInput.trim() === '') return cleanDesc;

    const formattedTags = tagsInput.split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)
        .join(', ');

    return formattedTags ? `[${formattedTags}] ${cleanDesc}` : cleanDesc;
}
