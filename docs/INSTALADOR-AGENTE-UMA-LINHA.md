# Instalador do agente Ativelo em uma linha

O Pacote 16 adiciona a Edge Function:

`supabase/functions/agent-bootstrap/index.ts`

Ela distribui o agente e o scanner sem exigir que o projeto esteja presente
nos computadores monitorados.

## Segurança

- O token de instalação é enviado em um cabeçalho HTTPS.
- O token não aparece na URL.
- A função valida validade, revogação e limite de usos.
- O instalador confere o SHA-256 do arquivo antes de executá-lo.
- O token completo continua sendo exibido somente na sessão em que foi criado.

## Publicação

```powershell
pnpm dlx supabase functions deploy agent-bootstrap --no-verify-jwt
```

A função não usa o JWT de um usuário do aplicativo porque os computadores
ainda não possuem uma sessão do Ativelo durante a instalação. A validação é
feita pelo token temporário criado no próprio sistema.

## Arquivos instalados

```text
C:\ProgramData\AtiveloAgent\AtiveloAgent.ps1
C:\ProgramData\AtiveloAgent\config.json
C:\ProgramData\AtiveloAgent\agent.log
```

## Comandos locais

Status:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:ProgramData\AtiveloAgent\AtiveloAgent.ps1" -Action Status
```

Atualização:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:ProgramData\AtiveloAgent\AtiveloAgent.ps1" -Action Update
```

Remoção:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:ProgramData\AtiveloAgent\AtiveloAgent.ps1" -Action Uninstall
```
