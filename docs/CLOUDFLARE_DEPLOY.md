# Ativelo na Cloudflare

## Arquitetura oficial

- Frontend: Cloudflare Pages
- API e integrações: Cloudflare Workers
- Filas: Cloudflare Queues
- Rotinas programadas: Cloudflare Cron Triggers
- Banco, autenticação e armazenamento: Supabase

A Vercel não faz parte da arquitetura oficial.

## Cloudflare Pages com GitHub

Criar o projeto pelo painel da Cloudflare usando integração com o GitHub.

Configuração recomendada para este monorepo:

| Campo | Valor |
|---|---|
| Repositório | `juliocpsprof-afk/ativelo-platform` |
| Branch de produção | `main` |
| Diretório raiz | deixar vazio, usando a raiz do repositório |
| Comando de build | `pnpm -C apps/web build` |
| Diretório de saída | `apps/web/dist` |

O `packageManager` da raiz e os arquivos `.node-version` e `.nvmrc` devem orientar
o ambiente de build. Se o painel não habilitar o pnpm automaticamente, usar:

```text
corepack enable && pnpm -C apps/web build
```

## Variáveis públicas do frontend

Cadastrar no projeto Pages os mesmos valores públicos existentes no
`apps/web/.env.local`, usando os nomes definidos no `apps/web/.env.example`.

Normalmente incluem:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

A chave `SUPABASE_SERVICE_ROLE_KEY` nunca pode ser cadastrada como variável
`VITE_*` ou enviada ao navegador.

## HTTPS e câmera

O endereço `pages.dev` usa HTTPS. Depois do primeiro deploy, testar no celular:

- login;
- responsividade;
- câmera traseira;
- leitura de QR Code;
- captura de etiqueta;
- upload de foto;
- abertura de chamado;
- auditoria.

## Rotas da SPA

O arquivo `apps/web/public/_redirects` envia as rotas do aplicativo para
`index.html`, evitando erro 404 ao atualizar uma página interna.

## Cabeçalhos

O arquivo `apps/web/public/_headers` adiciona cabeçalhos básicos e permite
câmera apenas para a própria origem.

## Supabase Auth

Depois de obter a URL pública, incluir a origem HTTPS aprovada nas configurações
de URL do Supabase Auth. Não presumir que isso foi feito sem confirmação.

## Worker

Comandos locais disponíveis:

```powershell
pnpm cf:worker:check
pnpm cf:worker:dev
```

Publicação, filas, Cron Triggers e segredos devem ser ativados somente depois da
autenticação do responsável na Cloudflare e da definição das URLs finais.