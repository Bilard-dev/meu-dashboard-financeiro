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
