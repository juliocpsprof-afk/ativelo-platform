# Comunicação, convites e estabilidade móvel

## 1. Aviso da API segura

O aviso de sucesso:

```text
API segura conectada
```

agora desaparece automaticamente após 3,5 segundos.

Também possui botão de fechamento. O aviso não bloqueia cliques na tela.

Erros de autenticação ou indisponibilidade continuam visíveis para que o usuário
possa tentar novamente ou fechar o aviso.

## 2. Por que o e-mail está pendente

A Edge Function `invite-organization-user` procura estes secrets:

```text
RESEND_API_KEY
RESEND_FROM_EMAIL
APP_BASE_URL
```

Sem os dois primeiros, o painel mostra o e-mail como não configurado.

## 3. Criar a conta no Resend

1. Acesse o painel do Resend.
2. Crie uma conta.
3. Confirme o e-mail da conta.
4. Abra `Domains`.
5. Adicione um domínio que pertença à empresa.
6. Cadastre no provedor DNS os registros mostrados pelo Resend.
7. Aguarde o domínio aparecer como `Verified`.

Para produção, use preferencialmente um subdomínio:

```text
mail.seudominio.com.br
```

ou:

```text
convites.seudominio.com.br
```

Não use um endereço Gmail como remetente do Resend.

## 4. Criar a API key

No Resend:

```text
API Keys
→ Create API Key
```

Nome sugerido:

```text
Ativelo Production
```

Permissão recomendada:

```text
Sending access
```

Restrinja ao domínio verificado quando essa opção estiver disponível.

Copie a chave uma única vez. Ela começa normalmente com:

```text
re_
```

Nunca grave essa chave em arquivos do frontend ou no GitHub.

## 5. Escolher o remetente

Depois que o domínio estiver verificado, escolha um endereço no domínio:

```text
convites@seudominio.com.br
```

O secret deve receber somente o endereço, sem o nome:

```text
RESEND_FROM_EMAIL=convites@seudominio.com.br
```

O nome apresentado ao destinatário já é montado pela própria função do Ativelo.

## 6. Cadastrar os secrets no Supabase

No projeto do Supabase:

```text
Edge Functions
→ Secrets
```

Adicione:

```text
RESEND_API_KEY=re_SUA_CHAVE
```

```text
RESEND_FROM_EMAIL=convites@seudominio.com.br
```

```text
APP_BASE_URL=https://ativelo-platform.pages.dev
```

Salve.

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já são disponibilizadas
automaticamente às Edge Functions hospedadas pelo Supabase. A service role não
deve ser copiada para o frontend.

## 7. Confirmar a função publicada

No Supabase:

```text
Edge Functions
→ invite-organization-user
```

Confirme que a função está publicada.

O código local fica em:

```text
supabase/functions/invite-organization-user/index.ts
```

Quando o código local mudar, a função precisará ser publicada novamente.

## 8. Testar o e-mail

No Ativelo:

```text
Configurações
→ Comunicação e convites
```

Atualize a página.

O cartão deve mudar de:

```text
Pendente
```

para:

```text
Ativo
```

Depois clique:

```text
Enviar teste para meu e-mail
```

Primeiro envie para o mesmo e-mail usado na conta do Resend. Depois teste um
convite real.

## 9. Limitação do domínio de teste

O remetente de teste do Resend:

```text
onboarding@resend.dev
```

não serve para enviar convites livremente para qualquer pessoa.

Para usuários reais, o domínio próprio precisa estar verificado.

## 10. Confirmação do usuário

A função do Ativelo gera um link de acesso do Supabase Auth e envia esse link no
e-mail personalizado.

Ao abrir o convite, o usuário é direcionado para:

```text
https://ativelo-platform.pages.dev
```

A URL também deve estar autorizada no Supabase Auth:

```text
Authentication
→ URL Configuration
```

Configuração:

```text
Site URL:
https://ativelo-platform.pages.dev
```

```text
Redirect URLs:
https://ativelo-platform.pages.dev/**
```

## 11. Responsividade

A camada móvel corrige:

- largura maior que a tela;
- grades com várias colunas;
- menus que desaparecem;
- filtros espremidos;
- botões cortados;
- formulários;
- tabelas;
- modais;
- telas de usuários;
- área de comunicação;
- avisos flutuantes.

Menus extensos passam a ter rolagem horizontal em vez de ocultar opções.