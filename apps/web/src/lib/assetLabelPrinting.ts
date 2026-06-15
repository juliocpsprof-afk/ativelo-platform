import type { AssetRecord } from "../types/assets";

export type LabelSize =
  | "compact"
  | "standard"
  | "large";

export type LabelPrintItem = {
  asset: AssetRecord;
  copies: number;
  locationLabel?: string;
};

export const labelSizes: Record<
  LabelSize,
  {
    label: string;
    width: number;
    height: number;
    qr: number;
    columns: number;
    rows: number;
  }
> = {
  compact: {
    label: "50 × 30 mm",
    width: 50,
    height: 30,
    qr: 23,
    columns: 3,
    rows: 8,
  },
  standard: {
    label: "70 × 40 mm",
    width: 70,
    height: 40,
    qr: 31,
    columns: 2,
    rows: 6,
  },
  large: {
    label: "90 × 50 mm",
    width: 90,
    height: 50,
    qr: 39,
    columns: 2,
    rows: 5,
  },
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

function clampCopies(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(
    1,
    Math.min(20, Math.round(value)),
  );
}

function chunk<T>(
  items: T[],
  size: number,
): T[][] {
  const result: T[][] = [];

  for (
    let index = 0;
    index < items.length;
    index += size
  ) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

export function getLabelPageCapacity(
  size: LabelSize,
): number {
  const config = labelSizes[size];
  return config.columns * config.rows;
}

export async function printAssetLabels(
  printWindow: Window,
  options: {
    items: LabelPrintItem[];
    labelSize: LabelSize;
    organizationName: string;
    organizationLogoUrl?: string | null;
  },
): Promise<void> {
  const selected = options.items.filter(
    (item) => item.copies > 0,
  );

  if (selected.length === 0) {
    throw new Error(
      "Selecione pelo menos uma etiqueta.",
    );
  }

  const QRCode = await import("qrcode");

  const uniqueAssets = Array.from(
    new Map(
      selected.map((item) => [
        item.asset.id,
        item.asset,
      ]),
    ).values(),
  );

  const qrEntries = await Promise.all(
    uniqueAssets.map(async (asset) => {
      const dataUrl = await QRCode.toDataURL(
        `ATV1:${asset.asset_number.trim()}`,
        {
          width: 768,
          margin: 4,
          errorCorrectionLevel: "H",
          color: {
            dark: "#000000",
            light: "#ffffff",
          },
        },
      );

      return [asset.id, dataUrl] as const;
    }),
  );

  const qrByAsset = new Map(qrEntries);

  const expanded = selected.flatMap((item) =>
    Array.from(
      { length: clampCopies(item.copies) },
      () => item,
    ),
  );

  const config = labelSizes[options.labelSize];
  const capacity =
    config.columns * config.rows;
  const pages = chunk(expanded, capacity);

  const fallbackLogo =
    `${window.location.origin}/assets/ativelo-logo.png`;
  const logoUrl =
    options.organizationLogoUrl ||
    fallbackLogo;

  const labelMarkup = (
    item: LabelPrintItem,
  ) => {
    const { asset } = item;
    const qr = qrByAsset.get(asset.id) ?? "";
    const serial =
      asset.serial_number ||
      asset.service_tag ||
      "Não informado";
    const location =
      item.locationLabel || "Local não definido";

    return `
      <article class="asset-label">
        <img
          class="asset-label__qr"
          src="${qr}"
          alt=""
        />

        <div class="asset-label__content">
          <img
            class="asset-label__logo"
            src="${escapeHtml(logoUrl)}"
            alt=""
          />

          <strong class="asset-label__number">
            ${escapeHtml(asset.asset_number)}
          </strong>

          <span class="asset-label__name">
            ${escapeHtml(asset.name)}
          </span>

          <small>
            Serial: ${escapeHtml(serial)}
          </small>

          <small>
            ${escapeHtml(location)}
          </small>

          <small class="asset-label__organization">
            ${escapeHtml(options.organizationName)}
          </small>
        </div>
      </article>
    `;
  };

  const sheets = pages
    .map(
      (page, index) => `
        <section
          class="print-sheet"
          aria-label="Folha ${index + 1}"
        >
          ${page.map(labelMarkup).join("")}
        </section>
      `,
    )
    .join("");

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Etiquetas de ativos</title>
<style>
  @page {
    size: A4 portrait;
    margin: 0;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    color: #000;
    background: #fff;
    font-family: Arial, Helvetica, sans-serif;
  }

  .print-sheet {
    display: grid;
    width: 210mm;
    min-height: 297mm;
    grid-template-columns:
      repeat(
        ${config.columns},
        ${config.width}mm
      );
    grid-auto-rows: ${config.height}mm;
    align-content: start;
    justify-content: center;
    gap: 3mm;
    padding: 7mm;
    break-after: page;
    page-break-after: always;
  }

  .print-sheet:last-child {
    break-after: auto;
    page-break-after: auto;
  }

  .asset-label {
    display: grid;
    width: ${config.width}mm;
    height: ${config.height}mm;
    grid-template-columns:
      ${config.qr}mm
      minmax(0, 1fr);
    gap: 1.8mm;
    padding: 1.4mm;
    overflow: hidden;
    border: .3mm solid #000;
    background: #fff;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .asset-label__qr {
    width: ${config.qr}mm;
    height: ${config.qr}mm;
    align-self: center;
    object-fit: contain;
    background: #fff;
  }

  .asset-label__content {
    display: flex;
    min-width: 0;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
  }

  .asset-label__logo {
    display: block;
    width: auto;
    max-width: 25mm;
    height: ${
      options.labelSize === "compact"
        ? "3.8mm"
        : "5mm"
    };
    margin-bottom: .8mm;
    object-fit: contain;
    object-position: left center;
  }

  .asset-label__number {
    overflow-wrap: anywhere;
    font-family: "Courier New", monospace;
    font-size: ${
      options.labelSize === "compact"
        ? "8pt"
        : options.labelSize === "standard"
          ? "11pt"
          : "14pt"
    };
    font-weight: 900;
    line-height: 1;
    letter-spacing: .15mm;
  }

  .asset-label__name {
    margin-top: .8mm;
    overflow: hidden;
    font-size: ${
      options.labelSize === "compact"
        ? "5.4pt"
        : "7pt"
    };
    font-weight: 700;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .asset-label small {
    margin-top: .45mm;
    overflow: hidden;
    font-size: ${
      options.labelSize === "compact"
        ? "4.4pt"
        : "5.6pt"
    };
    line-height: 1.12;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .asset-label__organization {
    margin-top: auto !important;
    padding-top: .6mm;
    border-top: .15mm solid #000;
    font-weight: 700;
  }
</style>
</head>
<body>
  ${sheets}

  <script>
    window.addEventListener("load", () => {
      setTimeout(() => {
        window.print();
      }, 450);
    });
  </script>
</body>
</html>`);

  printWindow.document.close();
}