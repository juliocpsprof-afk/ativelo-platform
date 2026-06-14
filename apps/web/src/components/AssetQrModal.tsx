import {
  useEffect,
  useMemo,
  useState,
} from "react";

import AppIcon from "./AppIcon";
import type { AssetRecord } from "../types/assets";

type LabelSize = "compact" | "standard" | "large";

type Props = {
  asset: AssetRecord;
  organizationName: string;
  onClose: () => void;
};

const labelSizes: Record<
  LabelSize,
  {
    label: string;
    width: number;
    height: number;
    qr: number;
  }
> = {
  compact: {
    label: "50 × 30 mm",
    width: 50,
    height: 30,
    qr: 24,
  },
  standard: {
    label: "70 × 40 mm",
    width: 70,
    height: 40,
    qr: 32,
  },
  large: {
    label: "90 × 50 mm",
    width: 90,
    height: 50,
    qr: 40,
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

export default function AssetQrModal({
  asset,
  organizationName,
  onClose,
}: Props) {
  const [qrImage, setQrImage] = useState("");
  const [labelSize, setLabelSize] =
    useState<LabelSize>("standard");
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const qrContent = useMemo(
    () => `ATV1:${asset.asset_number.trim()}`,
    [asset.asset_number],
  );

  useEffect(() => {
    let isActive = true;

    void import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(qrContent, {
          width: 768,
          margin: 4,
          errorCorrectionLevel: "H",
          color: {
            dark: "#000000",
            light: "#ffffff",
          },
        }),
      )
      .then((dataUrl) => {
        if (isActive) {
          setQrImage(dataUrl);
          setErrorMessage(null);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Não foi possível gerar o QR Code.",
          );
        }
      });

    return () => {
      isActive = false;
    };
  }, [qrContent]);

  const printLabel = () => {
    if (!qrImage) {
      setErrorMessage(
        "Aguarde a geração do QR Code.",
      );
      return;
    }

    const size = labelSizes[labelSize];
    const printWindow = window.open(
      "",
      "_blank",
      "width=900,height=700",
    );

    if (!printWindow) {
      setErrorMessage(
        "O navegador bloqueou a janela de impressão. Libere os pop-ups e tente novamente.",
      );
      return;
    }

    const logoUrl =
      `${window.location.origin}/assets/ativelo-logo.png`;

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Etiqueta ${escapeHtml(asset.asset_number)}</title>
<style>
  @page {
    size: ${size.width}mm ${size.height}mm;
    margin: 0;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    width: ${size.width}mm;
    height: ${size.height}mm;
    margin: 0;
    padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    background: #fff;
  }

  .label {
    display: grid;
    grid-template-columns: ${size.qr}mm minmax(0, 1fr);
    gap: ${labelSize === "compact" ? "1.4mm" : "2.2mm"};
    width: 100%;
    height: 100%;
    padding: ${labelSize === "compact" ? "1.4mm" : "2mm"};
    border: .35mm solid #000;
    overflow: hidden;
  }

  .qr {
    width: ${size.qr}mm;
    height: ${size.qr}mm;
    object-fit: contain;
    background: #fff;
  }

  .content {
    display: flex;
    min-width: 0;
    flex-direction: column;
    justify-content: center;
  }

  .logo {
    display: block;
    width: auto;
    max-width: 30mm;
    height: ${labelSize === "compact" ? "4.5mm" : "5.5mm"};
    margin-bottom: 1mm;
    object-fit: contain;
    object-position: left center;
  }

  .asset-number {
    margin: 0;
    overflow-wrap: anywhere;
    font-family: "Courier New", monospace;
    font-size: ${labelSize === "compact" ? "10pt" : "14pt"};
    font-weight: 900;
    line-height: 1;
    letter-spacing: .25mm;
  }

  .asset-name {
    margin: 1mm 0 0;
    overflow: hidden;
    font-size: ${labelSize === "compact" ? "6pt" : "8pt"};
    font-weight: 700;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    margin: .8mm 0 0;
    font-size: ${labelSize === "compact" ? "5pt" : "6.5pt"};
    line-height: 1.2;
  }

  .fallback {
    margin: auto 0 0;
    padding-top: .8mm;
    border-top: .2mm solid #000;
    font-size: ${labelSize === "compact" ? "4.7pt" : "5.7pt"};
    font-weight: 700;
    line-height: 1.15;
  }
</style>
</head>
<body>
  <section class="label">
    <img
      class="qr"
      src="${qrImage}"
      alt="QR Code"
    />

    <div class="content">
      <img
        class="logo"
        src="${logoUrl}"
        alt="Ativelo"
      />

      <p class="asset-number">
        ${escapeHtml(asset.asset_number)}
      </p>

      <p class="asset-name">
        ${escapeHtml(asset.name)}
      </p>

      <p class="meta">
        Serial:
        ${escapeHtml(asset.serial_number || "Não informado")}
        <br />
        ${escapeHtml(organizationName)}
      </p>

      <p class="fallback">
        QR danificado? Digite o código patrimonial acima.
      </p>
    </div>
  </section>

  <script>
    window.addEventListener("load", () => {
      setTimeout(() => {
        window.print();
        window.close();
      }, 350);
    });
  </script>
</body>
</html>`);

    printWindow.document.close();
  };

  return (
    <div
      className="ativelo-modal-backdrop"
      role="presentation"
    >
      <section
        className="ativelo-modal ativelo-qr-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Etiqueta QR Code"
      >
        <header>
          <div>
            <span>IDENTIFICAÇÃO RESILIENTE</span>
            <h2>Etiqueta com QR Code</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
          >
            <AppIcon name="close" size={21} />
          </button>
        </header>

        <div className="ativelo-qr-content">
          <div className="ativelo-label-preview">
            <div className="ativelo-label-qr">
              {qrImage ? (
                <img
                  src={qrImage}
                  alt="QR Code do equipamento"
                />
              ) : (
                <div className="ativelo-qr-loading">
                  Gerando QR...
                </div>
              )}
            </div>

            <div className="ativelo-label-info">
              <img
                src="/assets/ativelo-logo.png"
                alt="Ativelo"
              />

              <strong>{asset.asset_number}</strong>
              <span>{asset.name}</span>
              <small>
                Serial:{" "}
                {asset.serial_number ||
                  "Não informado"}
              </small>
              <small>{organizationName}</small>

              <em>
                QR danificado? Digite este código:
                <b>{asset.asset_number}</b>
              </em>
            </div>
          </div>

          <label>
            <span>Tamanho da etiqueta</span>
            <select
              value={labelSize}
              onChange={(event) =>
                setLabelSize(
                  event.target.value as LabelSize,
                )
              }
            >
              {(
                Object.keys(labelSizes) as LabelSize[]
              ).map((size) => (
                <option key={size} value={size}>
                  {labelSizes[size].label}
                </option>
              ))}
            </select>
          </label>

          <div className="ativelo-vision-qr-details">
            <span>Conteúdo compacto</span>
            <code>{qrContent}</code>
            <p>
              O QR usa preto puro, fundo branco, margem de
              quatro módulos e um conteúdo curto. O código
              patrimonial impresso funciona como alternativa
              se a imagem estiver danificada.
            </p>
          </div>

          {errorMessage && (
            <div className="ativelo-form-error">
              {errorMessage}
            </div>
          )}

          <div className="ativelo-modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={onClose}
            >
              Fechar
            </button>

            <button
              type="button"
              className="primary"
              onClick={printLabel}
            >
              Imprimir etiqueta
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}