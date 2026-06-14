# Cloudflare Worker do Ativelo

## Worker publicado

Nome:

```text
ativelo-api
```

URL:

```text
https://ativelo-api.ativeloapp.workers.dev
```

## Endpoints

Públicos:

```text
GET /
GET /health
```

Protegido:

```text
GET /auth/me
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

O endpoint protegido valida o access token no Supabase Auth e devolve somente
dados controlados do usuário autenticado.

## Secrets

O Worker exige:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

Esses valores são enviados ao Cloudflare como secrets e não são gravados no Git.

A `SUPABASE_SERVICE_ROLE_KEY` não é usada neste pacote.

## Ainda não ativado

- Cloudflare Queues;
- Cron Triggers;
- Resend;
- WhatsApp;
- FCM;
- operações administrativas do Supabase;
- service role;
- automações.