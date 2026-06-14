import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import type { OrganizationContext } from "../App";
import AppIcon from "../components/AppIcon";
import { supabase } from "../lib/supabase";
import type { AssetRecord } from "../types/assets";
import { statusLabels } from "../types/assets";

type Props = {
  organization: OrganizationContext;
  onBack: () => void;
  onOpenAsset: (assetId: string) => void;
  initialCode?: string | null;
};

type ScannerControls = {
  stop: () => void;
};

export default function ScannerPage({
  organization,
  onBack,
  onOpenAsset,
  initialCode = null,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const handledCodeRef = useRef<string | null>(null);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [resultAsset, setResultAsset] = useState<AssetRecord | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setIsCameraActive(false);

    const stream = videoRef.current?.srcObject;

    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const resolveCode = useCallback(
    async (rawCode: string) => {
      const normalizedCode = rawCode.trim();

      if (!normalizedCode || handledCodeRef.current === normalizedCode) {
        return;
      }

      handledCodeRef.current = normalizedCode;
      setIsResolving(true);
      setMessage(null);
      setResultAsset(null);

      try {
        const parsed = parseAssetCode(normalizedCode);

        if (!parsed.publicId && !parsed.token) {
          throw new Error(
            "O código lido não pertence a uma etiqueta do Ativelo.",
          );
        }

        let query = supabase
          .from("assets")
          .select("*")
          .eq("organization_id", organization.organizationId);

        if (parsed.publicId) {
          query = query.eq("public_id", parsed.publicId);
        }

        if (parsed.token) {
          query = query.eq("qr_token", parsed.token);
        }

        const { data, error } = await query.limit(1).maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error(
            "O equipamento não foi encontrado nesta empresa.",
          );
        }

        setResultAsset(data as AssetRecord);
        setMessage("Equipamento identificado com sucesso.");
        stopCamera();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível interpretar o código.",
        );
        handledCodeRef.current = null;
      } finally {
        setIsResolving(false);
      }
    },
    [organization.organizationId, stopCamera],
  );

  useEffect(() => {
    if (initialCode) {
      void resolveCode(initialCode);
    }
  }, [initialCode, resolveCode]);

  const startCamera = async () => {
    setMessage(null);
    setResultAsset(null);
    handledCodeRef.current = null;
    stopCamera();

    if (!videoRef.current) {
      setMessage("O leitor de câmera ainda não está pronto.");
      return;
    }

    try {
      const codeReader = new BrowserQRCodeReader();

      const controls = await codeReader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current,
        (result) => {
          if (result) {
            void resolveCode(result.getText());
          }
        },
      );

      controlsRef.current = controls;
      setIsCameraActive(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Não foi possível acessar a câmera: ${error.message}`
          : "Não foi possível acessar a câmera.",
      );
      stopCamera();
    }
  };

  const scanImage = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setMessage(null);
    setResultAsset(null);
    handledCodeRef.current = null;
    setIsResolving(true);

    const objectUrl = URL.createObjectURL(file);

    try {
      const codeReader = new BrowserQRCodeReader();
      const result = await codeReader.decodeFromImageUrl(objectUrl);
      await resolveCode(result.getText());
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Não foi possível ler a imagem: ${error.message}`
          : "Não foi possível ler o QR Code da imagem.",
      );
      handledCodeRef.current = null;
    } finally {
      URL.revokeObjectURL(objectUrl);
      setIsResolving(false);
    }
  };

  return (
    <main className="ativelo-scanner-page">
      <header className="ativelo-scanner-header">
        <div>
          <button type="button" onClick={onBack}>
            ← Voltar ao painel
          </button>
          <p>IDENTIFICAÇÃO INSTANTÂNEA</p>
          <h1>Leitor de QR Code</h1>
          <span>
            Use a câmera do celular ou envie uma imagem para localizar o
            equipamento.
          </span>
        </div>

        <img src="/assets/ativelo-logo.png" alt="Ativelo" />
      </header>

      <section className="ativelo-scanner-layout">
        <article className="ativelo-scanner-card">
          <div className="ativelo-scanner-video">
            <video ref={videoRef} muted playsInline />

            {!isCameraActive && (
              <div className="ativelo-scanner-placeholder">
                <AppIcon name="scan" size={50} />
                <strong>Câmera desativada</strong>
                <span>
                  Toque no botão abaixo para autorizar o acesso à câmera.
                </span>
              </div>
            )}

            {isCameraActive && (
              <div className="ativelo-scanner-frame" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </div>
            )}
          </div>

          <div className="ativelo-scanner-actions">
            <button
              type="button"
              className="primary"
              onClick={() => void startCamera()}
              disabled={isResolving}
            >
              <AppIcon name="camera" size={19} />
              {isCameraActive ? "Reiniciar câmera" : "Ativar câmera"}
            </button>

            {isCameraActive && (
              <button
                type="button"
                className="secondary"
                onClick={stopCamera}
              >
                Parar câmera
              </button>
            )}

            <label className="secondary ativelo-file-scan">
              <AppIcon name="image" size={19} />
              Ler imagem
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(event) =>
                  void scanImage(event.target.files?.[0])
                }
              />
            </label>
          </div>

          <p className="ativelo-camera-note">
            Em celulares, dê preferência à câmera traseira. O navegador
            solicitará sua autorização antes de iniciar.
          </p>
        </article>

        <article className="ativelo-scanner-result-card">
          <div className="ativelo-detail-section-heading">
            <div>
              <span>RESULTADO</span>
              <h2>Equipamento identificado</h2>
            </div>
          </div>

          {isResolving ? (
            <div className="ativelo-inline-empty">
              <AppIcon name="scan" size={34} />
              <strong>Analisando o código...</strong>
            </div>
          ) : resultAsset ? (
            <div className="ativelo-scan-result">
              <div className="ativelo-scan-result-icon">
                <AppIcon name="assets" size={32} />
              </div>

              <span className={`status ${resultAsset.operational_status}`}>
                {statusLabels[resultAsset.operational_status] ??
                  resultAsset.operational_status}
              </span>

              <h3>{resultAsset.name}</h3>
              <strong>{resultAsset.asset_number}</strong>

              <dl>
                <div>
                  <dt>Serial</dt>
                  <dd>{resultAsset.serial_number || "Não informado"}</dd>
                </div>
                <div>
                  <dt>Hostname</dt>
                  <dd>{resultAsset.hostname || "Não informado"}</dd>
                </div>
                <div>
                  <dt>Responsável</dt>
                  <dd>
                    {resultAsset.assigned_person_name || "Não atribuído"}
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                className="primary"
                onClick={() => onOpenAsset(resultAsset.id)}
              >
                Abrir ficha completa
                <AppIcon name="chevron" size={18} />
              </button>
            </div>
          ) : (
            <div className="ativelo-inline-empty">
              <AppIcon name="tag" size={34} />
              <strong>Aguardando leitura</strong>
              <span>
                O equipamento aparecerá aqui assim que o QR Code for
                reconhecido.
              </span>
            </div>
          )}

          {message && (
            <div
              className={`ativelo-assets-feedback ${
                resultAsset ? "success" : "error"
              }`}
            >
              {message}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}

function parseAssetCode(rawCode: string): {
  publicId: string | null;
  token: string | null;
} {
  if (rawCode.startsWith("ATV:")) {
    const [, publicId, token] = rawCode.split(":");

    return {
      publicId: publicId || null,
      token: token || null,
    };
  }

  try {
    const url = new URL(rawCode);

    return {
      publicId: url.searchParams.get("asset"),
      token: url.searchParams.get("token"),
    };
  } catch {
    return {
      publicId: null,
      token: isUuid(rawCode) ? rawCode : null,
    };
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
