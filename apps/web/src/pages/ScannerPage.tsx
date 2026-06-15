import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import type { OrganizationContext } from "../App";
import AppIcon from "../components/AppIcon";
import {
  detectBarcodeFromSource,
  readCodeWithFallback,
  readVisibleAssetCode,
} from "../lib/barcodeVision";
import { supabase } from "../lib/supabase";
import type { AssetRecord } from "../types/assets";
import ScannerAssetResultModal from "../components/ScannerAssetResultModal";
type Props = {
  organization: OrganizationContext;
  onBack: () => void;
  onOpenAsset: (assetId: string) => void;
  initialCode?: string | null;
};

type ScannerControls = {
  stop: () => void;
};

type ExtendedCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: {
    min: number;
    max: number;
    step?: number;
  };
  focusMode?: string[];
};

type ParsedAssetCode = {
  publicId: string | null;
  token: string | null;
  assetNumber: string | null;
  barcodeValue: string | null;
  serialNumber: string | null;
  serviceTag: string | null;
};

function wait(milliseconds: number) {
  return new Promise((resolve) =>
    window.setTimeout(resolve, milliseconds),
  );
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(
          new Error(
            "Não foi possível capturar a imagem da câmera.",
          ),
        );
      },
      "image/jpeg",
      0.96,
    );
  });
}

function parseAssetCode(
  rawCode: string,
): ParsedAssetCode {
  const normalized = rawCode.trim();

  const compact = normalized.match(
    /^ATV1\s*[:|]\s*(.+)$/i,
  );

  if (compact?.[1]) {
    return {
      publicId: null,
      token: null,
      assetNumber: compact[1].trim(),
      barcodeValue: compact[1].trim(),
      serialNumber: null,
      serviceTag: null,
    };
  }

  if (normalized.startsWith("ATV:")) {
    const [, publicId, token] = normalized.split(":");

    return {
      publicId: publicId || null,
      token: token || null,
      assetNumber: null,
      barcodeValue: null,
      serialNumber: null,
      serviceTag: null,
    };
  }

  try {
    const url = new URL(normalized);
    const visibleCode =
      url.searchParams.get("code") ??
      url.searchParams.get("patrimonio");

    return {
      publicId: url.searchParams.get("asset"),
      token: url.searchParams.get("token"),
      assetNumber: visibleCode,
      barcodeValue: visibleCode,
      serialNumber: null,
      serviceTag: null,
    };
  } catch {
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        normalized,
      )
    ) {
      return {
        publicId: null,
        token: normalized,
        assetNumber: null,
        barcodeValue: null,
        serialNumber: null,
        serviceTag: null,
      };
    }

    return {
      publicId: null,
      token: null,
      assetNumber: normalized,
      barcodeValue: normalized,
      serialNumber: normalized,
      serviceTag: normalized,
    };
  }
}

export default function ScannerPage({
  organization,
  onBack,
  onOpenAsset,
  initialCode = null,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const handledCodeRef = useRef<string | null>(null);
  const nativeLoopActiveRef = useRef(false);

  const [isCameraActive, setIsCameraActive] =
    useState(false);
  const [isResolving, setIsResolving] =
    useState(false);
  const [resultAsset, setResultAsset] =
    useState<AssetRecord | null>(null);
  const [message, setMessage] =
    useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [stage, setStage] = useState("");
  const [torchSupported, setTorchSupported] =
    useState(false);
  const [torchEnabled, setTorchEnabled] =
    useState(false);
  const [zoomSupported, setZoomSupported] =
    useState(false);
  const [zoomMin, setZoomMin] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);
  const [zoomStep, setZoomStep] = useState(0.1);
  const [zoomValue, setZoomValue] = useState(1);

  const getVideoTrack = useCallback(() => {
    const stream = videoRef.current?.srcObject;

    if (!(stream instanceof MediaStream)) {
      return null;
    }

    return stream.getVideoTracks()[0] ?? null;
  }, []);

  const stopCamera = useCallback(() => {
    nativeLoopActiveRef.current = false;
    controlsRef.current?.stop();
    controlsRef.current = null;

    const stream = videoRef.current?.srcObject;

    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsCameraActive(false);
    setTorchSupported(false);
    setTorchEnabled(false);
    setZoomSupported(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const findAsset = useCallback(
    async (
      parsed: ParsedAssetCode,
    ): Promise<AssetRecord | null> => {
      const candidates: Array<{
        field:
          | "public_id"
          | "qr_token"
          | "asset_number"
          | "barcode_value"
          | "serial_number"
          | "service_tag";
        value: string | null;
      }> = [
        { field: "public_id", value: parsed.publicId },
        { field: "qr_token", value: parsed.token },
        {
          field: "asset_number",
          value: parsed.assetNumber,
        },
        {
          field: "barcode_value",
          value: parsed.barcodeValue,
        },
        {
          field: "serial_number",
          value: parsed.serialNumber,
        },
        {
          field: "service_tag",
          value: parsed.serviceTag,
        },
      ];

      const attempted = new Set<string>();

      for (const candidate of candidates) {
        const value = candidate.value?.trim();

        if (!value) {
          continue;
        }

        const key = `${candidate.field}:${value.toLowerCase()}`;

        if (attempted.has(key)) {
          continue;
        }

        attempted.add(key);

        const { data, error } = await supabase
          .from("assets")
          .select("*")
          .eq(
            "organization_id",
            organization.organizationId,
          )
          .eq(candidate.field, value)
          .limit(1)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (data) {
          return data as AssetRecord;
        }
      }

      return null;
    },
    [organization.organizationId],
  );

  const resolveCode = useCallback(
    async (rawCode: string) => {
      const normalizedCode = rawCode.trim();

      if (
        !normalizedCode ||
        handledCodeRef.current === normalizedCode
      ) {
        return;
      }

      handledCodeRef.current = normalizedCode;
      setIsResolving(true);
      setMessage(null);
      setResultAsset(null);
      setStage("Localizando o equipamento...");

      try {
        const asset = await findAsset(
          parseAssetCode(normalizedCode),
        );

        if (!asset) {
          throw new Error(
            "O código foi lido, mas nenhum equipamento correspondente foi encontrado nesta empresa.",
          );
        }

        setResultAsset(asset);
        setManualCode(asset.asset_number);
        setMessage(
          "Equipamento identificado com sucesso.",
        );
        stopCamera();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível interpretar o código.",
        );
        handledCodeRef.current = null;
      } finally {
        setStage("");
        setIsResolving(false);
      }
    },
    [findAsset, stopCamera],
  );

  useEffect(() => {
    if (initialCode) {
      void resolveCode(initialCode);
    }
  }, [initialCode, resolveCode]);

  const configureCameraTrack = useCallback(async () => {
    await wait(350);

    const track = getVideoTrack();

    if (!track) {
      return;
    }

    const capabilities =
      track.getCapabilities() as ExtendedCapabilities;

    const advanced: Array<Record<string, unknown>> = [];

    if (
      capabilities.focusMode?.includes("continuous")
    ) {
      advanced.push({
        focusMode: "continuous",
      });
    }

    if (advanced.length > 0) {
      try {
        await track.applyConstraints({
          advanced:
            advanced as unknown as MediaTrackConstraintSet[],
        });
      } catch {
        // Alguns navegadores anunciam o recurso, mas rejeitam a aplicação.
      }
    }

    if (capabilities.torch) {
      setTorchSupported(true);
    }

    if (capabilities.zoom) {
      const minimum = Number(capabilities.zoom.min) || 1;
      const maximum = Number(capabilities.zoom.max) || minimum;
      const step = Number(capabilities.zoom.step) || 0.1;

      setZoomSupported(maximum > minimum);
      setZoomMin(minimum);
      setZoomMax(maximum);
      setZoomStep(step);
      setZoomValue(minimum);
    }
  }, [getVideoTrack]);

  const startNativeDetectionLoop =
    useCallback(async () => {
      nativeLoopActiveRef.current = true;

      while (
        nativeLoopActiveRef.current &&
        videoRef.current
      ) {
        const video = videoRef.current;

        if (video.readyState >= 2) {
          const value =
            await detectBarcodeFromSource(video);

          if (value) {
            await resolveCode(value);
            return;
          }
        }

        await wait(320);
      }
    }, [resolveCode]);

  const startCamera = async () => {
    setMessage(null);
    setResultAsset(null);
    setStage("Abrindo a câmera traseira...");
    handledCodeRef.current = null;
    stopCamera();

    if (!videoRef.current) {
      setMessage(
        "O leitor de câmera ainda não está pronto.",
      );
      setStage("");
      return;
    }

    try {
      const { BrowserMultiFormatReader } =
        await import("@zxing/browser");

      const reader = new BrowserMultiFormatReader();

      const controls =
        await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: {
                ideal: "environment",
              },
              width: {
                ideal: 1920,
                min: 1280,
              },
              height: {
                ideal: 1080,
                min: 720,
              },
              frameRate: {
                ideal: 30,
              },
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
      setStage(
        "Aponte para o QR Code ou código de barras.",
      );

      await configureCameraTrack();
      void startNativeDetectionLoop();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Não foi possível acessar a câmera: ${error.message}`
          : "Não foi possível acessar a câmera.",
      );
      setStage("");
      stopCamera();
    }
  };

  const setTorch = async () => {
    const track = getVideoTrack();

    if (!track) {
      return;
    }

    const nextValue = !torchEnabled;

    try {
      await track.applyConstraints({
        advanced: [
          {
            torch: nextValue,
          } as unknown as MediaTrackConstraintSet,
        ],
      });
      setTorchEnabled(nextValue);
    } catch {
      setMessage(
        "A lanterna foi anunciada pelo aparelho, mas o navegador não permitiu ativá-la.",
      );
    }
  };

  const setZoom = async (value: number) => {
    setZoomValue(value);

    const track = getVideoTrack();

    if (!track) {
      return;
    }

    try {
      await track.applyConstraints({
        advanced: [
          {
            zoom: value,
          } as unknown as MediaTrackConstraintSet,
        ],
      });
    } catch {
      setMessage(
        "Não foi possível aplicar o zoom nesta câmera.",
      );
    }
  };

  const captureCurrentFrame = async (): Promise<Blob> => {
    const video = videoRef.current;

    if (
      !video ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      throw new Error(
        "A câmera ainda não gerou uma imagem válida.",
      );
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error(
        "Não foi possível preparar a captura.",
      );
    }

    context.drawImage(video, 0, 0);
    return canvasToBlob(canvas);
  };

  const readWrittenCodeFromCamera = async () => {
    setIsResolving(true);
    setMessage(null);
    handledCodeRef.current = null;

    try {
      const frame = await captureCurrentFrame();
      const code = await readVisibleAssetCode(
        frame,
        setStage,
      );

      if (!code) {
        throw new Error(
          "O texto da etiqueta não ficou legível. Aproxime a câmera, evite reflexos ou digite o código.",
        );
      }

      setManualCode(code);
      await resolveCode(code);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível ler o código escrito.",
      );
    } finally {
      setStage("");
      setIsResolving(false);
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

    try {
      const code = await readCodeWithFallback(
        file,
        setStage,
      );

      if (!code) {
        throw new Error(
          "Nenhum QR Code, código de barras ou código alfanumérico legível foi encontrado.",
        );
      }

      setManualCode(code);
      await resolveCode(code);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível ler a imagem.",
      );
      handledCodeRef.current = null;
    } finally {
      setStage("");
      setIsResolving(false);
    }
  };

  const submitManualCode = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    handledCodeRef.current = null;
    void resolveCode(manualCode);
  };

  return (
    <main className="ativelo-scanner-page">
      <header className="ativelo-scanner-header">
        <div>
          <button
            type="button"
            className="ativelo-back-link"
            onClick={onBack}
          >
            ← Voltar ao painel
          </button>

          <span>IDENTIFICAÇÃO MULTICAMADA</span>
          <h1>Leitor de etiquetas</h1>
          <p>
            Leia QR Code, código de barras ou o código
            alfanumérico impresso na etiqueta.
          </p>
        </div>
      </header>

      <section className="ativelo-scanner-grid">
        <article className="ativelo-scanner-card">
          <div className="ativelo-scanner-video">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
            />

            {!isCameraActive && (
              <div className="ativelo-scanner-placeholder">
                <AppIcon name="scan" size={50} />
                <strong>Câmera desativada</strong>
                <span>
                  Ative a câmera traseira ou envie uma
                  imagem.
                </span>
              </div>
            )}

            {isCameraActive && (
              <>
                <div
                  className="ativelo-scanner-frame"
                  aria-hidden="true"
                >
                  <i />
                  <i />
                  <i />
                  <i />
                </div>

                <span className="ativelo-vision-camera-hint">
                  Centralize o código e mantenha o celular
                  firme.
                </span>
              </>
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
              {isCameraActive
                ? "Reiniciar câmera"
                : "Ativar câmera"}
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
                capture="environment"
                hidden
                onChange={(event) =>
                  void scanImage(
                    event.target.files?.[0],
                  )
                }
              />
            </label>
          </div>

          {isCameraActive && (
            <div className="ativelo-vision-camera-controls">
              {torchSupported && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void setTorch()}
                >
                  {torchEnabled
                    ? "Desligar lanterna"
                    : "Ligar lanterna"}
                </button>
              )}

              {zoomSupported && (
                <label>
                  <span>Zoom {zoomValue.toFixed(1)}×</span>
                  <input
                    type="range"
                    min={zoomMin}
                    max={zoomMax}
                    step={zoomStep}
                    value={zoomValue}
                    onChange={(event) =>
                      void setZoom(
                        Number(event.target.value),
                      )
                    }
                  />
                </label>
              )}

              <button
                type="button"
                className="secondary"
                disabled={isResolving}
                onClick={() =>
                  void readWrittenCodeFromCamera()
                }
              >
                Ler código escrito
              </button>
            </div>
          )}

          <p className="ativelo-scanner-note">
            Se o QR Code estiver riscado, apagado ou com
            reflexo, use “Ler código escrito” ou digite o
            patrimônio abaixo.
          </p>

          <form
            className="ativelo-vision-manual-form"
            onSubmit={submitManualCode}
          >
            <label>
              <span>Código da etiqueta</span>
              <input
                value={manualCode}
                onChange={(event) =>
                  setManualCode(event.target.value)
                }
                placeholder="Ex.: NOTE-00015, serial ou service tag"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </label>

            <button
              type="submit"
              className="primary"
              disabled={
                isResolving || !manualCode.trim()
              }
            >
              Localizar equipamento
            </button>
          </form>

          {stage && (
            <div className="ativelo-vision-stage">
              <span />
              {stage}
            </div>
          )}
        </article>      <article className="ativelo-scanner-result ativelo-scanner-feedback-panel">
        <span>LEITURA</span>
        <h2>Status do scanner</h2>

        {isResolving ? (
          <div className="ativelo-scanner-empty">
            <AppIcon name="scan" size={38} />
            <strong>Analisando a etiqueta...</strong>
            <span>{stage || "Aguarde."}</span>
          </div>
        ) : message && !resultAsset ? (
          <div className="ativelo-scanner-message">
            {message}
          </div>
        ) : (
          <div className="ativelo-scanner-empty">
            <AppIcon name="scan" size={38} />
            <strong>Aguardando leitura</strong>
            <span>
              O resultado será aberto em uma janela
              assim que a etiqueta for identificada.
            </span>
          </div>
        )}
      </article>
    </section>

    {resultAsset && !isResolving && (
      <ScannerAssetResultModal
        asset={resultAsset}
        onClose={() => {
          setResultAsset(null);
          setMessage(null);
          handledCodeRef.current = null;
        }}
        onOpenAsset={() =>
          onOpenAsset(resultAsset.id)
        }
        onScanAnother={() => {
          setResultAsset(null);
          setMessage(null);
          setManualCode("");
          handledCodeRef.current = null;
          void startCamera();
        }}
      />
    )}
    </main>
  );
}