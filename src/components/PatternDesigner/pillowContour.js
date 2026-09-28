import { runPillowEngine } from "./pillowEngine";

function makeJobId() {
  return `pillow_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// 把引擎原样返回的结果映射成对外契约一致的字段。
function mapResult(result) {
  return {
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
  };
}

function toRawImage(file) {
  return {
    data: file.data,
    artworkData: file.artworkData || null,
    width: file.width,
    height: file.height,
  };
}

/**
 * 轮廓处理：在主线程直接运行完整引擎（EDT、连通域、4 次 PNG 编码）。
 * 如需避免导入时页面冻结，可在调用方改为 Web Worker 包裹 runPillowEngine。
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

  const onProgress =
    typeof config.onProgress === "function" ? config.onProgress : null;
  const jobId = makeJobId();

  const rawImage = isRawImage ? toRawImage(file) : null;
  const input = isRawImage ? null : file;
  return runPillowEngine(input, options, jobId, rawImage, onProgress).then(
    mapResult,
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
