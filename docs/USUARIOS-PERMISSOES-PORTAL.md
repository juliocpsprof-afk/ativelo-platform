# Pacote 20: usuários, permissões e portal

## Perfis disponíveis

- owner: proprietário da empresa
- admin: administrador
- it_manager: gestor de TI
- technician: técnico
- auditor: auditor
- user: usuário final

## Convites

A função `invite-organization-user` usa o Supabase Auth Admin no
servidor. A chave `service_role` fica apenas na Edge Function e nunca
é enviada ao navegador.

Publicação manual:

```powershell
pnpm dlx supabase functions deploy invite-organization-user
```

O domínio usado no convite deve estar permitido em:

```text
Supabase > Authentication > URL Configuration
```

## Portal do usuário

Usuários com perfil `user` entram diretamente no portal de
autoatendimento. Eles podem:

- visualizar equipamentos vinculados;
- ler QR Code para selecionar um equipamento;
- executar procedimentos de autodiagnóstico;
- abrir chamados;
- acompanhar os próprios chamados.

## Proteção de proprietários

O banco impede que a empresa fique sem pelo menos um proprietário
ativo. Apenas proprietários podem conceder o perfil de proprietário.
