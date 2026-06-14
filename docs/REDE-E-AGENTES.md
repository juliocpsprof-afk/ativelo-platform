# Ativelo - Rede e Agentes

O Pacote 15 adiciona:

- inventário automático por agente Windows;
- descoberta de equipamentos em uma rede local;
- histórico de coletas técnicas;
- vínculo entre agente e patrimônio;
- pré-cadastro de dispositivos encontrados;
- tokens temporários de instalação;
- Edge Function segura para ingestão.

## 1. Implantar a Edge Function

A função está em:

`supabase/functions/ingest-inventory/index.ts`

No terminal do projeto:

```powershell
pnpm dlx supabase login
pnpm dlx supabase link --project-ref SEU_PROJECT_REF
pnpm dlx supabase functions deploy ingest-inventory --no-verify-jwt
```

A função usa o token temporário criado dentro do Ativelo. Não coloque a
`SUPABASE_SERVICE_ROLE_KEY` no React, em scripts distribuídos ou no GitHub.

## 2. Instalar o agente

Abra o Ativelo em **Rede > Instalação**, gere um token e copie o comando.

O agente fica em:

`C:\ProgramData\AtiveloAgent`

A tarefa agendada é:

`Ativelo Inventory Agent`

Por padrão, o inventário é enviado a cada quatro horas.

## 3. Executar o scanner

O scanner está em:

`tools/network-scanner/AtiveloNetworkScanner.ps1`

Ele recebe o prefixo de uma rede /24. Exemplo:

```powershell
powershell -ExecutionPolicy Bypass -File ".\tools\network-scanner\AtiveloNetworkScanner.ps1" `
  -ProjectUrl "https://SEU-PROJETO.supabase.co" `
  -EnrollmentToken "TOKEN" `
  -SubnetPrefix "192.168.0"
```

A varredura deve ser executada apenas em redes administradas pela empresa.
