# 📚 Documentação Técnica — Meu Dashboard Financeiro (Versão 5.0)

**Última Atualização:** 16/09/2026
**Status do Projeto:** Fase 5.0 (Pós-Hardening, Hotfixes 5-D/5-E e Validação Automatizada Completa)
**Branch Principal:** `main` (sincronizada com `origin/main`)
**Commit Canônico:** `b014db6`

---

## 1. Finalidade deste Documento

Este repositório documental consolida a arquitetura, modelo de dados, regras de negócio, diretrizes de segurança, esteira de testes e guias operacionais do projeto **"Meu Dashboard Financeiro"**.

Foi estruturado especificamente para servir como referência técnica fidedigna para:
* Retomada do projeto por desenvolvedores humanos ou agentes de IA;
* Diagnósticos determinísticos de problemas sem quebrar o histórico financeiro;
* Manutenção e evolução de funcionalidades com respeito estrito às invariantes contábeis;
* Auditorias de conformidade, segurança e integridade de dados;
* Base sólida para eventual preparação comercial ou empacotamento desktop/mobile.

> [!IMPORTANT]
> **Princípio da Fidelidade ao Código Real**: Toda a documentação contida nesta pasta reflete estritamente a implementação em produção no repositório. Nenhuma funcionalidade ou arquitetura hipotética foi introduzida.

---

## 2. Stack Tecnológica em Produção

| Camada | Tecnologia / Ferramenta | Detalhes de Implementação |
| :--- | :--- | :--- |
| **Frontend UI** | HTML5 Semântico, CSS3 Moderno, JavaScript (ES6+ Vanilla) | Single Page Application (SPA) baseada em Hash Routing, sem frameworks pesados (Zero-Build frontend para execução direta no navegador). |
| **Arquitetura Modular** | ES6 Modules (`import`/`export`) | Código desacoplado em camadas (`src/core`, `src/domain`, `src/services`, `src/store`), mantendo bridge de compatibilidade em `index.html`. |
| **Visualização de Dados** | Chart.js 4.x (via CDN) | Gráficos de rosca (despesas por categoria), barras (médias financeiras e comparativos) e linhas (evolução temporal). |
| **Mobile / PWA** | Web App Manifest + Service Worker | PWA instalável, cache offline de assets essenciais, touch targets >= 44px, safe-area insets e bottom navigation nativa. |
| **Backend as a Service** | Supabase (PostgreSQL 15+) | Autenticação (Supabase Auth), Row Level Security (RLS) estrito, RPCs transacionais PL/pgSQL e Triggers de coerência. |
| **Serverless Functions** | Supabase Edge Functions (Deno / TypeScript) | Operações administrativas críticas restritas que exigem elevação segura de privilégios (`admin-delete-user`). |
| **Suíte de Testes Unitários** | Node.js Test Runner Nativo (`node:test`) | 439 testes unitários puros, sem dependências externas de framework de teste, executados em < 1 segundo (checkpoint setembro/2026). |
| **Suíte de Testes E2E** | Playwright (`@playwright/test`) | 343 testes ponta a ponta simulando jornadas completas de usuário, viewport desktop e mobile, interceptação de rede e regressões de concorrência e filtros (checkpoint setembro/2026). |
| **Hospedagem e Deploy** | GitHub Pages + GitHub Actions | Deploy estático automatizado da branch `main`. |

---

## 3. Inventário Estrutural do Repositório

```text
meu-dashboard-financeiro/
├── index.html                      # Ponto de entrada SPA, templates de modais, layout responsivo e bridges
├── manifest.json                   # Manifesto PWA com metadados de instalação e ícones
├── sw.js                           # Service Worker para controle de cache e suporte offline
├── package.json                    # Scripts npm (test, test:unit, test:ui, test:report) e dependências dev
├── GEMINI.md                       # Protocolo operacional e diretrizes de IA para o projeto
├── docs/                           # Acervo de documentação
│   ├── technical/                  # Documentação técnica aprofundada (este diretório)
│   ├── manual/                     # Manual Visual do Usuário (capturas e guias passo a passo de uso)
│   ├── base-3-architecture.md      # Histórico da fundação arquitetural Base 3.0
│   ├── database-security.md        # Histórico de RLS e políticas de acesso
│   └── fase-3-5-settlement.md      # Especificação original da liquidação antecipada
├── src/                            # Código-fonte modularizado
│   ├── core/                       # Utilitários puros, sanitização XSS, formatação e datas locais
│   ├── domain/                     # Motores matemáticos determinísticos de regras de negócio
│   │   ├── analytics/              # Motor de médias financeiras e comparativo histórico
│   │   ├── cash/                   # Cálculo do saldo de dinheiro físico (espécie)
│   │   ├── competence/             # Resolução de competência civil vs fatura de cartão
│   │   ├── creditCard/             # Projeção de parcelas, faturas e saldo devedor
│   │   ├── creditSettlement/       # Motor canônico de liquidação antecipada (integral e parcial)
│   │   └── forecast/               # Projeção financeira futura de fluxo de caixa e saldo residual
│   ├── services/                   # Clientes de comunicação assíncrona com Supabase e Edge Functions
│   │   ├── adminService.js         # Gerenciamento de usuários, auditoria e backups
│   │   ├── authService.js          # Autenticação, recuperação de senha e sessão
│   │   ├── catalogsService.js      # CRUD e merge de categorias, subcategorias, cartões e tags
│   │   ├── creditSettlementService.js # Persistência de liquidações antecipadas
│   │   ├── metasService.js         # Gestão de orçamentos e limites por categoria
│   │   ├── schedulesService.js     # Regras de assinaturas recorrentes e agendamentos PIX
│   │   ├── supabaseClient.js       # Inicialização segura do cliente Supabase
│   │   └── transactionsService.js  # CRUD de despesas, receitas, investimentos e saques
│   └── store/                      # Estado compartilhado em memória
│       └── state.js                # Privacy mode, sync flags, filtros e seleções
├── supabase/                       # Infraestrutura de banco de dados
│   ├── functions/                  # Edge Functions Deno (admin-delete-user)
│   └── migrations/                 # Migrations SQL versionadas sequencialmente
└── tests/                          # Suítes de testes automatizados
    ├── fixtures/                   # Massa de dados sintética determinística para testes
    ├── helpers/                    # Helpers Playwright, setup de autenticação simulada e servidor local
    ├── unit/                       # Testes unitários puros executados com node:test
    └── *.spec.js                   # Especificações E2E estruturadas por domínio e jornada
```

---

## 4. Índice dos Documentos Técnicos

Para explorar os detalhes arquiteturais e operacionais, consulte os documentos dedicados:

1. [**Arquitetura do Sistema** (`architecture.md`)](architecture.md)
   Fluxo de dados ponta a ponta, SPA Hash Routing, separação entre módulos puros e `index.html`, bridges globais e ciclo de vida.
2. [**Modelo de Dados e Banco de Dados** (`database.md`)](database.md)
   Dicionário completo das tabelas, chaves primárias, relacionamentos, triggers de coerência, RPCs e estado do versionamento no Supabase.
3. [**Regras de Negócio Críticas** (`business-rules.md`)](business-rules.md)
   Invariantes que jamais podem ser violadas: tripla distinção contábil da liquidação antecipada, competência temporal, dinheiro vivo e status de agendamentos.
4. [**Segurança e Acesso** (`security.md`)](security.md)
   Políticas RLS, funções SECURITY DEFINER, controle de acesso (`has_app_access`, `is_admin`), Edge Functions e auditoria de hardening (Fases 5-A e 5-B).
5. [**Testes e Deploy** (`testing-and-deployment.md`)](testing-and-deployment.md)
   Como rodar testes unitários e Playwright, validações cruzadas, pipeline de CI/CD para GitHub Pages e matriz de verificação.
6. [**Manutenção e Guia Operacional** (`maintenance.md`)](maintenance.md)
   Diretrizes para manutenção futura, cuidados ao lidar com Supabase remoto, pendências conhecidas e boas práticas de preservação de dados.
