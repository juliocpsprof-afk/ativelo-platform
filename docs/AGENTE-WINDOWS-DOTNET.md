# Agente Windows .NET do Ativelo

Este pacote cria a base do agente Windows em .NET 8 Worker Service.

## Entregue

- serviço Windows nativo;
- heartbeat com o Worker do Ativelo;
- autenticação por AgentId e AgentSecret;
- armazenamento protegido por DPAPI LocalMachine;
- inventário básico via WMI;
- fila offline local;
- logs via infraestrutura padrão do Windows Service;
- instalador e desinstalador PowerShell;
- publish single-file win-x64.

## Caminhos locais

Código-fonte:

```text
tools/ativelo-agent-dotnet/src/Ativelo.Agent
```

Publicação:

```text
tools/ativelo-agent-dotnet/publish
```

Instaladores:

```text
tools/ativelo-agent-dotnet/installers
```

Dados locais no cliente:

```text
C:\ProgramData\AtiveloAgent
```

## Publicar o executável

```powershell
cd C:\Projetos\ativelo-platform\tools\ativelo-agent-dotnet\installers

.\Publish-AtiveloAgent.ps1
```

## Instalar em uma máquina cliente

A instalação real será automatizada no Pacote 47. O instalador atual já fica
preparado para receber:

```powershell
.\Install-AtiveloAgent.ps1 `
  -AgentId "<id do agente>" `
  -AgentSecret "<segredo recebido uma única vez>"
```

## Próximas etapas

Pacote 47:
- instalador final;
- vínculo com código temporário;
- enrollment automático;
- primeira instalação assistida.

Pacote 48:
- envio real do inventário para o Supabase;
- comparação de mudanças;
- integração com ativos.

Pacote 49:
- descoberta de rede e dispositivos IP.