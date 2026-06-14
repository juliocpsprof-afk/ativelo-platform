# PWA do Ativelo

## Recursos

- instalação no computador e no celular;
- manifest web;
- ícones 32, 192 e 512 pixels;
- ícone maskable;
- modo standalone;
- página offline;
- cache apenas do shell estático;
- aviso de nova versão;
- botão de instalação em navegadores compatíveis;
- orientação de instalação no iPhone.

## Política de cache

O service worker pode armazenar:

- HTML base do aplicativo;
- JavaScript e CSS compilados;
- imagens e fontes do próprio frontend;
- manifest;
- ícones;
- página offline.

O service worker não armazena:

- requisições com cabeçalho `Authorization`;
- respostas do Supabase;
- respostas do Cloudflare Worker;
- dados de usuários;
- inventário;
- chamados;
- auditorias;
- anexos;
- respostas de API.

## Estratégia

Navegação:

```text
network first
```

Arquivos estáticos:

```text
cache first
```

Quando não houver internet, o app usa o shell previamente armazenado. Operações
que dependem do Supabase ou do Worker continuam exigindo conexão.

## Atualização

Quando uma nova versão do `sw.js` for detectada, o Ativelo exibe:

```text
Nova versão disponível
```

O usuário pode aplicar a atualização pelo botão `Atualizar`.

## Cloudflare Pages

O arquivo `_headers` impede que `sw.js`, `manifest.webmanifest` e `offline.html`
fiquem presos em cache antigo. Ícones versionados podem usar cache longo.

## Testes recomendados

1. Abrir o site publicado.
2. Confirmar que aparece `Instale o Ativelo`.
3. Instalar.
4. Abrir pelo ícone.
5. Confirmar que não há barra normal do navegador.
6. Ativar modo avião após o primeiro carregamento.
7. Reabrir o app e confirmar a tela offline ou o shell.
8. Reativar a internet.
9. Confirmar login e API segura.