export const DEFAULTS = {
  whiteBorder: 100,
  cutLine: 6,
  dpi: null,
};

function makeJobId() {
  return `pillow_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Worker-based pillow sheet contour processing.
 * Accepts a File/Blob or a raw RGBA image descriptor
 * { data: Uint8ClampedArray, width, height, artworkData? }.
 * Returns:
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

  if (typeof Worker === "undefined") {
    return Promise.reject(new Error("当前浏览器不支持 Web Worker"));
  }

  const workerUrl = config.workerUrl || "/workers/pillow.worker.js";
  const onProgress =
    typeof config.onProgress === "function" ? config.onProgress : null;
  const jobId = makeJobId();

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl);
    let settled = false;

    const cleanup = () => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };

    worker.onmessage = (event) => {
      const msg = event.data || {};
      if (msg.jobId !== jobId) return;

      if (msg.type === "progress") {
        if (onProgress) {
          onProgress({
            progress: msg.progress,
            stage: msg.stage,
          });
        }
        return;
      }

      if (msg.type === "result") {
        settled = true;
        cleanup();
        const {
          contentBlob,
          backingBlob,
          artworkMaskBlob,
          pathBlob,
          mergedBlob,
        } = msg;
        resolve({
          blob: mergedBlob,
          contentBlob,
          backingBlob,
          artworkMaskBlob,
          pathBlob,
          width: msg.width,
          height: msg.height,
          dpi: msg.dpi,
          sourceDpi: msg.sourceDpi,
          slot: msg.slot,
          segment: msg.segment,
          bounds: msg.bounds,
        });
        return;
      }

      if (msg.type === "error") {
        settled = true;
        cleanup();
        const error = new Error(msg.message || "图片处理失败");
        if (msg.stack) error.workerStack = msg.stack;
        reject(error);
      }
    };

    worker.onerror = (event) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(event.message || "Web Worker 执行失败"));
    };

    const payload = {
      type: "build",
      jobId,
      file: isRawImage ? null : file,
      rawImage: isRawImage
        ? {
            data: file.data.buffer,
            artworkData: file.artworkData ? file.artworkData.buffer : null,
            width: file.width,
            height: file.height,
          }
        : null,
      options: {
        ...DEFAULTS,
        ...options,
      },
    };
    worker.postMessage(
      payload,
      isRawImage
        ? [
            file.data.buffer,
            ...(file.artworkData ? [file.artworkData.buffer] : []),
          ]
        : [],
    );
  });
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
