// 下载图片的物理尺寸处理工具。
// 逻辑与 PatternDesigner.resizeDownloadBlob / setPngDpi 保持一致：
// 源像素 crop → 高质量缩放到目标物理像素 → PNG 写入 pHYs DPI 元数据。
// 抽成独立模块供刀线设计页（SvgCutlineDesigner）等复用。

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createPngChunk(type, data) {
  const typeBytes = new Uint8Array(
    type.split("").map((char) => char.charCodeAt(0)),
  );
  const payload = new Uint8Array(typeBytes.length + data.length);
  payload.set(typeBytes);
  payload.set(data, typeBytes.length);
  const chunk = new Uint8Array(data.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(payload, 4);
  view.setUint32(8 + data.length, crc32(payload));
  return chunk;
}

// 向 PNG 插入 pHYs chunk，使图片文件携带物理 DPI 信息。
export async function setPngDpi(blob, dpi) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (pngSignature.some((value, index) => bytes[index] !== value)) {
    return blob;
  }

  const pixelsPerMeter = Math.round(Math.max(1, dpi) / 0.0254);
  const physicalData = new Uint8Array(9);
  const physicalView = new DataView(physicalData.buffer);
  physicalView.setUint32(0, pixelsPerMeter);
  physicalView.setUint32(4, pixelsPerMeter);
  physicalData[8] = 1;
  const physicalChunk = createPngChunk("pHYs", physicalData);
  const chunks = [bytes.slice(0, 8)];
  let offset = 8;
  let inserted = false;

  while (offset + 12 <= bytes.length) {
    const length = new DataView(
      bytes.buffer,
      bytes.byteOffset + offset,
      4,
    ).getUint32(0);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) return blob;
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    if (type !== "pHYs") chunks.push(bytes.slice(offset, chunkEnd));
    if (type === "IHDR" && !inserted) {
      chunks.push(physicalChunk);
      inserted = true;
    }
    offset = chunkEnd;
  }
  return new Blob(chunks, { type: "image/png" });
}

// 把源图像（canvas/image 元素）的 crop 区域高质量缩放到目标像素尺寸，
// 输出携带 DPI 元数据的 PNG Blob。
export async function cropResizeToPngBlob(
  source,
  crop,
  targetWidth,
  targetHeight,
  dpi,
) {
  const cropLeft = Math.max(0, Math.floor(crop.left));
  const cropTop = Math.max(0, Math.floor(crop.top));
  const cropWidth = Math.min(
    source.width - cropLeft,
    Math.max(1, Math.ceil(crop.right) - cropLeft),
  );
  const cropHeight = Math.min(
    source.height - cropTop,
    Math.max(1, Math.ceil(crop.bottom) - cropTop),
  );
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    source,
    cropLeft,
    cropTop,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const output = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("Failed to resize the download image"));
    }, "image/png");
  });
  return setPngDpi(output, dpi);
}
