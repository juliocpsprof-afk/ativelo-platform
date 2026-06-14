# Frontend conectado ao Worker seguro

## Objetivo

O frontend do Ativelo confirma a sessão autenticada no Cloudflare Worker sem
alterar o login realizado pelo Supabase Auth.

## Fluxo

1. O usuário entra normalmente no Ativelo.
2. O `AuthContext` recebe a sessão do Supabase.
3. O frontend envia somente o `access_token` no cabeçalho:

```http
Authorization: Bearer <access-token>
```

4. O Worker consulta o Supabase Auth.
5. O frontend recebe a confirmação da identidade.
6. Um indicador discreto mostra o estado da API segura.

## Estados do indicador

```text
Validando API segura
API segura conectada
Sessão não confirmada
API segura indisponível
```

Uma indisponibilidade temporária do Worker não bloqueia as telas atuais do
aplicativo.

## Renovação da sessão

Quando o Worker responder HTTP 401, o frontend tenta renovar a sessão uma única
vez usando `supabase.auth.refreshSession()` e repete a validação.

## Segurança

O frontend não:

- grava o token em arquivos;
- envia o refresh token ao Worker;
- mostra o token na tela;
- registra o token em logs;
- usa `SUPABASE_SERVICE_ROLE_KEY`.

## API

Produção:

```text
https://ativelo-api.ativeloapp.workers.dev
```

Endpoint:

```text
GET /auth/me
```

## Variável opcional

```text
VITE_ATIVELO_API_URL
```

A variável permite trocar o endereço no futuro, por exemplo, quando a API
receber um domínio personalizado.