# Infraestrutura central do agente Ativelo

## Entregue neste pacote

- política de heartbeat e frequências;
- código temporário de vinculação;
- credencial aleatória por instalação;
- armazenamento apenas do hash SHA-256;
- validade, tolerância e revogação;
- fila de comandos;
- histórico de execuções;
- painel Central do agente;
- endpoints `/agent/health`, `/agent/enroll` e `/agent/heartbeat`.

## Comunicação

O agente sempre inicia a comunicação por HTTPS. Nenhuma porta de entrada precisa
ser aberta no computador da empresa.

## Vinculação

O código temporário possui prazo e limite de usos. O Worker gera uma credencial
aleatória de 256 bits. O valor original é devolvido uma vez e somente o hash é
armazenado no banco.

## Programação padrão

- heartbeat: 15 minutos;
- inventário local: 24 horas;
- varredura rápida: 7 dias;
- varredura completa: 30 dias;
- credencial: 90 dias;
- tolerância: 7 dias.

Todos os valores podem ser modificados no painel.

## Próxima etapa

O Pacote 41 criará o serviço Windows, instalador, fila offline, armazenamento
protegido da credencial e a primeira coleta real do computador.