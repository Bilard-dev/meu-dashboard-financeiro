/**
 * Cliente Supabase Centralizado — Base 3.0
 * Instância única do cliente Supabase para toda a aplicação.
 */

export const SUPABASE_URL = 'https://zrlkexqogahoeryqkeyr.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpybGtleHFvZ2Fob2VyeXFrZXlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1NDkzMzcsImV4cCI6MjEwMjEyNTMzN30.ZKx2BYKAt4HrfAIyROr115I0uMvKdQcZqdZ4Yfuvvt8';

// Obtém o construtor do SDK carregado via CDN no ambiente do navegador
const globalSupabase = typeof window !== 'undefined' && window.supabase
    ? window.supabase
    : (typeof supabase !== 'undefined' ? supabase : null);

if (!globalSupabase || typeof globalSupabase.createClient !== 'function') {
    throw new Error('SDK do Supabase (@supabase/supabase-js) não encontrado no ambiente global.');
}

export const supabaseClient = globalSupabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export default supabaseClient;
