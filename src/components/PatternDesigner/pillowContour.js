import { runPillowEngine } from "./pillowEngine";

function makeJobId() {
  return `pillow_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * 主线程版 pillow 轮廓处理（不再使用 Web Worker）。
 * 逻辑与 public/workers/pillow.worker.js 完全一致——算法在 pillowEngine.js。
 *
 * 入参可接受 File/Blob 或原始 RGBA 图像描述符
 * { data: Uint8ClampedArray, width, height, artworkData? }。
 * 返回：
 * {
 *   blob, contentBlob, backingBlob, artworkMaskBlob, pathBlob,
 *   width, height, dpi, sourceDpi, slot, segment, bounds
 * }
 */
export function buildPillowSheetContour(file, options = {}, config = {}) {
  const isRawImage =
    file &&
    file.data instanceof Uint8ClampedArray &&
    Number.isInteger(file.width) &&
    Number.isInteger(file.height);

  if (!(file instanceof Blob) && !isRawImage) {
    return Promise.reject(new TypeError("input 必须是 File、Blob 或 RGBA 图像数据"));
  }

  if (typeof window === "undefined") {
    return Promise.reject(new Error("该方法只能在浏览器端运行"));
  }

  // 原 Worker 路径下的能力检测（OffscreenCanvas / createImageBitmap）交由
  // 引擎内部抛出等价错误，这里不再依赖 Worker。
  const onProgress =
    typeof config.onProgress === "function" ? config.onProgress : null;
  const jobId = makeJobId();

  // 主线程直接调用引擎，复用与 Worker 完全相同的算法实现。
  const rawImage = isRawImage
    ? {
        data: file.data,
        artworkData: file.artworkData || null,
        width: file.width,
        height: file.height,
      }
    : null;
  const input = isRawImage ? null : file;

  return runPillowEngine(input, options, jobId, rawImage, onProgress).then(
    (result) => ({
      blob: result.mergedBlob,
      contentBlob: result.contentBlob,
      backingBlob: result.backingBlob,
      artworkMaskBlob: result.artworkMaskBlob,
      pathBlob: result.pathBlob,
      width: result.width,
      height: result.height,
      dpi: result.dpi,
      sourceDpi: result.sourceDpi,
      slot: result.slot,
      segment: result.segment,
      bounds: result.bounds,
    }),
  );
}

export function downloadBlob(blob, filename = "pillow-contour.png") {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
