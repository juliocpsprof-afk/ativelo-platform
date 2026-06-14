# Cloudflare Worker do Ativelo

Esta pasta contém a fundação da camada de API do Ativelo.

## Estado deste pacote

Ativado localmente:

- endpoint `GET /`;
- endpoint `GET /health`;
- handler preparado para Cron Trigger;
- handler preparado para Cloudflare Queue;
- configuração local do Wrangler.

Ainda não ativado na conta Cloudflare:

- publicação do Worker;
- fila `ativelo-jobs`;
- produtor e consumidor da fila;
- Cron Trigger;
- segredos;
- integração segura com Supabase;
- Resend;
- WhatsApp;
- FCM.

O arquivo `wrangler.queue-cron.example.jsonc` é apenas um modelo. Não deve substituir
o `wrangler.jsonc` antes da criação real dos recursos e da definição da URL pública do frontend.

Nunca coloque a chave `SUPABASE_SERVICE_ROLE_KEY` em arquivos versionados.
Use `wrangler secret put` quando a camada segura do backend for implementada.