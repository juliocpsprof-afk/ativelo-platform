import {
  useEffect,
  useMemo,
  useState,
} from "react";

import AppIcon from "./AppIcon";
import {
  labelSizes,
  printAssetLabels,
  type LabelSize,
} from "../lib/assetLabelPrinting";
import type { AssetRecord } from "../types/assets";


import { recordAuditEvents } from "../lib/auditTrail";
type Props = {
  asset: AssetRecord;
  organizationId: string;
  organizationName: string;
  organizationLogoUrl?: string | null;
  onClose: () => void;
};

export default function AssetQrModal({
  asset,
  organizationId,
  organizationName,
  organizationLogoUrl = null,
  onClose,
}: Props) {
  const [qrImage, setQrImage] = useState("");
  const [labelSize, setLabelSize] =
    useState<LabelSize>("standard");
  const [copies, setCopies] = useState(1);
  const [isPrinting, setIsPrinting] =
    useState(false);
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

  const printLabel = async () => {
    const printWindow = window.open(
      "",
      "_blank",
      "width=1100,height=820",
    );

    if (!printWindow) {
      setErrorMessage(
        "O navegador bloqueou a janela de impressão. Libere os pop-ups e tente novamente.",
      );
      return;
    }

    setIsPrinting(true);
    setErrorMessage(null);

    try {
      await printAssetLabels(printWindow, {
        items: [
          {
            asset,
            copies,
          },
        ],
        labelSize,
        organizationName,
        organizationLogoUrl,
      });

      try {
        await recordAuditEvents(
          organizationId,
          [
            {
              action: "label_printed",
              entityType: "assets",
              entityId: asset.id,
              entityLabel:
                asset.asset_number,
              metadata: {
                mode: "individual",
                copies,
                labelSize,
              },
            },
          ],
          "asset_label_modal",
        );
      } catch (auditError) {
        console.warn(
          "A etiqueta foi preparada, mas o evento de auditoria não foi registrado.",
          auditError,
        );
      }
    } catch (error) {
      printWindow.close();
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível imprimir a etiqueta.",
      );
    } finally {
      setIsPrinting(false);
    }
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
            <span>IDENTIFICAÇÃO DO ATIVO</span>
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
                src={
                  organizationLogoUrl ||
                  "/assets/ativelo-logo.png"
                }
                alt=""
              />

              <strong>{asset.asset_number}</strong>
              <span>{asset.name}</span>
              <small>
                Serial:{" "}
                {asset.serial_number ||
                  asset.service_tag ||
                  "Não informado"}
              </small>
              <small>{organizationName}</small>

              <em>
                QR danificado? Digite este código:
                <b>{asset.asset_number}</b>
              </em>
            </div>
          </div>

          <div className="ativelo-label-print-options">
            <label>
              <span>Tamanho da etiqueta</span>
              <select
                value={labelSize}
                onChange={(event) =>
                  setLabelSize(
                    event.target
                      .value as LabelSize,
                  )
                }
              >
                {(
                  Object.keys(
                    labelSizes,
                  ) as LabelSize[]
                ).map((size) => (
                  <option
                    key={size}
                    value={size}
                  >
                    {labelSizes[size].label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Quantidade de cópias</span>
              <input
                type="number"
                min={1}
                max={20}
                value={copies}
                onChange={(event) =>
                  setCopies(
                    Math.max(
                      1,
                      Math.min(
                        20,
                        Number(
                          event.target.value,
                        ) || 1,
                      ),
                    ),
                  )
                }
              />
            </label>
          </div>

          <div className="ativelo-vision-qr-details">
            <span>Conteúdo compacto</span>
            <code>{qrContent}</code>
            <p>
              As cópias serão agrupadas em folha A4,
              respeitando o tamanho escolhido.
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
              disabled={isPrinting || !qrImage}
              onClick={() =>
                void printLabel()
              }
            >
              {isPrinting
                ? "Preparando..."
                : `Imprimir ${copies} ${
                    copies === 1
                      ? "etiqueta"
                      : "etiquetas"
                  }`}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}