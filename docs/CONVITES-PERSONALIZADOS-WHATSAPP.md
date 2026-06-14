# Ativelo: convites personalizados e WhatsApp

O Pacote 21 substitui o e-mail genérico do Supabase por um convite
personalizado enviado pela Edge Function:

`supabase/functions/invite-organization-user/index.ts`

## O que muda

- A logo e os dados da empresa aparecem no e-mail.
- A marca Ativelo aparece como assinatura da plataforma.
- O convite informa perfil, empresa e responsável pelo envio.
- O administrador pode copiar o link de acesso.
- O WhatsApp manual abre com a mensagem e o link já preenchidos.
- A Cloud API da Meta pode ser habilitada posteriormente.
- O sistema registra histórico de envio, reenvio e aceitação.

## Segredos para e-mail personalizado

Crie uma conta no Resend, verifique um domínio e configure:

```powershell
pnpm dlx supabase secrets set RESEND_API_KEY="re_COLE_AQUI"
pnpm dlx supabase secrets set RESEND_FROM_EMAIL="convites@seudominio.com.br"
pnpm dlx supabase secrets set APP_BASE_URL="https://seu-app.vercel.app"
```

Depois publique novamente:

```powershell
pnpm dlx supabase functions deploy invite-organization-user
```

Nunca coloque a chave do Resend no React, no `.env.local` público ou no GitHub.

## WhatsApp manual

O modo manual funciona sem API. O Ativelo cria uma URL `wa.me` com:

- nome do convidado;
- nome da empresa;
- perfil;
- nome de quem enviou;
- link real de aceitação;
- aviso de segurança.

O administrador apenas revisa e confirma o envio no WhatsApp.

## WhatsApp automático

Configure os segredos:

```powershell
pnpm dlx supabase secrets set WHATSAPP_ACCESS_TOKEN="COLE_AQUI"
pnpm dlx supabase secrets set WHATSAPP_PHONE_NUMBER_ID="COLE_AQUI"
pnpm dlx supabase secrets set WHATSAPP_API_VERSION="v23.0"
```

Crie e aprove na Meta um template com o nome configurado no Ativelo.
O corpo do template deve receber quatro parâmetros nesta ordem:

1. nome do convidado;
2. nome da empresa;
3. perfil concedido;
4. link do convite.

Depois publique novamente a função.

## Configuração no aplicativo

Acesse:

`Configurações → Comunicação e convites`

Nessa tela é possível:

- editar o assunto;
- editar a apresentação;
- definir o nome do remetente;
- definir contato de suporte;
- escolher a cor principal;
- testar o e-mail;
- escolher WhatsApp desativado, manual ou automático.

## Segurança

O link de convite não é gravado no banco. Ele é devolvido apenas no momento
da criação ou do reenvio. O banco armazena somente o histórico e os estados
de entrega.
