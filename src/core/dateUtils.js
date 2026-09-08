/**
 * Utilitários Puros de Datas e Competências — Base 3.0
 * Módulo ES6 desacoplado de DOM, Supabase e Estado Global.
 */

export const MONTH_NAMES_BR = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/**
 * Adiciona (ou subtrai) meses a uma competência, calculando a virada de ano.
 * @param {number} year 
 * @param {number} month Base 0 (0 = Jan, 11 = Dez)
 * @param {number} offset Quantidade de meses a avançar/recuar
 * @returns {{ year: number, month: number }}
 */
export function addMonths(year, month, offset) {
    const d = new Date(year, month + offset, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
}

/**
 * Faz o parse seguro de uma string 'YYYY-MM-DD' fixando o horário às 12:00:00 (meio-dia local)
 * para evitar deslocamentos de data causados por timezone (GMT-3).
 * @param {string} dateStr 
 * @returns {Date | null}
 */
export function parseLocalDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const cleanStr = dateStr.split('T')[0];
    const d = new Date(cleanStr + 'T12:00:00');
    return isNaN(d.getTime()) ? null : d;
}
