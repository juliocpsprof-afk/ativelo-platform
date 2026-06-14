# Autenticação do Worker

## Objetivo

O Worker do Ativelo valida a identidade do usuário antes de executar futuras
operações protegidas.

## Fluxo

1. O usuário entra no frontend usando Supabase Auth.
2. O frontend recebe um access token.
3. O frontend envia o token ao Worker:

```http
Authorization: Bearer <access-token>
```

4. O Worker consulta o Supabase Auth.
5. O endpoint responde com o usuário autenticado ou HTTP 401.

## Endpoint

```text
GET https://ativelo-api.ativeloapp.workers.dev/auth/me
```

Sem token:

```text
HTTP 401
```

Com token válido:

```text
HTTP 200
```

## Princípio de menor privilégio

Este fluxo não usa `SUPABASE_SERVICE_ROLE_KEY`.

A chave publicável identifica o projeto e o token Bearer identifica o usuário.
Operações administrativas serão tratadas separadamente somente quando houver
uma necessidade real e uma autorização explícita.