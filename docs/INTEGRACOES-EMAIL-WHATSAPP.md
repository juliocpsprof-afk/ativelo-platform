# Ativelo: envio de e-mail e WhatsApp

O Pacote 14 cria a fila de notificações e a função:

`supabase/functions/dispatch-notifications/index.ts`

## Segredos necessários no Supabase

Para e-mail:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Para WhatsApp Cloud API:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_TEMPLATE_NAME`
- `WHATSAPP_LANGUAGE_CODE`
- `WHATSAPP_API_VERSION`

A função utiliza um template aprovado do WhatsApp com dois parâmetros no corpo:

1. título;
2. mensagem.

## Implantação

Com o Supabase CLI autenticado:

```powershell
supabase functions deploy dispatch-notifications --no-verify-jwt
```

Depois configure uma execução periódica pelo painel do Supabase ou chame a função por um agendador seguro.

As chaves nunca devem ser colocadas no React, no `.env.local` público ou no GitHub.
