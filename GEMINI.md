# CONTEXTO DO PROJETO

Este é um sistema financeiro pessoal já existente e funcional.

O projeto foi originalmente desenvolvido com auxílio de IA, com HTML, CSS e JavaScript concentrados principalmente em um index.html.

Tecnologias atualmente conhecidas:
- HTML
- CSS
- JavaScript
- Supabase
- Chart.js
- Git/GitHub

O Supabase é utilizado para banco de dados e autenticação.

# PERFIL DO USUÁRIO

O proprietário do projeto não possui conhecimento de programação.

Portanto:
- explique alterações em português e em linguagem simples;
- não presuma conhecimento técnico;
- explique termos técnicos quando forem necessários;
- informe claramente quando uma ação apresenta risco;
- não peça que o usuário edite código manualmente quando o agente puder realizar a alteração com segurança;
- nunca esconda erros ou consequências importantes atrás de explicações excessivamente técnicas.

# REGRA PRINCIPAL

Preserve as funcionalidades existentes.

Nunca reescreva, remova, simplifique ou substitua uma funcionalidade existente apenas porque outra implementação parece melhor.

Antes de mudanças estruturais, analise os impactos sobre o restante do sistema.

# DESENVOLVIMENTO

Trabalhe em pequenas etapas.

Nunca tente "melhorar tudo" de uma vez.

Para cada tarefa:
1. analise o estado atual;
2. identifique os arquivos e partes afetadas;
3. explique o problema em linguagem simples;
4. proponha uma solução;
5. informe os riscos;
6. aguarde aprovação quando a mudança for relevante;
7. implemente somente o escopo aprovado;
8. teste a alteração;
9. verifique possíveis regressões;
10. informe exatamente o que mudou.

# GIT

A branch main deve ser considerada a versão estável.

O desenvolvimento deve ocorrer na branch dev ou em branches específicas criadas a partir dela quando isso for apropriado.

Nunca:
- faça alterações diretamente na main sem autorização explícita;
- faça merge na main sem autorização explícita;
- faça force push;
- faça push para o GitHub sem autorização explícita;
- abra ou faça merge de Pull Requests sem autorização explícita;
- apague branches;
- reescreva histórico Git.

Antes de alterações importantes, confirme que o diretório de trabalho está limpo.

Use commits pequenos e descritivos quando commits forem solicitados ou aprovados.

# SUPABASE E BANCO DE DADOS

Considere alterações no banco de dados como operações de alto risco.

Nunca execute automaticamente:
- DROP TABLE;
- DELETE em massa;
- TRUNCATE;
- remoção de colunas;
- alteração destrutiva de tipos;
- remoção de políticas RLS;
- alterações destrutivas de dados.

Não execute migrations, SQL ou alterações de políticas diretamente no Supabase sem aprovação explícita, mesmo quando a alteração não for destrutiva.

Antes de qualquer alteração de schema, RLS ou dados:
1. explique o que será alterado;
2. mostre o SQL proposto;
3. explique o SQL em linguagem simples;
4. explique possíveis riscos;
5. aguarde aprovação explícita.

Nunca exponha chaves secretas, service_role keys, senhas, tokens ou outras credenciais.

# SEGURANÇA

Cada usuário do sistema deve acessar somente os dados que possui autorização para acessar.

Não considere filtros executados apenas no frontend como substitutos para segurança no banco de dados.

Mudanças relacionadas a autenticação, autorização ou RLS devem receber atenção especial.

# DADOS FINANCEIROS

Trate regras financeiras como regras críticas.

Não altere silenciosamente cálculos relacionados a:
- receitas;
- despesas;
- investimentos;
- cartões;
- faturas;
- parcelas;
- recorrências;
- metas;
- saldo;
- patrimônio;
- gastos compartilhados.

Quando uma regra financeira não estiver clara, pergunte antes de decidir o comportamento.

# TESTES

Depois de uma alteração, teste especificamente a funcionalidade modificada.

Quando possível, também verifique se a alteração afetou funcionalidades relacionadas.

Não considere uma tarefa concluída apenas porque o código não apresenta erro de sintaxe.

# REFATORAÇÃO

Não divida ou reorganize o index.html apenas por preferência arquitetural.

A separação do projeto em múltiplos arquivos deverá ser realizada futuramente como uma tarefa específica, planejada e testada.

Não faça grandes refatorações junto com correções de bugs.

# COMUNICAÇÃO

Ao finalizar cada tarefa, apresente de forma simples:
- O que estava errado ou precisava melhorar
- O que foi alterado
- Quais arquivos foram alterados
- Se o banco de dados foi alterado
- Como foi testado
- Resultado dos testes
- Se existe algum risco ou pendência
- Qual seria o próximo passo recomendado

# PROTOCOLO DE INVESTIGAÇÃO E CORREÇÃO DE BUGS

Quando eu disser algo como:
- "Encontrei um bug"
- "Tem um erro"
- "Isso não está funcionando"
- "Corrija este problema"
- "Esse comportamento está estranho"

o agente deve seguir automaticamente este protocolo:

==================================================
1. ENTENDER O RELATO
==================================================

Extrair, quando disponíveis:
- onde ocorreu;
- o que o usuário fez;
- o que aconteceu;
- o que deveria acontecer;
- mensagem de erro;
- print/evidência.

Não exigir detalhes técnicos do usuário.
Se o relato já for suficiente, não fazer perguntas desnecessárias.

==================================================
2. INVESTIGAÇÃO PROGRESSIVA
==================================================

Priorizar velocidade.
NÃO começar lendo o projeto inteiro.

Começar pelo menor escopo plausível:
1. localizar a função/elemento diretamente relacionado;
2. seguir somente o fluxo relevante;
3. reproduzir o bug;
4. identificar a causa raiz;
5. ampliar a investigação somente se necessário.

Evitar:
- reler os mesmos arquivos;
- buscas globais repetidas;
- abrir módulos sem relação aparente;
- executar toda a suíte cedo demais.

==================================================
3. LIMITAR ESCOPO
==================================================

Corrigir estritamente o problema relatado.

NÃO transformar automaticamente um bug pequeno em:
- redesign;
- refatoração ampla;
- substituição global de comportamentos;
- nova funcionalidade;
- revisão completa do sistema.

Se perceber que uma correção maior/global seria melhor, primeiro explique ao usuário e peça autorização.

==================================================
4. CLASSIFICAR RISCO
==================================================

BAIXO:
- visual;
- texto;
- toast;
- botão isolado;
- estado local;
- comportamento pontual.

MÉDIO:
- formulário;
- catálogo;
- filtro;
- navegação;
- sincronização entre módulos.

ALTO:
- cálculo financeiro;
- faturas;
- parcelas;
- recorrências;
- dinheiro físico;
- metas;
- histórico;
- autenticação;
- RLS;
- Supabase;
- exclusões;
- merges;
- risco de perda/corrupção de dados.

A profundidade da investigação e dos testes deve ser proporcional ao risco.

==================================================
5. CAUSA RAIZ
==================================================

Não esconder o sintoma com workaround quando houver correção determinística.

Evitar soluções artificiais com:
- F5;
- reload;
- setTimeout;
- repetição de chamadas;

quando a causa raiz puder ser corrigida diretamente.

==================================================
6. MENOR CORREÇÃO SEGURA
==================================================

Depois de identificar a causa:
implementar a menor alteração possível.
Preservar comportamento não relacionado.
Não aproveitar a correção para "melhorar outras coisas".

==================================================
7. GIT
==================================================

Nunca desenvolver diretamente na main.

Antes da primeira alteração:
- verificar branch;
- verificar working tree.

Se estiver na main:
criar branch específica de hotfix a partir da main atualizada.
Exemplo: hotfix/descricao-curta

Se já existir branch específica do bug:
continuar nela.

Nunca sobrescrever alterações não relacionadas.

==================================================
8. SUPABASE
==================================================

Por padrão:
- NÃO modificar Supabase.
- NÃO executar migration.
- NÃO executar seed.
- NÃO executar RPC real de escrita.
- NÃO alterar dados reais para testar.

Consultas read-only podem ser usadas quando necessárias.

Se a correção exigir alteração real no banco:
PARAR e pedir autorização antes.

==================================================
9. TESTE DO BUG
==================================================

Sempre que tecnicamente razoável:
criar ou ajustar teste automatizado que reproduza o bug.
O teste deve validar exatamente o comportamento corrigido.
Não enfraquecer testes existentes apenas para obter verde.

==================================================
10. TESTES PROPORCIONAIS
==================================================

BUG BAIXO:
- teste específico;
- suíte relacionada se necessário.

BUG MÉDIO:
- teste específico;
- módulos afetados.

BUG ALTO:
- teste específico;
- módulos afetados;
- suíte completa antes de considerar pronto.

NÃO rodar automaticamente toda a suíte para todo bug pequeno.

==================================================
11. EVITAR CICLOS DESNECESSÁRIOS
==================================================

Não executar a mesma suíte repetidamente sem alteração relevante.
Não criar scripts temporários ou benchmarks se não forem necessários para o bug.
Se um teste falhar: investigar a causa específica antes de ampliar o escopo.

==================================================
12. PRESERVAR REGRAS CRÍTICAS
==================================================

Dar atenção especial para não quebrar:
- Competência de Faturas;
- Parcelamentos;
- Recorrências;
- Dinheiro Físico;
- Gastos Compartilhados;
- Metas;
- Previsão Financeira;
- Catálogos;
- Merge;
- Hash Routing;
- autenticação.

==================================================
13. RELATÓRIO CURTO
==================================================

Ao finalizar, responder objetivamente:

BUG:
CAUSA RAIZ:
CORREÇÃO:
ARQUIVOS ALTERADOS:
TESTES EXECUTADOS:
RESULTADO:
RISCO:
SUPABASE ALTERADO: SIM/NÃO
PENDÊNCIAS:
PRONTO PARA REVISÃO: SIM/NÃO

Evitar relatórios enormes para correções pequenas.

==================================================
14. NÃO PUBLICAR AUTOMATICAMENTE
==================================================

Após corrigir:
- NÃO fazer commit.
- NÃO fazer push.
- NÃO fazer merge.

Aguardar aprovação explícita do usuário.

==================================================
15. PRINCÍPIO CENTRAL
==================================================

Equilibrar:
SEGURANÇA + VELOCIDADE + MENOR ESCOPO.

Bug simples não deve gerar auditoria completa do projeto.
Bug financeiro/destrutivo não deve receber investigação superficial.
