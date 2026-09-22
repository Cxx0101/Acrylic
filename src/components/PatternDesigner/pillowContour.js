export const DEFAULTS = {
  whiteBorder: 100,
  cutLine: 6,
  dpi: null,
  alphaThreshold: 32,
};

const DISTANCE_INFINITY = 1e9;

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("无法生成 PNG 图像"));
    }, "image/png");
  });
}

function edt1d(values, length) {
  const distance = new Float64Array(length);
  const vertices = new Int32Array(length);
  const intersections = new Float64Array(length + 1);
  let vertexCount = 0;
  vertices[0] = 0;
  intersections[0] = -Infinity;
  intersections[1] = Infinity;

  for (let query = 1; query < length; query += 1) {
    let intersection =
      ((values[query] + query * query) -
        (values[vertices[vertexCount]] +
          vertices[vertexCount] * vertices[vertexCount])) /
      (2 * query - 2 * vertices[vertexCount]);
    while (intersection <= intersections[vertexCount]) {
      vertexCount -= 1;
      intersection =
        ((values[query] + query * query) -
          (values[vertices[vertexCount]] +
            vertices[vertexCount] * vertices[vertexCount])) /
        (2 * query - 2 * vertices[vertexCount]);
    }
    vertexCount += 1;
    vertices[vertexCount] = query;
    intersections[vertexCount] = intersection;
    intersections[vertexCount + 1] = Infinity;
  }

  vertexCount = 0;
  for (let query = 0; query < length; query += 1) {
    while (intersections[vertexCount + 1] < query) vertexCount += 1;
    const delta = query - vertices[vertexCount];
    distance[query] = delta * delta + values[vertices[vertexCount]];
  }
  return distance;
}

function distanceTransform(mask, width, height) {
  const values = new Float64Array(width * height);
  for (let index = 0; index < values.length; index += 1)
    values[index] = mask[index] ? 0 : DISTANCE_INFINITY;

  for (let x = 0; x < width; x += 1) {
    const column = new Float64Array(height);
    for (let y = 0; y < height; y += 1) column[y] = values[y * width + x];
    const transformed = edt1d(column, height);
    for (let y = 0; y < height; y += 1)
      values[y * width + x] = transformed[y];
  }
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    const transformed = edt1d(values.slice(rowOffset, rowOffset + width), width);
    values.set(transformed, rowOffset);
  }
  return values;
}

function getExterior(mask, width, height) {
  const exterior = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  const add = (index) => {
    if (mask[index] || exterior[index]) return;
    exterior[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    add(y * width);
    add(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    if (x > 0) add(index - 1);
    if (x + 1 < width) add(index + 1);
    if (index >= width) add(index - width);
    if (index + width < mask.length) add(index + width);
  }
  return exterior;
}

function makeLayer(width, height, pixels) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").putImageData(
    new ImageData(new Uint8ClampedArray(pixels), width, height),
    0,
    0,
  );
  return canvas;
}

async function decodeSource(input) {
  if (
    input &&
    input.data instanceof Uint8ClampedArray &&
    Number.isInteger(input.width) &&
    Number.isInteger(input.height)
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = input.width;
    canvas.height = input.height;
    canvas.getContext("2d").putImageData(
      new ImageData(new Uint8ClampedArray(input.data), input.width, input.height),
      0,
      0,
    );
    return { canvas, width: input.width, height: input.height };
  }

  const url = URL.createObjectURL(input);
  try {
    const image = await new Promise((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error("无法读取 PNG 图案"));
      candidate.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return { canvas, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Main-thread Canvas version of the contour generator.
 * It intentionally avoids Worker and OffscreenCanvas so it also works in
 * browser environments that block Worker assets.
 */
export async function buildPillowSheetContour(input, options = {}, config = {}) {
  const isRawImage =
    input &&
    input.data instanceof Uint8ClampedArray &&
    Number.isInteger(input.width) &&
    Number.isInteger(input.height);
  if (!(input instanceof Blob) && !isRawImage)
    throw new TypeError("input 必须是 File、Blob 或 RGBA 图像数据");

  const onProgress =
    typeof config.onProgress === "function" ? config.onProgress : () => {};
  onProgress({ progress: 5, stage: "读取图案" });
  const source = await decodeSource(input);
  if (source.width * source.height > 25000000)
    throw new Error("图片过大，请缩小到 2500 万像素以内。");

  const whiteBorder = Math.max(0, Math.round(Number(options.whiteBorder) || 0));
  const cutLine = Math.max(0, Math.round(Number(options.cutLine) || 0));
  const alphaThreshold = Math.max(0, Number(options.alphaThreshold) || DEFAULTS.alphaThreshold);
  const padding = whiteBorder + cutLine;
  const width = source.width + padding * 2;
  const height = source.height + padding * 2;
  if (width * height > 30000000)
    throw new Error("处理后的画布过大，请减小白边、刀线或原图尺寸。");

  onProgress({ progress: 20, stage: "提取透明轮廓" });
  const sourcePixels = source.canvas
    .getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, source.width, source.height).data;
  const mask = new Uint8Array(width * height);
  const artworkMask = new Uint8ClampedArray(width * height * 4);
  let hasSubject = false;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = (y * source.width + x) * 4;
      if (sourcePixels[sourceOffset + 3] <= alphaThreshold) continue;
      const outputX = x + padding;
      const outputY = y + padding;
      const index = outputY * width + outputX;
      const outputOffset = index * 4;
      mask[index] = 1;
      artworkMask[outputOffset] = 255;
      artworkMask[outputOffset + 1] = 255;
      artworkMask[outputOffset + 2] = 255;
      artworkMask[outputOffset + 3] = 255;
      hasSubject = true;
      minX = Math.min(minX, outputX);
      minY = Math.min(minY, outputY);
      maxX = Math.max(maxX, outputX);
      maxY = Math.max(maxY, outputY);
    }
  }
  if (!hasSubject) throw new Error("图案没有可用的不透明内容。");

  onProgress({ progress: 45, stage: "生成白边与刀线" });
  const distance = distanceTransform(mask, width, height);
  const exterior = getExterior(mask, width, height);
  const backingPixels = new Uint8ClampedArray(width * height * 4);
  const pathPixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < mask.length; index += 1) {
    if (!exterior[index]) continue;
    const outputOffset = index * 4;
    const edgeDistance = Math.sqrt(distance[index]);
    if (edgeDistance >= whiteBorder + cutLine) {
      backingPixels[outputOffset] = 255;
      backingPixels[outputOffset + 1] = 255;
      backingPixels[outputOffset + 2] = 255;
      backingPixels[outputOffset + 3] = 255;
    } else if (edgeDistance >= whiteBorder) {
      pathPixels[outputOffset] = 227;
      pathPixels[outputOffset + 1] = 76;
      pathPixels[outputOffset + 2] = 87;
      pathPixels[outputOffset + 3] = 255;
    }
  }

  onProgress({ progress: 72, stage: "绘制图层" });
  const backingCanvas = makeLayer(width, height, backingPixels);
  const pathCanvas = makeLayer(width, height, pathPixels);
  const artworkMaskCanvas = makeLayer(width, height, artworkMask);
  const artworkCanvas = document.createElement("canvas");
  artworkCanvas.width = width;
  artworkCanvas.height = height;
  artworkCanvas.getContext("2d").drawImage(source.canvas, padding, padding);

  const mergedCanvas = document.createElement("canvas");
  mergedCanvas.width = width;
  mergedCanvas.height = height;
  const mergedContext = mergedCanvas.getContext("2d");
  mergedContext.drawImage(artworkCanvas, 0, 0);
  mergedContext.drawImage(backingCanvas, 0, 0);
  mergedContext.drawImage(pathCanvas, 0, 0);

  const [backingBlob, pathBlob, artworkMaskBlob, mergedBlob] = await Promise.all([
    canvasToBlob(backingCanvas),
    canvasToBlob(pathCanvas),
    canvasToBlob(artworkMaskCanvas),
    canvasToBlob(mergedCanvas),
  ]);
  onProgress({ progress: 100, stage: "完成" });
  return {
    blob: mergedBlob,
    contentBlob: backingBlob,
    backingBlob,
    artworkMaskBlob,
    pathBlob,
    mergedBlob,
    width,
    height,
    dpi: options.dpi == null ? 72 : Number(options.dpi),
    sourceDpi: null,
    slot: null,
    segment: null,
    bounds: { minX, minY, maxX, maxY },
  };
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
