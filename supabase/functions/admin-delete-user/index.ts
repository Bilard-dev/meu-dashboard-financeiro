// supabase/functions/admin-delete-user/index.ts
// Fase 4.5-C5-E.1: Exclusão Permanente e Segura de Conta de Usuário
// Arquitetura Canônica: Supabase Auth Admin deleteUser como operação primária
// Ambiente: Deno / Supabase Edge Functions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (req: Request) => {
  // 1. Tratamento de CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método HTTP não permitido. Utilize POST." }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("[admin-delete-user] Configurações de ambiente ausentes no servidor.");
      return new Response(
        JSON.stringify({ error: "Configuração do servidor de autenticação incompleta." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Validação do cabeçalho de Autorização (JWT do Admin requisitante)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Token de autenticação ausente ou inválido." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    // Cliente no contexto do requisitante para validação de JWT e autorização RLS
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user: callerUser }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !callerUser) {
      console.error("[admin-delete-user] Falha na validação do token:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Sessão inválida ou expirada." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Verificação de privilégios de Administrador
    const { data: isAdmin, error: adminError } = await userClient.rpc("is_admin");
    if (adminError || !isAdmin) {
      return new Response(
        JSON.stringify({ error: "Acesso negado. Apenas administradores podem executar esta operação." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Leitura e validação do corpo da requisição (estritamente target_user_id)
    let body: { target_user_id?: string } = {};
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Corpo da requisição JSON inválido." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const targetUserId = String(body?.target_user_id || "").trim();
    if (!targetUserId || !UUID_REGEX.test(targetUserId)) {
      return new Response(
        JSON.stringify({ error: "Identificador do usuário alvo inválido ou ausente." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. Bloqueio estrito de auto-exclusão
    if (targetUserId === callerUser.id) {
      return new Response(
        JSON.stringify({ error: "Operação não permitida sobre a própria conta de administrador." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 6. Validação e captura de identidade mínima via RPC segura (NÃO apaga dados)
    const { data: rpcData, error: rpcError } = await userClient.rpc("admin_prepare_user_deletion", {
      p_target_user_id: targetUserId,
    });

    if (rpcError) {
      console.warn("[admin-delete-user] Validação rejeitada por admin_prepare_user_deletion:", rpcError.message);
      const code = rpcError.code;
      const msg = rpcError.message || "Falha na preparação da exclusão do usuário.";

      if (code === "42501" || msg.includes("não permitida") || msg.includes("Acesso negado")) {
        return new Response(
          JSON.stringify({ error: msg }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (code === "P0002" || msg.includes("não encontrado")) {
        return new Response(
          JSON.stringify({ error: msg }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({ error: "Falha na validação do usuário para exclusão." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Identidade do usuário capturada server-side (NUNCA confiada ao frontend)
    const targetEmail = rpcData?.target_email || "sem-email@removido.local";
    const targetDisplayName = rpcData?.display_name || null;

    // 7. OPERAÇÃO CANÔNICA DE EXCLUSÃO: Supabase Auth Admin deleteUser
    // Se esta chamada falhar, nenhum dado financeiro ou perfil foi apagado,
    // garantindo que não haja destruição parcial de dados.
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(targetUserId);

    if (deleteAuthError) {
      console.error("[admin-delete-user] Falha em auth.admin.deleteUser:", deleteAuthError.message);
      return new Response(
        JSON.stringify({ error: "Falha ao remover o usuário da base de autenticação. Os dados do usuário foram preservados." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Com o sucesso da exclusão em auth.users, as chaves estrangeiras com ON DELETE CASCADE
    // eliminam atomicamente todos os dados em public (transacoes, liquidacoes, metas, cartoes,
    // categorias, subcategorias, tags, snapshots e perfil).

    // 8. Gravação pós-sucesso da auditoria imutável em admin_audit_logs
    // Realizada exclusivamente APÓS a confirmação de sucesso do Auth Admin deleteUser.
    let auditWarning: string | null = null;
    try {
      const { error: auditError } = await adminClient.from("admin_audit_logs").insert({
        admin_user_id: callerUser.id,
        target_user_id: targetUserId,
        target_email: targetEmail,
        action: "USER_ACCOUNT_DELETED",
        metadata: {
          deleted_at: new Date().toISOString(),
          display_name: targetDisplayName,
          cascade_cleanup: true,
          source: "auth_admin_canonical_deletion"
        }
      });

      if (auditError) {
        console.error("[admin-delete-user] AVISO: Usuário excluído com sucesso do Auth, mas falhou ao gravar admin_audit_logs:", auditError.message);
        auditWarning = "A conta foi removida com sucesso, mas houve falha na gravação do registro de auditoria.";
      }
    } catch (auditExc: unknown) {
      console.error("[admin-delete-user] Exceção ao gravar admin_audit_logs pós-deleção:", auditExc);
      auditWarning = "A conta foi removida com sucesso, mas ocorreu uma exceção no registro de auditoria.";
    }

    // 9. Resposta de sucesso segura e sanitizada
    return new Response(
      JSON.stringify({
        success: true,
        message: "Conta de usuário excluída permanentemente com sucesso.",
        ...(auditWarning ? { audit_warning: auditWarning } : {})
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin-delete-user] Exceção não tratada:", errorMsg);
    return new Response(
      JSON.stringify({ error: "Erro interno no processamento da exclusão de conta." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
