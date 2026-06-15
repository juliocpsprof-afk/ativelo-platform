# Convites por e-mail sem domínio

## Decisão do MVP

O Ativelo não exige:

- domínio próprio;
- Resend;
- SMTP;
- API key;
- conta Gmail conectada.

O canal padrão de e-mail é manual:

```text
Ativelo cria o convite
→ administrador clica em Abrir e-mail
→ Gmail, Outlook ou outro aplicativo abre preenchido
→ administrador revisa e envia
```

## Por que o Supabase não envia para qualquer pessoa

Sem SMTP próprio, o serviço de e-mail interno do Supabase aceita apenas
endereços previamente autorizados na equipe do projeto.

Ele também possui limite reduzido e não é indicado como canal de produção para
clientes externos.

Por isso, o Ativelo não apresenta esse serviço como solução automática.

## Opções disponíveis

Depois que o convite é criado:

- Abrir e-mail;
- Copiar texto do e-mail;
- Compartilhar pelo celular;
- Abrir WhatsApp;
- Copiar mensagem do WhatsApp;
- Copiar link.

## Aplicativo de e-mail

O botão `Abrir e-mail` usa o protocolo `mailto:`.

Isso permite abrir:

- Gmail;
- Outlook;
- Apple Mail;
- Samsung Email;
- Thunderbird;
- aplicativo padrão do sistema.

O envio é confirmado pelo próprio usuário.

## Primeiro acesso

O link criado pelo Ativelo identifica que se trata de um novo convidado.

No primeiro acesso, o usuário precisa criar uma senha com pelo menos oito
caracteres.

Depois disso, ele poderá entrar normalmente usando e-mail e senha.

## Gmail API no futuro

A Gmail API poderá oferecer envio automático usando a conta Google da empresa.

Essa integração exige:

- projeto no Google Cloud;
- Gmail API habilitada;
- tela de consentimento OAuth;
- escopo `gmail.send`;
- client ID e client secret;
- callback seguro;
- refresh token criptografado;
- opção de desconectar;
- verificação do aplicativo para uso público.

O escopo `gmail.send` permite apenas enviar mensagens e não permite ler a caixa
de entrada. Mesmo assim, ele é classificado como sensível pelo Google.

A integração será adicionada como modo avançado, sem substituir o envio manual.