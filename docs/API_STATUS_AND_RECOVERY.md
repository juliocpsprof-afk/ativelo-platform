# Indicador inteligente da API segura

## Estado normal

Quando a API está conectada, nenhum cartão, texto ou indicador é exibido.
Durante verificações e tentativas silenciosas, nada aparece.

## Falha em segundo plano

Aparece somente um pequeno ícone no canto da tela. Ele não bloqueia botões,
tabelas, modais ou menus.

## Falha durante uma operação

Chamadas realizadas por `requestAtiveloApi` emitem um evento interno somente
quando uma operação realmente depende da API e falha.

Antes de alertar, o Ativelo:

1. tenta validar novamente o Worker;
2. tenta renovar a sessão uma vez em HTTP 401;
3. repete falhas temporárias com espera progressiva;
4. mostra o aviso somente se todas as tentativas falharem.

## Diagnósticos

- internet offline;
- sessão expirada;
- timeout;
- Worker indisponível.

## Reconexão automática

O Ativelo tenta novamente quando:

- a internet volta;
- a janela recebe foco;
- a aba volta a ficar visível;
- a última verificação tem mais de cinco minutos;
- uma operação protegida falha.

## Novas operações

Use:

```ts
requestAtiveloApi(
  "/rota",
  accessToken,
  signal,
  {
    operation: "Nome da operação",
  },
);
```

A validação de sessão usa `silent: true`, portanto não mostra mensagens durante
o funcionamento normal.