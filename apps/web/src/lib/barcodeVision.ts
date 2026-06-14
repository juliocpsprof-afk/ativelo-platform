export type VisionStageReporter = (message: string) => void;

type DetectedBarcodeLike = {
  rawValue: string;
  format?: string;
};

type BarcodeDetectorInstance = {
  detect(
    source:
      | Blob
      | HTMLCanvasElement
      | HTMLImageElement
      | HTMLVideoElement
      | ImageBitmap,
  ): Promise<DetectedBarcodeLike[]>;
};

type BarcodeDetectorConstructor = {
  new (options?: {
    formats?: string[];
  }): BarcodeDetectorInstance;
  getSupportedFormats?(): Promise<string[]>;
};

const preferredFormats = [
  "qr_code",
  "code_128",
  "code_39",
  "data_matrix",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "itf",
  "codabar",
  "aztec",
  "pdf417",
];

function getBarcodeDetectorConstructor():
  | BarcodeDetectorConstructor
  | null {
  const candidate = (
    globalThis as typeof globalThis & {
      BarcodeDetector?: BarcodeDetectorConstructor;
    }
  ).BarcodeDetector;

  return candidate ?? null;
}

async function createNativeDetector():
  Promise<BarcodeDetectorInstance | null> {
  const Constructor = getBarcodeDetectorConstructor();

  if (!Constructor) {
    return null;
  }

  try {
    const supported =
      typeof Constructor.getSupportedFormats === "function"
        ? await Constructor.getSupportedFormats()
        : preferredFormats;

    const formats = preferredFormats.filter((format) =>
      supported.includes(format),
    );

    return new Constructor(
      formats.length > 0
        ? { formats }
        : undefined,
    );
  } catch {
    try {
      return new Constructor();
    } catch {
      return null;
    }
  }
}

function createCanvas(
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function drawScaledBitmap(
  bitmap: ImageBitmap,
  cropRatio = 1,
): HTMLCanvasElement {
  const maxDimension = 2200;
  const cropWidth = bitmap.width * cropRatio;
  const cropHeight = bitmap.height * cropRatio;
  const sourceX = (bitmap.width - cropWidth) / 2;
  const sourceY = (bitmap.height - cropHeight) / 2;
  const scale = Math.min(
    1,
    maxDimension / Math.max(cropWidth, cropHeight),
  );

  const canvas = createCanvas(
    cropWidth * scale,
    cropHeight * scale,
  );
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error(
      "O navegador não conseguiu preparar a imagem.",
    );
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return canvas;
}

function transformCanvas(
  source: HTMLCanvasElement,
  mode: "contrast" | "threshold",
): HTMLCanvasElement {
  const target = createCanvas(source.width, source.height);
  const context = target.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    return source;
  }

  context.drawImage(source, 0, 0);
  const imageData = context.getImageData(
    0,
    0,
    target.width,
    target.height,
  );
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const gray = Math.round(
      red * 0.299 +
        green * 0.587 +
        blue * 0.114,
    );

    let value = gray;

    if (mode === "contrast") {
      value = Math.max(
        0,
        Math.min(255, (gray - 128) * 1.75 + 128),
      );
    }

    if (mode === "threshold") {
      value = gray >= 150 ? 255 : 0;
    }

    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
  }

  context.putImageData(imageData, 0, 0);
  return target;
}

export async function createVisionCanvases(
  blob: Blob,
): Promise<HTMLCanvasElement[]> {
  const bitmap = await createImageBitmap(blob);

  try {
    const original = drawScaledBitmap(bitmap, 1);
    const centered = drawScaledBitmap(bitmap, 0.84);
    const contrast = transformCanvas(original, "contrast");
    const threshold = transformCanvas(original, "threshold");
    const centeredContrast = transformCanvas(
      centered,
      "contrast",
    );

    return [
      original,
      centered,
      contrast,
      threshold,
      centeredContrast,
    ];
  } finally {
    bitmap.close();
  }
}

export async function detectBarcodeFromSource(
  source:
    | Blob
    | HTMLCanvasElement
    | HTMLImageElement
    | HTMLVideoElement
    | ImageBitmap,
): Promise<string> {
  const detector = await createNativeDetector();

  if (!detector) {
    return "";
  }

  try {
    const results = await detector.detect(source);
    return (
      results
        .map((result) => result.rawValue?.trim())
        .find(Boolean) ?? ""
    );
  } catch {
    return "";
  }
}

async function decodeCanvasWithZxing(
  canvas: HTMLCanvasElement,
): Promise<string> {
  const { BrowserMultiFormatReader } =
    await import("@zxing/browser");

  const reader = new BrowserMultiFormatReader();
  const dataUrl = canvas.toDataURL("image/png");

  try {
    const result = await reader.decodeFromImageUrl(dataUrl);
    return result.getText().trim();
  } catch {
    return "";
  }
}

export async function readBarcodeFromBlob(
  blob: Blob,
  onStage?: VisionStageReporter,
): Promise<string> {
  onStage?.("Tentando o leitor nativo do celular...");

  const directNative = await detectBarcodeFromSource(blob);

  if (directNative) {
    return directNative;
  }

  onStage?.("Preparando contraste e enquadramento...");

  const canvases = await createVisionCanvases(blob);

  for (const canvas of canvases) {
    const nativeValue =
      await detectBarcodeFromSource(canvas);

    if (nativeValue) {
      return nativeValue;
    }
  }

  onStage?.("Tentando o leitor compatível ZXing...");

  for (const canvas of canvases) {
    const zxingValue =
      await decodeCanvasWithZxing(canvas);

    if (zxingValue) {
      return zxingValue;
    }
  }

  return "";
}

function normalizeOcrCandidate(value: string): string {
  return value
    .replace(/[|]/g, "I")
    .replace(/[“”"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractAssetCodeFromText(
  rawText: string,
): string {
  const text = rawText
    .replace(/\r/g, "")
    .replace(/[^\S\n]+/g, " ");

  const compactCode = text.match(
    /\bATV\s*1\s*[:|\-]?\s*([A-Z0-9._/\\-]{2,60})/i,
  );

  if (compactCode?.[1]) {
    return `ATV1:${normalizeOcrCandidate(compactCode[1])}`;
  }

  const labeledCode = text.match(
    /(?:patrim[oô]nio|c[oó]digo|asset\s*(?:number|code)?|etiqueta)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/\\-]{2,59})/i,
  );

  if (labeledCode?.[1]) {
    return normalizeOcrCandidate(labeledCode[1]);
  }

  const candidates = text
    .split(/\n+/)
    .flatMap((line) =>
      line.match(/[A-Z0-9][A-Z0-9._/\\-]{3,39}/gi) ?? [],
    )
    .map(normalizeOcrCandidate)
    .filter(
      (candidate) =>
        /\d/.test(candidate) &&
        /[A-Z]/i.test(candidate) &&
        !/^(WINDOWS|INTEL|MODEL|SERIAL|PRODUCT)$/i.test(
          candidate,
        ),
    )
    .sort((left, right) => right.length - left.length);

  return candidates[0] ?? "";
}

export async function readVisibleAssetCode(
  blob: Blob,
  onStage?: VisionStageReporter,
): Promise<string> {
  onStage?.("Tentando reconhecer o código escrito...");

  const canvases = await createVisionCanvases(blob);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");

  try {
    await worker.setParameters({
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._/:# ",
      preserve_interword_spaces: "1",
    });

    for (const canvas of canvases.slice(0, 4)) {
      const recognition = await worker.recognize(canvas);
      const candidate = extractAssetCodeFromText(
        recognition.data.text,
      );

      if (candidate) {
        return candidate;
      }
    }

    return "";
  } finally {
    await worker.terminate();
  }
}

export async function readCodeWithFallback(
  blob: Blob,
  onStage?: VisionStageReporter,
): Promise<string> {
  const barcode = await readBarcodeFromBlob(blob, onStage);

  if (barcode) {
    return barcode;
  }

  return readVisibleAssetCode(blob, onStage);
}