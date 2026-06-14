# Leitura inteligente do Ativelo

## Leitor de equipamentos

O leitor utiliza camadas sucessivas:

1. BarcodeDetector nativo, quando disponível;
2. ZXing como compatibilidade;
3. processamento de contraste e recorte;
4. OCR do código escrito;
5. digitação manual.

O equipamento pode ser localizado por:

- public_id;
- qr_token;
- número patrimonial;
- código de barras;
- serial;
- service tag.

## Câmera

O sistema solicita:

- câmera traseira;
- resolução ideal de 1920 × 1080;
- 30 quadros por segundo;
- foco contínuo, quando suportado;
- zoom, quando suportado;
- lanterna, quando suportada.

## Nova etiqueta

O QR Code usa conteúdo compacto:

```text
ATV1:NUMERO-PATRIMONIAL
```

As etiquetas antigas, com URL e token, continuam compatíveis com o leitor.

A nova etiqueta usa:

- preto puro;
- fundo branco;
- margem de quatro módulos;
- correção de erro alta;
- QR maior;
- número patrimonial destacado;
- orientação para digitar o código se o QR estiver danificado.

## Captura Inteligente

O OCR passa por diferentes versões da imagem:

- original redimensionada;
- recorte central;
- contraste reforçado;
- limiar preto e branco.

O sistema tenta reconhecer:

- fabricante;
- modelo;
- serial;
- service tag;
- product number;
- código de barras;
- categoria;
- processador;
- memória;
- armazenamento;
- sistema operacional.

## Catálogos

Quando categoria, fabricante ou modelo forem reconhecidos e ainda não existirem,
o sistema pergunta se o usuário deseja cadastrá-los.

Nada é cadastrado silenciosamente.

## Fabricantes e famílias

A lista de reconhecimento inclui, entre outros:

- Acer;
- Apple;
- Asus;
- Avell;
- Compaq;
- Dell;
- HP;
- Intelbras;
- Lenovo;
- LG;
- MSI;
- Multilaser;
- Positivo;
- Samsung;
- Sony;
- Toshiba;
- Vaio.

Famílias como Latitude, ThinkPad, Aspire, Galaxy Book e Vivobook ajudam a
inferir a marca quando o logotipo não é bem lido.

## Desempenho

Tesseract.js, ZXing, QRCode e XLSX são carregados apenas quando o recurso
correspondente é usado.

## Pesquisa externa

A pesquisa de especificações pela internet não faz parte deste pacote.

Ela será implementada pelo Cloudflare Worker em uma etapa separada, sempre com:

- fontes apresentadas;
- dados sugeridos, não impostos;
- confirmação do usuário;
- proteção contra modelos parecidos.