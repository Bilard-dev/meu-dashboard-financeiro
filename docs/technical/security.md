# 🛡️ Diretrizes de Segurança e Arquitetura de Proteção

**Versão:** 5.0
**Data:** 16/09/2026
**Auditoria de Referência:** Fase 5-A e Fase 5-B (Security Hardening Final)

---

## 1. Visão Geral da Camada de Segurança

A segurança do **Meu Dashboard Financeiro** baseia-se no princípio da **Defesa em Profundidade** (*Defense in Depth*), distribuindo garantias de proteção entre frontend, transporte, autenticação, controle de acesso e regras em nível de banco de dados.

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Frontend (Navegador do Usuário)                         │
│    - Sanitização XSS com escapeHtml()                       │
│    - Validação de força de senha no cadastro (isStrongPass) │
│    - Exposição restrita: apenas chave anon (pública)        │
│    - Ausência absoluta de service_role no código cliente    │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / WSS com JWT
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Supabase Auth & Gate de Acesso                           │
│    - Sessões baseadas em JWT criptográfico                  │
│    - Access Gate (has_app_access() e status approved)       │
│    - Verificação de privilégios de Admin (is_admin())       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
┌─────────────────────────────────────────────────────────────┐
│ 3. Banco de Dados PostgreSQL 15 (Supabase)                  │
│    - Row Level Security (RLS) habilitado em todas as tabelas│
│    - Ownership estrito e Access Gate por classe operacional │
│    - Funções SECURITY DEFINER com validação server-side     │
│    - search_path fixo (pg_catalog, public, pg_temp)         │
│    - Trilha de auditoria indelével (admin_audit_logs)       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Operações de Infraestrutura Segura                       │
│    - Edge Function admin-delete-user com service_role       │
│      isolada exclusivamente no servidor Deno                │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Autenticação e Gestão de Sessão (Supabase Auth)

1. **Tokens JWT**: Cada requisição de usuário trafega o cabeçalho `Authorization: Bearer <JWT>`, emitido e assinado pelo Supabase Auth.
2. **Access Gate (`has_app_access`)**:
   * O sistema implementa uma camada intermediária de aprovação de novos registros.
   * A função `public.has_app_access()` verifica na tabela `user_profiles` se o status é `approved` ou se o usuário é membro de `admin_users`.
   * Usuários com status `pending`, `suspended` ou `rejected` têm suas requisições contidas no banco de dados e visualizam tela informativa de contenção.
3. **Validação de Senha (`isStrongPassword`)**:
   * O frontend e as políticas de cadastro exigem no mínimo: 8 caracteres, pelo menos 1 letra maiúscula, 1 minúscula, 1 número e 1 caractere especial.

---

## 3. Isolamento por Row Level Security (RLS) por Classes de Tabelas

O banco de dados não confia em filtros enviados pelo cliente. Toda consulta, inserção, alteração ou exclusão é avaliada contra a identidade criptográfica do usuário (`auth.uid()`):

### 3.1. Classe de Dados Financeiros e Catálogos de Usuário
Para tabelas que contêm lançamentos financeiros e catálogos pessoais (`transacoes`, `liquidacoes_credito`, `app_categorias`, `app_subcategorias`, `app_cartoes`, `app_tags`, `metas`, `agendamentos_financeiros` e `agendamento_ocorrencias`):
* **Filtro de Isolamento Efetivo**: `(user_id = auth.uid() AND public.has_app_access())`.
* **Condição de Escrita e Leitura**: Além de garantir que o registro pertença exclusivamente ao usuário autenticado (`user_id = auth.uid()`), o RLS avalia a função `public.has_app_access()`. Caso o perfil esteja com status `pending`, `suspended` ou `rejected`, o acesso aos dados é negado em nível de banco de dados, independentemente de qualquer filtro no frontend.

### 3.2. Classe de Perfis, Acesso e Tabelas Administrativas
* **`public.user_profiles`**:
  * **SELECT**: Aberto estritamente para o próprio usuário (`user_id = auth.uid()`). A listagem para administração é executada através da RPC segura e auditada `admin_list_users()`.
  * **INSERT / UPDATE / DELETE**: Escrita direta de clientes bloqueada via RLS (`deny_all`). O provisionamento ocorre via trigger no signup (`handle_new_user_profile`) ou pela RPC `complete_legacy_profile(p_display_name)`, e as alterações de status são exclusivas da RPC administrativa `admin_set_user_access()`.
* **`public.admin_users`**:
  * **Acesso Direto**: Totalmente bloqueado para clientes (`deny_all`). A verificação de privilégios ocorre exclusivamente no backend via função canônica SECURITY DEFINER `public.is_admin()`.
* **`public.admin_audit_logs`**:
  * **Acesso Direto**: Totalmente bloqueado para clientes via RLS (Fail-Closed sem policies diretas). As inserções ocorrem exclusivamente a partir das RPCs administrativas seguras. Bloqueio absoluto contra alterações ou exclusões (`UPDATE`/`DELETE` inexistentes).
* **`public.user_data_resets`**:
  * **Acesso Direto**: Totalmente bloqueado para clientes via RLS (Fail-Closed). Manipulação restrita internamente pelas RPCs `admin_reset_user_data()`, `admin_restore_user_data()` e pela rotina de expurgo `admin_purge_expired_user_resets()`.

---

## 4. Governança de Funções `SECURITY DEFINER` e Hardening da Fase 5-B

Funções marcadas com `SECURITY DEFINER` rodam com os privilégios do usuário criador (postgres/superuser), permitindo ultrapassar restrições de RLS quando estritamente necessário. Na Auditoria da Fase 5-A e Hardening da Fase 5-B, essas funções foram analisadas e catalogadas em três classes operacionais:

### 4.1. Classes de Funções `SECURITY DEFINER`
1. **Classe A — Operações de Domínio do Usuário Autenticado**:
   * Exemplos: `merge_categories`, `merge_subcategories`, `merge_cards`, `merge_tags`, `confirmar_agendamento_ocorrencia`, `cancelar_agendamento_ocorrencia`, `complete_legacy_profile`, `has_app_access`, `is_admin`.
   * **Política**: Devem manter permissão `EXECUTE` para a role `authenticated`. O isolamento é garantido internamente no corpo da função via checagem de ownership (`user_id = auth.uid()`) ou verificação de `has_app_access()`.
2. **Classe B — RPCs Administrativas**:
   * Exemplos: `admin_list_users`, `admin_set_user_access`, `admin_get_activity_metrics`, `admin_get_activity_summary`, `admin_reset_user_data`, `admin_restore_user_data`, `admin_get_user_reset_status`, `admin_log_password_reset_request`, `admin_prepare_user_deletion`.
   * **Política**: Mantêm `EXECUTE` para `authenticated`, mas o controle de acesso é validado server-side na primeira instrução do corpo da função:
     ```sql
     IF NOT public.is_admin() THEN
         RAISE EXCEPTION 'Acesso negado: privilégios insuficientes.' USING ERRCODE = '42501';
     END IF;
     ```
     > [!IMPORTANT]
     > Revogar `EXECUTE` indiscriminadamente de `authenticated` nessas funções quebra a Central Administrativa.
3. **Classe C — Rotinas Internas e de Manutenção em Lote**:
   * Exemplo: `admin_purge_expired_user_resets`.
   * **Política**: Não devem ser executadas diretamente por clientes. Seu privilégio `EXECUTE` foi revogado explicitamente de `PUBLIC`, `anon` e `authenticated`, ficando restrito a `postgres` e `service_role` (para execução interna ou pg_cron).

### 4.2. Correções Aplicadas na Migration `20260916120000_fase5b_security_hardening.sql`:

1. **Restrição Específica em `admin_purge_expired_user_resets`**:
   ```sql
   REVOKE EXECUTE ON FUNCTION public.admin_purge_expired_user_resets() FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.admin_purge_expired_user_resets() TO postgres, service_role;
   ```
2. **Fixação Canônica de `search_path` em Triggers**:
   * Funções de trigger executadas pelo PostgreSQL podem ser vulneráveis a sequestro de caminho se o `search_path` for mutável.
   * **Ação**: Foram alteradas para fixar caminho explícito e canônico:
   ```sql
   ALTER FUNCTION public.handle_liquidacoes_credito_updated_at() SET search_path = pg_catalog, public, pg_temp;
   ALTER FUNCTION public.handle_liquidacoes_credito_validate_coherence() SET search_path = pg_catalog, public, pg_temp;
   ```

---

## 5. Exclusão Administrativa Segura (Edge Function)

A exclusão física de contas de usuário exige interação direta com a API interna do Supabase Auth (`auth.admin.deleteUser`).

1. **Princípio do Menor Privilégio no Frontend**:
   * O código que roda no navegador possui **exclusivamente** a chave pública `anonKey`.
   * A chave mestra com privilégios totais (`service_role`) **jamais** é exposta ou enviada ao frontend.
2. **Edge Function `admin-delete-user`**:
   * Localizada em `supabase/functions/admin-delete-user/index.ts`.
   * Executada em ambiente isolado Deno.
   * **Fluxo de Verificação**:
     1. Extrai o JWT do cabeçalho `Authorization: Bearer <token>`.
     2. Valida a sessão via `auth.getUser(token)`.
     3. Executa a RPC `is_admin()` sob o token do chamador para garantir que quem chamou é um administrador.
     4. Bloqueia auto-exclusão (`callerUser.id === target_user_id`).
     5. Apenas após todas as validações, utiliza o cliente com `SUPABASE_SERVICE_ROLE_KEY` para remover o usuário do `auth.users`, disparando `CASCADE` nas tabelas filhas.
     6. Registra log em `admin_audit_logs`.

---

## 6. Prevenção de XSS no Frontend (`src/core/security.js`)

Toda e qualquer informação de entrada de usuário (nomes de categorias, descrições, tags, cartões, e-mails e mensagens de erro) passa obrigatoriamente pela função `escapeHtml(str)` antes de ser interpolada no DOM:

```javascript
export function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
```

Essa sanitização determinística foi auditada e validada, impedindo a injeção de scripts maliciosos através de nomes de transações ou catálogos importados.
