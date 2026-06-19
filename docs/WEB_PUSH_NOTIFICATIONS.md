# Notificações push do Ativelo

## Objetivo

Este pacote adiciona notificações Web Push à PWA do Ativelo sem depender de
WhatsApp, SMS ou aplicativo nativo.

O navegador recebe a mensagem por meio do service worker mesmo quando a aba do
Ativelo não está aberta.

## Eventos incluídos

- chamado criado;
- chamado atribuído;
- manutenção preventiva próxima ou vencida;
- empréstimo atrasado;
- agente ou equipamento sem comunicação;
- garantia próxima do vencimento;
- atualização do sistema;
- teste manual por dispositivo.

## Consentimento

Cada usuário precisa clicar em **Ativar neste dispositivo** e permitir
notificações no navegador.

A autorização vale para aquele navegador e aparelho. O mesmo usuário pode
registrar vários computadores ou celulares.

## Componentes

### Banco

- `web_push_subscriptions`
- `push_notification_preferences`
- `push_delivery_attempts`
- `system_announcements`
- canal `push` em `app_notifications`
- funções de fila e deduplicação
- gatilhos de chamados e atualizações
- rotina de preparação dos vencimentos

### Frontend

O painel fica dentro de **Configurações > Comunicação** e permite:

- ativar ou desativar o dispositivo;
- escolher categorias;
- enviar teste;
- consultar últimas tentativas;
- publicar aviso de atualização, para proprietário ou administrador.

### Service worker

O arquivo `public/sw.js` recebe o evento `push`, apresenta a notificação nativa
e abre o Ativelo quando a mensagem é tocada.

### Edge Function

`dispatch-web-push`:

- entrega a chave VAPID pública ao frontend;
- envia teste autenticado;
- prepara os alertas programados;
- despacha a fila;
- registra sucesso, falha e assinatura expirada;
- desativa endpoints que retornem HTTP 404 ou 410;
- realiza até cinco tentativas com espera progressiva.

### Cloudflare Worker

O Cron Trigger executa a cada cinco minutos e chama a Edge Function com uma
chave compartilhada.

## Segredos necessários na publicação

Supabase Edge Function:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `PUSH_DISPATCH_SECRET`
- `APP_BASE_URL`

Cloudflare Worker:

- `PUSH_DISPATCH_SECRET`

A chave `PUSH_DISPATCH_SECRET` precisa ser idêntica nos dois ambientes.

## Segurança

- a chave VAPID privada nunca vai para o navegador;
- o frontend recebe somente a chave pública;
- assinaturas são vinculadas ao usuário autenticado;
- RLS protege preferências e dispositivos;
- o cron usa um segredo próprio;
- endpoints expirados são desativados;
- notificações são deduplicadas por usuário e evento;
- nenhuma API do Ativelo entra no cache da PWA.

## Limitações de plataforma

- o usuário pode bloquear notificações no navegador;
- alguns navegadores móveis exigem que a PWA seja instalada;
- o modo de economia de bateria pode atrasar mensagens;
- cada navegador usa o próprio serviço de entrega push;
- o Ativelo registra aceitação do serviço push, não leitura humana garantida.

## Publicação

O Pacote 44 instala e valida localmente.

O pacote seguinte deverá:

1. gerar as chaves VAPID;
2. aplicar a migration;
3. definir os segredos;
4. publicar `dispatch-web-push`;
5. publicar o Worker com o cron;
6. enviar o frontend ao GitHub;
7. testar em computador e celular.
