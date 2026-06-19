# Auditoria completa do Ativelo

## Dados registrados

A tabela `audit_events` registra:

- organização;
- usuário;
- nome e e-mail;
- ação;
- tipo e ID do registro;
- valor anterior;
- valor novo;
- campos alterados;
- data e hora;
- endereço IP;
- navegador;
- origem da operação;
- request ID;
- metadados.

## Eventos automáticos

Triggers do PostgreSQL registram:

- criação;
- alteração;
- exclusão;
- mudança de status;
- mudança de responsável;
- mudança de localização;
- alteração de acessos.

As tabelas são conectadas dinamicamente apenas quando existem e possuem
`organization_id`.

## IP e origem

As mutações realizadas pelo Supabase recebem um request ID no cabeçalho
`X-Client-Info`.

Antes da mutação, o frontend envia o contexto ao Worker. O Worker registra:

- IP obtido por `CF-Connecting-IP`;
- navegador;
- método HTTP;
- recurso;
- origem;
- request ID.

O trigger relaciona esse contexto ao evento do banco.

Se o contexto não estiver disponível, o evento ainda será gravado, mas o IP
poderá aparecer como não disponível.

## Etiquetas

A impressão individual e em lote envia eventos explícitos ao Worker.

A primeira impressão é registrada como:

```text
label_printed
```

As seguintes são registradas automaticamente como:

```text
label_reprinted
```

Também são salvos:

- quantidade de cópias;
- tamanho;
- modo individual ou lote;
- total de etiquetas.

## Segurança

- `audit_events` é somente leitura para usuários autorizados;
- inserts diretos são bloqueados;
- updates e deletes são bloqueados;
- apenas proprietário, administrador, gestor de TI e auditor podem consultar;
- tokens, secrets, senhas e credenciais são redigidos;
- as funções de gravação validam autenticação e participação na organização;
- nenhuma service role é usada no navegador ou Worker.

## Central de histórico

O menu `Histórico do sistema` oferece:

- período;
- ação;
- tipo de registro;
- busca;
- detalhes antes e depois;
- IP e origem;
- exportação CSV.

## Publicação

Após a validação local, será necessário:

1. aplicar a migration no Supabase;
2. publicar o Worker;
3. enviar o frontend ao GitHub;
4. aguardar o Cloudflare Pages.
## Preservação do histórico

O histórico não é apagado automaticamente quando uma organização é excluída.
O identificador da organização permanece no evento para preservar a trilha
técnica e permitir futuras rotinas administrativas de retenção.