# Pesquisa assistida gratuita de especificações

## Princípio do MVP

A pesquisa funciona sem domínio, sem API de busca paga e sem cobrança automática.

Fluxo:

```text
OCR identifica fabricante e modelo
→ Ativelo monta links de pesquisa gratuitos
→ usuário abre Google, Bing ou DuckDuckGo
→ usuário escolhe páginas oficiais
→ usuário cola de uma a três URLs
→ Worker analisa as fontes
→ sistema mostra sugestões, confiança e links
→ usuário escolhe os campos
→ campos entram apenas no pré-cadastro
→ usuário revisa e salva manualmente
```

## Recursos usados

### Cloudflare Worker

O Worker protegido:

- valida a sessão;
- bloqueia URLs locais e privadas;
- baixa apenas fontes públicas;
- limita tamanho, tempo e quantidade de páginas;
- mantém cache interno de pesquisas repetidas;
- não grava o resultado no banco.

### Workers AI

O binding `AI` organiza os dados em campos estruturados.

Modelo padrão:

```text
@cf/zai-org/glm-4.7-flash
```

A conta gratuita do Cloudflare possui franquia diária de Workers AI. Quando a
franquia gratuita não estiver disponível, o Ativelo usa regras locais
conservadoras e não ativa cobrança automaticamente.

## Pesquisa guiada

A interface oferece links preparados para:

- Google;
- Bing;
- DuckDuckGo.

A pesquisa acontece no navegador do usuário. O Ativelo não paga nem consome uma
API de busca.

## Fontes recomendadas

Cole preferencialmente:

- página oficial do produto;
- suporte do fabricante;
- ficha técnica;
- documentação;
- manual.

Páginas HTML costumam fornecer mais informações. Um PDF pode ser preservado
como manual ou documentação, mas nem sempre será possível extrair todos os
dados dele nesta primeira versão.

## Campos sugeridos

- fabricante;
- modelo completo;
- processador;
- memória;
- armazenamento;
- tipo de equipamento;
- sistema operacional original;
- documentação ou manual;
- imagem;
- fontes.

## Regra para configurações variáveis

Memória e armazenamento podem mudar dentro do mesmo modelo. Esses campos devem
ser tratados como sugestões e conferidos na etiqueta, BIOS ou sistema
operacional do equipamento.

## Pesquisa automática futura

O código mantém suporte técnico opcional para um provedor de busca, mas ele fica
desativado:

```text
ENABLE_BRAVE_SEARCH=false
```

Essa opção não é necessária para o MVP e não deve ser configurada agora.

## Publicação

Depois da instalação, será necessário publicar:

```powershell
pnpm cf:worker:deploy
```

O frontend será publicado pelo GitHub e Cloudflare Pages após o commit.