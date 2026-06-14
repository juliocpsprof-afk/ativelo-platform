import { useEffect, useMemo, useState } from "react";
import * as QRCode from "qrcode";
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
  { label: string; width: number; height: number; qr: number }
> = {
  compact: { label: "50 × 30 mm", width: 50, height: 30, qr: 21 },
  standard: { label: "70 × 40 mm", width: 70, height: 40, qr: 28 },
  large: { label: "90 × 50 mm", width: 90, height: 50, qr: 35 },
};

export default function AssetQrModal({
  asset,
  organizationName,
  onClose,
}: Props) {
  const [qrImage, setQrImage] = useState("");
  const [labelSize, setLabelSize] = useState<LabelSize>("standard");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const qrContent = useMemo(() => {
    const url = new URL(window.location.origin);
    url.searchParams.set("asset", asset.public_id);
    url.searchParams.set("token", asset.qr_token);
    return url.toString();
  }, [asset.public_id, asset.qr_token]);

  useEffect(() => {
    let isActive = true;

    void QRCode.toDataURL(qrContent, {
      width: 560,
      margin: 1,
      errorCorrectionLevel: "H",
      color: {
        dark: "#071f49",
        light: "#ffffff",
      },
    })
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
      setErrorMessage("Aguarde a geração do QR Code.");
      return;
    }

    const size = labelSizes[labelSize];
    const printWindow = window.open("", "_blank", "width=900,height=700");

    if (!printWindow) {
      setErrorMessage(
        "O navegador bloqueou a janela de impressão. Libere os pop-ups e tente novamente.",
      );
      return;
    }

    const logoUrl = `${window.location.origin}/assets/ativelo-logo.png`;

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Etiqueta ${escapeHtml(asset.asset_number)}</title>
<style>
  @page { size: ${size.width}mm ${size.height}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    width: ${size.width}mm;
    height: ${size.height}mm;
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    color: #071f49;
    background: #fff;
  }
  .label {
    display: grid;
    width: 100%;
    height: 100%;
    grid-template-columns: ${size.qr}mm 1fr;
    gap: 2.5mm;
    align-items: center;
    padding: 2.3mm;
    border: .35mm solid #0f5fd7;
    border-radius: 2.2mm;
    overflow: hidden;
  }
  .qr {
    width: ${size.qr}mm;
    height: ${size.qr}mm;
    object-fit: contain;
  }
  .content {
    min-width: 0;
  }
  .logo {
    display: block;
    width: auto;
    max-width: 31mm;
    height: 5.8mm;
    margin-bottom: 1.4mm;
    object-fit: contain;
    object-position: left center;
  }
  .asset-number {
    margin: 0 0 1mm;
    font-size: ${labelSize === "compact" ? "10pt" : "13pt"};
    font-weight: 800;
    line-height: 1.05;
  }
  .asset-name {
    margin: 0 0 1mm;
    overflow: hidden;
    font-size: ${labelSize === "compact" ? "6.5pt" : "8pt"};
    font-weight: 700;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    margin: 0;
    color: #52657e;
    font-size: ${labelSize === "compact" ? "5.5pt" : "6.6pt"};
    line-height: 1.25;
  }
  .footer {
    margin-top: 1.1mm;
    color: #1673e6;
    font-size: ${labelSize === "compact" ? "4.8pt" : "5.8pt"};
    font-weight: 700;
  }
</style>
</head>
<body>
  <section class="label">
    <img class="qr" src="${qrImage}" alt="QR Code" />
    <div class="content">
      <img class="logo" src="${logoUrl}" alt="Ativelo" />
      <p class="asset-number">${escapeHtml(asset.asset_number)}</p>
      <p class="asset-name">${escapeHtml(asset.name)}</p>
      <p class="meta">Serial: ${escapeHtml(asset.serial_number || "Não informado")}</p>
      <p class="meta">Empresa: ${escapeHtml(organizationName)}</p>
      <p class="footer">Escaneie para identificar o equipamento</p>
    </div>
  </section>
  <script>
    window.addEventListener("load", () => {
      setTimeout(() => {
        window.print();
        window.close();
      }, 250);
    });
  </script>
</body>
</html>`);
    printWindow.document.close();
  };

  return (
    <div className="ativelo-modal-backdrop" role="presentation">
      <section
        className="ativelo-modal ativelo-qr-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Etiqueta QR Code"
      >
        <header>
          <div>
            <span>IDENTIFICAÇÃO DIGITAL</span>
            <h2>Etiqueta com QR Code</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <AppIcon name="close" size={21} />
          </button>
        </header>

        <div className="ativelo-qr-content">
          <div className="ativelo-label-preview">
            <div className="ativelo-label-qr">
              {qrImage ? (
                <img src={qrImage} alt="QR Code do equipamento" />
              ) : (
                <div className="ativelo-qr-loading">Gerando QR...</div>
              )}
            </div>

            <div className="ativelo-label-info">
              <img src="/assets/ativelo-logo.png" alt="Ativelo" />
              <strong>{asset.asset_number}</strong>
              <span>{asset.name}</span>
              <small>Serial: {asset.serial_number || "Não informado"}</small>
              <small>{organizationName}</small>
            </div>
          </div>

          <div className="ativelo-qr-settings">
            <label>
              <span>Tamanho da etiqueta</span>
              <select
                value={labelSize}
                onChange={(event) =>
                  setLabelSize(event.target.value as LabelSize)
                }
              >
                {(Object.keys(labelSizes) as LabelSize[]).map((size) => (
                  <option key={size} value={size}>
                    {labelSizes[size].label}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <span>Conteúdo protegido</span>
              <code>{qrContent}</code>
            </div>

            <p>
              A etiqueta abre o Ativelo e identifica este equipamento usando
              seu identificador público e token exclusivo.
            </p>

            {errorMessage && (
              <div className="ativelo-assets-feedback error">
                {errorMessage}
              </div>
            )}

            <button
              type="button"
              className="primary"
              onClick={printLabel}
              disabled={!qrImage}
            >
              <AppIcon name="print" size={19} />
              Imprimir etiqueta
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

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
