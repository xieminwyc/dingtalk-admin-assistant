type PreparedComposerImage = {
  name: string;
  previewUrl: string;
  uploadUrl: string;
  optimized: boolean;
};

type PrepareComposerImageOptions = {
  maxUploadBytes?: number;
  maxDimension?: number;
  readFileAsDataUrl?: (file: File) => Promise<string>;
  compressDataUrl?: (input: {
    dataUrl: string;
    fileType: string;
    maxBytes: number;
    maxDimension: number;
  }) => Promise<string>;
};

const DEFAULT_MAX_UPLOAD_BYTES = 1_500_000;
const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_SCALE_FACTORS = [1, 0.85, 0.7, 0.55];
const DEFAULT_JPEG_QUALITIES = [0.92, 0.82, 0.72, 0.62];

function normalizeImageName(file: File) {
  return file.name || "clipboard-image.png";
}

function estimateDataUrlPayloadBytes(dataUrl: string) {
  const trimmed = dataUrl.trim();
  const commaIndex = trimmed.indexOf(",");

  if (commaIndex < 0) {
    return trimmed.length;
  }

  const payload = trimmed.slice(commaIndex + 1);
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string" && reader.result.length > 0) {
        resolve(reader.result);
        return;
      }

      reject(new Error("图片读取失败"));
    };
    reader.onerror = () => {
      reject(new Error("图片读取失败"));
    };
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片压缩失败"));
    image.src = dataUrl;
  });
}

function resolveTargetDimensions(input: {
  width: number;
  height: number;
  maxDimension: number;
}) {
  const longestEdge = Math.max(input.width, input.height);

  if (longestEdge <= input.maxDimension) {
    return {
      width: input.width,
      height: input.height,
    };
  }

  const scale = input.maxDimension / longestEdge;
  return {
    width: Math.max(1, Math.round(input.width * scale)),
    height: Math.max(1, Math.round(input.height * scale)),
  };
}

async function compressDataUrl(input: {
  dataUrl: string;
  fileType: string;
  maxBytes: number;
  maxDimension: number;
}) {
  const image = await loadImage(input.dataUrl);
  const baseSize = resolveTargetDimensions({
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    maxDimension: input.maxDimension,
  });
  const outputType = input.fileType === "image/webp" ? "image/webp" : "image/jpeg";
  let bestCandidate: string | null = null;
  let bestBytes = Number.POSITIVE_INFINITY;

  for (const scaleFactor of DEFAULT_SCALE_FACTORS) {
    const width = Math.max(1, Math.round(baseSize.width * scaleFactor));
    const height = Math.max(1, Math.round(baseSize.height * scaleFactor));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("图片压缩失败");
    }

    context.drawImage(image, 0, 0, width, height);

    for (const quality of DEFAULT_JPEG_QUALITIES) {
      const candidate = canvas.toDataURL(outputType, quality);
      const candidateBytes = estimateDataUrlPayloadBytes(candidate);

      if (candidateBytes < bestBytes) {
        bestCandidate = candidate;
        bestBytes = candidateBytes;
      }

      if (candidateBytes <= input.maxBytes) {
        return candidate;
      }
    }
  }

  if (!bestCandidate) {
    throw new Error("图片压缩失败");
  }

  return bestCandidate;
}

export async function prepareComposerImage(
  file: File,
  options: PrepareComposerImageOptions = {},
): Promise<PreparedComposerImage> {
  const maxUploadBytes = options.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const sourceDataUrl = await (options.readFileAsDataUrl ?? readFileAsDataUrl)(
    file,
  );
  const sourceBytes = estimateDataUrlPayloadBytes(sourceDataUrl);

  if (sourceBytes <= maxUploadBytes) {
    return {
      name: normalizeImageName(file),
      previewUrl: sourceDataUrl,
      uploadUrl: sourceDataUrl,
      optimized: false,
    };
  }

  const optimizedDataUrl = await (options.compressDataUrl ?? compressDataUrl)({
    dataUrl: sourceDataUrl,
    fileType: file.type,
    maxBytes: maxUploadBytes,
    maxDimension,
  });
  const optimizedBytes = estimateDataUrlPayloadBytes(optimizedDataUrl);

  if (optimizedBytes > maxUploadBytes) {
    throw new Error("图片过大，请裁剪后重试。");
  }

  return {
    name: normalizeImageName(file),
    previewUrl: sourceDataUrl,
    uploadUrl: optimizedDataUrl,
    optimized: optimizedDataUrl !== sourceDataUrl,
  };
}
