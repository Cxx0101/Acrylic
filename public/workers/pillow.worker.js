'use strict';

const DEFAULTS = {
    whiteBorder: 100,
    cutLine: 6,
    dpi: null,
    alphaThreshold: 32,
    edgeTrim: 3,
    edgeAlphaThreshold: 128,
    minObstacleArea: 500,
    includeInnerHoles: false,
    innerHoleWhiteBorder: 0,
    // 0 表示按照图片尺寸自动计算，适合直接上传的 PNG。
    contourSmoothing: 0,
};

function postProgress(jobId, progress, stage) {
    self.postMessage({ type: 'progress', jobId, progress, stage });
}

function edt1d(f, n) {
    const d = new Float64Array(n);
    const v = new Int32Array(n);
    const z = new Float64Array(n + 1);
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;

    for (let q = 1; q < n; q++) {
        let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) {
            k--;
            s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        }
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = Infinity;
    }

    k = 0;
    for (let q = 0; q < n; q++) {
        while (z[k + 1] < q) k++;
        const dist = q - v[k];
        d[q] = dist * dist + f[v[k]];
    }

    for (let q = 0; q < n; q++) f[q] = d[q];
}

function edt2d(f, w, h) {
    for (let x = 0; x < w; x++) {
        const col = new Float64Array(h);
        for (let y = 0; y < h; y++) col[y] = f[y * w + x];
        edt1d(col, h);
        for (let y = 0; y < h; y++) f[y * w + x] = col[y];
    }

    for (let y = 0; y < h; y++) {
        const row = new Float64Array(w);
        for (let x = 0; x < w; x++) row[x] = f[y * w + x];
        edt1d(row, w);
        for (let x = 0; x < w; x++) f[y * w + x] = row[x];
    }
}

function readUint32BE(bytes, offset) {
    return (
        bytes[offset] * 0x1000000 +
        (bytes[offset + 1] << 16) +
        (bytes[offset + 2] << 8) +
        bytes[offset + 3]
    ) >>> 0;
}

function writeUint32BE(bytes, offset, value) {
    bytes[offset] = (value >>> 24) & 0xff;
    bytes[offset + 1] = (value >>> 16) & 0xff;
    bytes[offset + 2] = (value >>> 8) & 0xff;
    bytes[offset + 3] = value & 0xff;
}

function isPng(bytes) {
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 8) return false;
    for (let i = 0; i < 8; i++) {
        if (bytes[i] !== sig[i]) return false;
    }
    return true;
}

function chunkType(bytes, offset) {
    return String.fromCharCode(
        bytes[offset + 4],
        bytes[offset + 5],
        bytes[offset + 6],
        bytes[offset + 7]
    );
}

function readPngDpiFromBytes(bytes) {
    if (!isPng(bytes)) return null;

    let offset = 8;
    while (offset + 12 <= bytes.length) {
        const length = readUint32BE(bytes, offset);
        const end = offset + 12 + length;
        if (end > bytes.length) break;

        const type = chunkType(bytes, offset);
        if (type === 'pHYs' && length === 9) {
            const dataOffset = offset + 8;
            const xPpm = readUint32BE(bytes, dataOffset);
            const yPpm = readUint32BE(bytes, dataOffset + 4);
            const unit = bytes[dataOffset + 8];
            if (unit === 1 && xPpm > 0 && yPpm > 0) {
                return Math.round(((xPpm + yPpm) / 2) * 0.0254);
            }
            return null;
        }

        if (type === 'IEND') break;
        offset = end;
    }

    return null;
}

let CRC_TABLE = null;
function getCrcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        CRC_TABLE[n] = c >>> 0;
    }
    return CRC_TABLE;
}

function crc32(bytes) {
    const table = getCrcTable();
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
    const typeBytes = new Uint8Array(4);
    for (let i = 0; i < 4; i++) typeBytes[i] = type.charCodeAt(i);

    const chunk = new Uint8Array(12 + data.length);
    writeUint32BE(chunk, 0, data.length);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);

    const crcInput = new Uint8Array(4 + data.length);
    crcInput.set(typeBytes, 0);
    crcInput.set(data, 4);
    writeUint32BE(chunk, 8 + data.length, crc32(crcInput));
    return chunk;
}

function createPhysChunk(dpi) {
    const ppm = Math.max(1, Math.round(Number(dpi) / 0.0254));
    const data = new Uint8Array(9);
    writeUint32BE(data, 0, ppm);
    writeUint32BE(data, 4, ppm);
    data[8] = 1;
    return makePngChunk('pHYs', data);
}

function injectPngDpiBytes(bytes, dpi) {
    if (!isPng(bytes)) return bytes;

    const signature = bytes.slice(0, 8);
    const parts = [signature];
    const phys = createPhysChunk(dpi);
    let inserted = false;
    let offset = 8;

    while (offset + 12 <= bytes.length) {
        const length = readUint32BE(bytes, offset);
        const end = offset + 12 + length;
        if (end > bytes.length) break;

        const type = chunkType(bytes, offset);
        const chunk = bytes.slice(offset, end);

        if (type !== 'pHYs') {
            parts.push(chunk);
        }

        if (type === 'IHDR' && !inserted) {
            parts.push(phys);
            inserted = true;
        }

        offset = end;
        if (type === 'IEND') break;
    }

    if (!inserted) return bytes;

    let total = 0;
    for (const part of parts) total += part.length;
    const out = new Uint8Array(total);
    let cursor = 0;
    for (const part of parts) {
        out.set(part, cursor);
        cursor += part.length;
    }
    return out;
}


async function rgbaToPngBlob(rgba, width, height, dpi) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('无法创建输出 OffscreenCanvas 2D Context');

    ctx.putImageData(new ImageData(rgba, width, height), 0, 0);

    let blob = await canvas.convertToBlob({ type: 'image/png' });
    const pngBytes = new Uint8Array(await blob.arrayBuffer());
    const withDpiBytes = injectPngDpiBytes(pngBytes, dpi);
    return new Blob([withDpiBytes], { type: 'image/png' });
}

async function decodeToRgba(file) {
    let bitmap;
    try {
        bitmap = await createImageBitmap(file, {
            premultiplyAlpha: 'none',
            colorSpaceConversion: 'none',
        });
    } catch (e) {
        bitmap = await createImageBitmap(file);
    }

    const W = bitmap.width;
    const H = bitmap.height;
    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext('2d', {
        alpha: true,
        willReadFrequently: true,
    });

    if (!ctx) {
        bitmap.close();
        throw new Error('无法创建 OffscreenCanvas 2D Context');
    }

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const imageData = ctx.getImageData(0, 0, W, H);
    return {
        data: imageData.data,
        width: W,
        height: H,
        channels: 4,
    };
}

async function buildPillowSheetContour(file, options, jobId, rawImage = null) {
    if (typeof OffscreenCanvas === 'undefined') {
        throw new Error('当前浏览器不支持 OffscreenCanvas');
    }
    if (typeof createImageBitmap === 'undefined') {
        throw new Error('当前浏览器不支持 createImageBitmap');
    }

    const opt = { ...DEFAULTS, ...(options || {}) };
    // Every mask coordinate must be an integer. Fractional borders create
    // fractional TypedArray indexes, which silently leaves the shape mask empty.
    opt.whiteBorder = Math.round(Number(opt.whiteBorder) || 0);
    // Negative white borders follow the zero-border rendering path after the
    // source silhouette has been contracted by this absolute amount.
    const insetAmount = Math.max(0, -opt.whiteBorder);
    if (insetAmount > 0) opt.whiteBorder = 0;
    // Cut lines always extend outward. White borders control whether the
    // backing itself is outside or inset into the artwork.
    opt.cutLine = Math.max(0, Math.round(Number(opt.cutLine) || 0));
    opt.edgeTrim = Math.max(0, Math.round(Number(opt.edgeTrim) || 0));
    opt.minObstacleArea = Math.max(
        0,
        Math.round(Number(opt.minObstacleArea) || 0),
    );
    opt.contourSmoothing = Math.max(
        0,
        Math.round(Number(opt.contourSmoothing) || 0),
    );
    opt.innerHoleWhiteBorder = Math.round(
        Number(opt.innerHoleWhiteBorder) || 0,
    );
    const {
        whiteBorder,
        cutLine,
        dpi,
        alphaThreshold,
        edgeTrim,
        edgeAlphaThreshold,
        minObstacleArea,
        includeInnerHoles,
        innerHoleWhiteBorder,
        contourSmoothing,
    } = opt;

    if (!file && !rawImage) throw new Error('missing input image');
    if (contourSmoothing < 0) {
        throw new Error('contourSmoothing must not be negative');
    }

    postProgress(jobId, 5, '读取 PNG 元数据');
    let sourceDpi = null;
    let data;
    let W;
    let H;
    let ch;
    let rawArtworkData = null;
    if (!rawImage) {
        const originalBytes = new Uint8Array(await file.arrayBuffer());
        sourceDpi = readPngDpiFromBytes(originalBytes);
    }

    postProgress(jobId, 10, '解码图片');
    if (rawImage) {
      W = rawImage.width;
      H = rawImage.height;
      data = new Uint8ClampedArray(rawImage.data);
      ch = 4;
        if (!W || !H || data.length !== W * H * ch) {
        throw new Error('invalid raw RGBA image');
      }
      if (rawImage.artworkData != null) {
        rawArtworkData = new Uint8ClampedArray(rawImage.artworkData);
        if (rawArtworkData.length !== W * H * ch) {
          throw new Error('invalid raw artwork RGBA image');
        }
      }
    } else {
        const decoded = await decodeToRgba(file);
        data = decoded.data;
        W = decoded.width;
        H = decoded.height;
        ch = decoded.channels;
    }
    const finalDpi = dpi != null ? Number(dpi) : (sourceDpi || 72);

    // A zero white border is a direct die-line mode: follow the source alpha
    // silhouette instead of turning concave exterior gaps into a smoothed
    // envelope. Positive/negative borders retain the adaptive smoothing used
    // to make their backing edge less noisy.
    const requestedSmoothing = Number(contourSmoothing);
    const smoothRadius =
        Number.isFinite(requestedSmoothing) && requestedSmoothing > 0
            ? requestedSmoothing
            : whiteBorder === 0
                ? 0
                : Math.max(32, Math.round(Math.min(W, H) * 0.06));
    const outerWhiteBorder = Math.max(0, whiteBorder);
    const pad = outerWhiteBorder + cutLine + smoothRadius;
    const mainOutW = W + pad * 2;
    const mainOutH = H + pad * 2;
    const pixelCount = mainOutW * mainOutH;

    const BIG = 1e9;
    const grid = new Float64Array(pixelCount);
    grid.fill(BIG);
    const isShape = new Uint8Array(pixelCount);
    const isArtwork = new Uint8Array(pixelCount);
    const src = new Uint8Array(pixelCount * 4);
    let rawAlphaPixels = 0;

    postProgress(jobId, 20, '提取 Alpha 主体');
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const si = (y * W + x) * ch;
            const a = data[si + 3];
            const ox = x + pad;
            const oy = y + pad;
            const oi = oy * mainOutW + ox;
            const atEdge = (
                x < edgeTrim || x >= W - edgeTrim ||
                y < edgeTrim || y >= H - edgeTrim
            );
            if (rawImage && a > 0) rawAlphaPixels++;
            // Raw images come from the clean compositing step. Treating every
            // barely-visible anti-aliased pixel as solid makes the traced edge
            // noisy, so they use the same alpha threshold as uploaded PNGs.
            const thr = atEdge
                ? Math.max(alphaThreshold, edgeAlphaThreshold)
                : alphaThreshold;

            if (a > thr) {
                grid[oi] = 0;
                isShape[oi] = 1;
                // For a component composite, artworkData contains only the
                // printable image before the white component mask was drawn.
                // For ordinary PNG input every opaque source pixel is art.
                if (!rawArtworkData || rawArtworkData[si + 3] > thr) {
                    isArtwork[oi] = 1;
                }
                const so = oi * 4;
                src[so] = data[si];
                src[so + 1] = data[si + 1];
                src[so + 2] = data[si + 2];
                src[so + 3] = data[si + 3];
            }
        }
    }

    postProgress(jobId, 32, '过滤孤立噪声');
    const ccLabel = new Int32Array(pixelCount);
    const ccSize = [];
    let ccNext = 1;

    for (let i = 0; i < pixelCount; i++) {
        if (!isShape[i] || ccLabel[i] !== 0) continue;

        const label = ccNext++;
        let sz = 0;
        const stack = [i];
        ccLabel[i] = label;

        while (stack.length) {
            const idx = stack.pop();
            sz++;
            const x = idx % mainOutW;
            const y = (idx - x) / mainOutW;

            if (x > 0) {
                const n = idx - 1;
                if (isShape[n] && ccLabel[n] === 0) {
                    ccLabel[n] = label;
                    stack.push(n);
                }
            }
            if (x < mainOutW - 1) {
                const n = idx + 1;
                if (isShape[n] && ccLabel[n] === 0) {
                    ccLabel[n] = label;
                    stack.push(n);
                }
            }
            if (y > 0) {
                const n = idx - mainOutW;
                if (isShape[n] && ccLabel[n] === 0) {
                    ccLabel[n] = label;
                    stack.push(n);
                }
            }
            if (y < mainOutH - 1) {
                const n = idx + mainOutW;
                if (isShape[n] && ccLabel[n] === 0) {
                    ccLabel[n] = label;
                    stack.push(n);
                }
            }
        }

        ccSize.push(sz);
    }

    for (let i = 0; i < pixelCount; i++) {
        if (isShape[i] && ccSize[ccLabel[i] - 1] < minObstacleArea) {
            isShape[i] = 0;
            isArtwork[i] = 0;
            grid[i] = BIG;
            const o = i * 4;
            src[o] = 0;
            src[o + 1] = 0;
            src[o + 2] = 0;
            src[o + 3] = 0;
        }
    }

    postProgress(jobId, 38, '识别主体外部透明区域');
    // 只把“与画布边界连通”的透明像素视为主体外部。
    // 这样主体内部的透明孔洞不会生成白边或裁剪线。
    // 轮廓可使用平滑后的外包络；默认先指向原始主体。
    let contourShape = isShape;
    const isExterior = new Uint8Array(pixelCount);
    const exteriorQueue = new Int32Array(pixelCount);
    let exteriorHead = 0;
    let exteriorTail = 0;

    function enqueueExterior(idx) {
        if (contourShape[idx] || isExterior[idx]) return;
        isExterior[idx] = 1;
        exteriorQueue[exteriorTail++] = idx;
    }

    // 从输出画布四周的透明像素开始洪泛，得到真正的“外部”。
    for (let x = 0; x < mainOutW; x++) {
        enqueueExterior(x);
        enqueueExterior((mainOutH - 1) * mainOutW + x);
    }
    for (let y = 0; y < mainOutH; y++) {
        enqueueExterior(y * mainOutW);
        enqueueExterior(y * mainOutW + (mainOutW - 1));
    }

    while (exteriorHead < exteriorTail) {
        const idx = exteriorQueue[exteriorHead++];
        const x = idx % mainOutW;
        const y = (idx - x) / mainOutW;

        if (x > 0) enqueueExterior(idx - 1);
        if (x < mainOutW - 1) enqueueExterior(idx + 1);
        if (y > 0) enqueueExterior(idx - mainOutW);
        if (y < mainOutH - 1) enqueueExterior(idx + mainOutW);
    }

    // Preserve the original-alpha exterior before smoothing closes any small
    // gaps. Inner-hole detection must use this mask, otherwise an outer
    // envelope can turn ordinary exterior spacing into false cutout holes.
    const sourceExterior = new Uint8Array(isExterior);

    postProgress(jobId, 42, '分析主体轮廓');
    if (insetAmount > 0) {
        // Contract the zero-white-border silhouette before the normal backing
        // and cut-line pass. This moves both layers inward by the same amount.
        const insetGrid = new Float64Array(pixelCount);
        for (let i = 0; i < pixelCount; i++) {
            insetGrid[i] = isExterior[i] ? 0 : BIG;
        }
        edt2d(insetGrid, mainOutW, mainOutH);
        for (let i = 0; i < pixelCount; i++) {
            if (!isShape[i] || Math.sqrt(insetGrid[i]) > insetAmount) {
                continue;
            }
            isShape[i] = 0;
            isArtwork[i] = 0;
            grid[i] = BIG;
            const o = i * 4;
            src[o] = 0;
            src[o + 1] = 0;
            src[o + 2] = 0;
            src[o + 3] = 0;
        }
        contourShape = isShape;
        isExterior.fill(0);
        exteriorHead = 0;
        exteriorTail = 0;
        for (let x = 0; x < mainOutW; x++) {
            enqueueExterior(x);
            enqueueExterior((mainOutH - 1) * mainOutW + x);
        }
        for (let y = 0; y < mainOutH; y++) {
            enqueueExterior(y * mainOutW);
            enqueueExterior(y * mainOutW + (mainOutW - 1));
        }
        while (exteriorHead < exteriorTail) {
            const idx = exteriorQueue[exteriorHead++];
            const x = idx % mainOutW;
            const y = (idx - x) / mainOutW;
            if (x > 0) enqueueExterior(idx - 1);
            if (x < mainOutW - 1) enqueueExterior(idx + 1);
            if (y > 0) enqueueExterior(idx - mainOutW);
            if (y < mainOutH - 1) enqueueExterior(idx + mainOutW);
        }
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < pixelCount; i++) {
        if (!isShape[i]) continue;
        const x = i % mainOutW;
        const y = (i - x) / mainOutW;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }

    const hasShape = minX !== Infinity;
    if (!hasShape) {
        const detail = rawImage
            ? ` (raw alpha pixels: ${rawAlphaPixels}, size: ${W}x${H})`
            : '';
        throw new Error(`没有检测到有效的非透明主体，请检查 PNG Alpha 或 alphaThreshold${detail}`);
    }

    // 无条码槽版本：输出画布只保留主体四周的 whiteBorder + cutLine 外扩。
    // 不再寻找底部水平段，也不会额外增加矩形区域或画布高度。
    const newOutW = mainOutW;
    const newOutH = mainOutH;

    postProgress(jobId, 50, '计算精确欧氏距离 EDT');
    edt2d(grid, mainOutW, mainOutH);

    // Close nearby gaps before tracing the cut line, producing a smoother
    // outer envelope while the original subject pixels remain untouched.
    let contourGrid = grid;
    if (smoothRadius > 0) {
        const radiusSquared = smoothRadius * smoothRadius;
        const dilated = new Uint8Array(pixelCount);
        for (let i = 0; i < pixelCount; i++) {
            dilated[i] = isShape[i] || grid[i] <= radiusSquared ? 1 : 0;
        }

        const erosionGrid = new Float64Array(pixelCount);
        for (let i = 0; i < pixelCount; i++) {
            erosionGrid[i] = dilated[i] ? BIG : 0;
        }
        edt2d(erosionGrid, mainOutW, mainOutH);

        contourShape = new Uint8Array(pixelCount);
        contourGrid = new Float64Array(pixelCount);
        contourGrid.fill(BIG);
        for (let i = 0; i < pixelCount; i++) {
            contourShape[i] =
                isShape[i] || (dilated[i] && erosionGrid[i] > radiusSquared)
                    ? 1
                    : 0;
            if (contourShape[i]) contourGrid[i] = 0;
        }
        edt2d(contourGrid, mainOutW, mainOutH);

        // The exterior mask must follow the smoothed envelope as well.
        isExterior.fill(0);
        exteriorHead = 0;
        exteriorTail = 0;
        for (let x = 0; x < mainOutW; x++) {
            enqueueExterior(x);
            enqueueExterior((mainOutH - 1) * mainOutW + x);
        }
        for (let y = 0; y < mainOutH; y++) {
            enqueueExterior(y * mainOutW);
            enqueueExterior(y * mainOutW + (mainOutW - 1));
        }
        while (exteriorHead < exteriorTail) {
            const idx = exteriorQueue[exteriorHead++];
            const x = idx % mainOutW;
            const y = (idx - x) / mainOutW;
            if (x > 0) enqueueExterior(idx - 1);
            if (x < mainOutW - 1) enqueueExterior(idx + 1);
            if (y > 0) enqueueExterior(idx - mainOutW);
            if (y < mainOutH - 1) enqueueExterior(idx + mainOutW);
        }
    }

    // The envelope removes gaps, but its distance field can still inherit
    // one- or two-pixel variations from a PNG alpha edge. Smooth that field
    // very lightly before locating the cut line. Unlike expanding the shape
    // again, this keeps the same clearance from the artwork and only removes
    // high-frequency wiggles in the line itself.
    const lineSmoothRadius =
        smoothRadius > 0
            ? Math.max(1, Math.min(4, Math.round(smoothRadius * 0.08)))
            : 0;
    const contourDistance = contourGrid;
    const distanceCap =
        outerWhiteBorder + cutLine + lineSmoothRadius + 2;
    for (let i = 0; i < pixelCount; i++) {
        contourDistance[i] = Math.min(
            distanceCap,
            Math.sqrt(contourDistance[i]),
        );
    }
    const horizontalDistance = new Float64Array(pixelCount);
    const kernelSize = lineSmoothRadius * 2 + 1;
    for (let y = 0; y < mainOutH; y++) {
        const rowOffset = y * mainOutW;
        let sum = 0;
        for (let x = -lineSmoothRadius; x <= lineSmoothRadius; x++) {
            sum += contourDistance[
                rowOffset + Math.max(0, Math.min(mainOutW - 1, x))
            ];
        }
        for (let x = 0; x < mainOutW; x++) {
            horizontalDistance[rowOffset + x] = sum / kernelSize;
            const removeX = Math.max(0, x - lineSmoothRadius);
            const addX = Math.min(mainOutW - 1, x + lineSmoothRadius + 1);
            sum +=
                contourDistance[rowOffset + addX] -
                contourDistance[rowOffset + removeX];
        }
    }
    for (let x = 0; x < mainOutW; x++) {
        let sum = 0;
        for (let y = -lineSmoothRadius; y <= lineSmoothRadius; y++) {
            sum += horizontalDistance[
                Math.max(0, Math.min(mainOutH - 1, y)) * mainOutW + x
            ];
        }
        for (let y = 0; y < mainOutH; y++) {
            contourDistance[y * mainOutW + x] = sum / kernelSize;
            const removeY = Math.max(0, y - lineSmoothRadius);
            const addY = Math.min(mainOutH - 1, y + lineSmoothRadius + 1);
            sum +=
                horizontalDistance[addY * mainOutW + x] -
                horizontalDistance[removeY * mainOutW + x];
        }
    }

    postProgress(jobId, 78, '生成内容图、路径图和合并图');

    // 三张图保持完全相同的尺寸和坐标系。
    // 为避免超大图片同时持有 3 份 RGBA 缓冲，这里复用同一个 out 数组分阶段编码。
    const out = new Uint8ClampedArray(pixelCount * 4);
    // A negative white border is an inset white backing drawn over the
    // artwork's outer edge. Measure only from exterior transparency so holes
    // inside the artwork are unaffected.
    let insetWhiteBorderDistance = null;
    if (whiteBorder < 0) {
        const sourceExterior = new Uint8Array(pixelCount);
        const sourceExteriorQueue = new Int32Array(pixelCount);
        let sourceExteriorHead = 0;
        let sourceExteriorTail = 0;
        const enqueueSourceExterior = (index) => {
            if (isShape[index] || sourceExterior[index]) return;
            sourceExterior[index] = 1;
            sourceExteriorQueue[sourceExteriorTail++] = index;
        };
        for (let x = 0; x < mainOutW; x++) {
            enqueueSourceExterior(x);
            enqueueSourceExterior((mainOutH - 1) * mainOutW + x);
        }
        for (let y = 0; y < mainOutH; y++) {
            enqueueSourceExterior(y * mainOutW);
            // Use the row width here. Using the canvas height as the column
            // left the actual right edge unseeded on non-square images, so
            // the inset white border and cut line disappeared on large parts
            // of the contour.
            enqueueSourceExterior(y * mainOutW + (mainOutW - 1));
        }
        while (sourceExteriorHead < sourceExteriorTail) {
            const index = sourceExteriorQueue[sourceExteriorHead++];
            const x = index % mainOutW;
            const y = (index - x) / mainOutW;
            if (x > 0) enqueueSourceExterior(index - 1);
            if (x < mainOutW - 1) enqueueSourceExterior(index + 1);
            if (y > 0) enqueueSourceExterior(index - mainOutW);
            if (y < mainOutH - 1) enqueueSourceExterior(index + mainOutW);
        }
        insetWhiteBorderDistance = new Float64Array(pixelCount);
        for (let i = 0; i < pixelCount; i++) {
            insetWhiteBorderDistance[i] = sourceExterior[i] ? 0 : BIG;
        }
        edt2d(insetWhiteBorderDistance, mainOutW, mainOutH);
    }
    const isInsetWhiteBorderPixel = (index) =>
        Boolean(insetWhiteBorderDistance) &&
        isShape[index] &&
        Math.sqrt(insetWhiteBorderDistance[index]) <= -whiteBorder;
    const isInsetCutLinePixel = (index) => {
        if (whiteBorder >= 0 || !isInsetWhiteBorderPixel(index)) {
            return false;
        }
        const insetWidth = -whiteBorder;
        const distance = Math.sqrt(insetWhiteBorderDistance[index]);
        // Keep the cut line wholly inside the inset white strip, with its
        // inner edge next to the artwork. This leaves visible white backing
        // outside the red line instead of letting it read as an outer line.
        return (
            distance > Math.max(0, insetWidth - cutLine) &&
            distance <= insetWidth
        );
    };
    // The distance field gives the cut line a smooth geometric boundary, but
    // writing a binary pixel band still leaves a staircase edge on small or
    // scaled previews. Use one pixel of coverage antialiasing at both sides
    // of the band so the visible red outline follows that smooth boundary.
    const cutLineCoverage = (distance) => {
        const outerCoverage = Math.max(
            0,
            Math.min(1, outerWhiteBorder + cutLine - distance + 0.5),
        );
        const innerCoverage = Math.max(
            0,
            Math.min(1, outerWhiteBorder - distance + 0.5),
        );
        return Math.max(0, outerCoverage - innerCoverage);
    };
    const isInnerHole = (index) =>
        includeInnerHoles && !isShape[index] && !sourceExterior[index];
    let innerHoleDistance = null;
    if (includeInnerHoles && innerHoleWhiteBorder < 0) {
        innerHoleDistance = new Float64Array(pixelCount);
        for (let i = 0; i < pixelCount; i++) {
            innerHoleDistance[i] = isInnerHole(i) ? 0 : BIG;
        }
        edt2d(innerHoleDistance, mainOutW, mainOutH);
    }
    const isInsetInnerHolePixel = (index) =>
        Boolean(innerHoleDistance) &&
        isShape[index] &&
        Math.sqrt(innerHoleDistance[index]) <= -innerHoleWhiteBorder;
    const innerHoleCutLineCoverage = (index) => {
        if (innerHoleWhiteBorder < 0) {
            if (!isInsetInnerHolePixel(index)) return 0;
            const distance = Math.sqrt(innerHoleDistance[index]);
            const insetWidth = -innerHoleWhiteBorder;
            const outerCoverage = Math.max(
                0,
                Math.min(1, insetWidth - distance + 0.5),
            );
            const innerCoverage = Math.max(
                0,
                Math.min(1, insetWidth - cutLine - distance + 0.5),
            );
            return Math.max(0, outerCoverage - innerCoverage);
        }
        if (!isInnerHole(index)) return 0;
        // grid is the un-smoothed distance to the original alpha shape. It
        // preserves every transparent inner hole instead of closing it as
        // part of the outer-envelope smoothing pass.
        const distance = Math.sqrt(grid[index]);
        const outerCoverage = Math.max(
            0,
            Math.min(
                1,
                innerHoleWhiteBorder + cutLine - distance + 0.5,
            ),
        );
        const innerCoverage = Math.max(
            0,
            Math.min(1, innerHoleWhiteBorder - distance + 0.5),
        );
        return Math.max(0, outerCoverage - innerCoverage);
    };

    // ------------------------------------------------------------------
    // 1) 内容图：主体 + whiteBorder，不含 cutLine
    // ------------------------------------------------------------------
    for (let i = 0; i < pixelCount; i++) {
        const o = i * 4;

        if (isShape[i]) {
            const isInnerInsetWhite =
                isInsetInnerHolePixel(i) &&
                Math.sqrt(innerHoleDistance[i]) <=
                    Math.max(0, -innerHoleWhiteBorder - cutLine);
            if (isInsetWhiteBorderPixel(i) || isInnerInsetWhite) {
                out[o] = 255;
                out[o + 1] = 255;
                out[o + 2] = 255;
                out[o + 3] = 255;
            } else {
                out[o] = src[o];
                out[o + 1] = src[o + 1];
                out[o + 2] = src[o + 2];
                out[o + 3] = src[o + 3];
            }
            continue;
        }

        if (
            isInnerHole(i) &&
            Math.sqrt(grid[i]) <= innerHoleWhiteBorder
        ) {
            out[o] = 255;
            out[o + 1] = 255;
            out[o + 2] = 255;
            out[o + 3] = 255;
            continue;
        }

        // The closed envelope becomes the white backing between the original
        // subject and its simplified outer cut line.
        if (contourShape[i] && !isInnerHole(i)) {
            out[o] = 255;
            out[o + 1] = 255;
            out[o + 2] = 255;
            out[o + 3] = 255;
            continue;
        }

        // 主体内部透明孔洞保持透明，只处理与画布边缘连通的外部区域。
        if (!isExterior[i]) continue;

        const d = contourDistance[i];
        if (d <= outerWhiteBorder) {
            out[o] = 255;
            out[o + 1] = 255;
            out[o + 2] = 255;
            out[o + 3] = 255;
        }
    }

    postProgress(jobId, 84, '编码内容图 PNG');
    const contentBlob = await rgbaToPngBlob(out, newOutW, newOutH, finalDpi);

    // Dedicated top contour layer. Everything on the outside of the cut line
    // is white through to the canvas edge, while the cut-line interior stays
    // transparent so the artwork can be rendered on the background layer.
    const backing = new Uint8ClampedArray(pixelCount * 4);
    const paintBackingWhite = (offset) => {
        backing[offset] = 255;
        backing[offset + 1] = 255;
        backing[offset + 2] = 255;
        backing[offset + 3] = 255;
    };
    for (let i = 0; i < pixelCount; i++) {
        const o = i * 4;
        if (isInsetInnerHolePixel(i)) {
            const distance = Math.sqrt(innerHoleDistance[i]);
            if (distance <= Math.max(0, -innerHoleWhiteBorder - cutLine)) {
                paintBackingWhite(o);
            }
            continue;
        }
        if (whiteBorder < 0) {
            if (!isShape[i]) {
                // Interior holes remain transparent; all exterior pixels are
                // the white field outside the inset cut line.
                if (isExterior[i]) paintBackingWhite(o);
                continue;
            }
            const insetWidth = -whiteBorder;
            const distance = Math.sqrt(insetWhiteBorderDistance[i]);
            // The white region reaches the outer edge of the inset cut line;
            // its inner side (towards the picture) is transparent.
            if (distance <= Math.max(0, insetWidth - cutLine)) {
                paintBackingWhite(o);
            }
            continue;
        }

        if (
            isInnerHole(i) &&
            Math.sqrt(grid[i]) <= innerHoleWhiteBorder
        ) {
            paintBackingWhite(o);
            continue;
        }

        // Positive/zero white borders use the outside of the external cut
        // contour as the white field. The complete inside is transparent.
        if (!isExterior[i] || isShape[i] || contourShape[i]) continue;
        if (contourDistance[i] >= outerWhiteBorder + cutLine - 0.5) {
            paintBackingWhite(o);
        }
    }
    const backingBlob = await rgbaToPngBlob(
        backing,
        newOutW,
        newOutH,
        finalDpi,
    );

    // Keep the supplied artwork non-destructive. The editor composes this
    // mask with the original/replacement image in a separate layer, so a
    // negative white border reveals the backing instead of repainting image
    // pixels permanently.
    const artworkMask = new Uint8ClampedArray(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
        if (!isArtwork[i] || isInsetWhiteBorderPixel(i)) continue;
        const o = i * 4;
        artworkMask[o] = 255;
        artworkMask[o + 1] = 255;
        artworkMask[o + 2] = 255;
        artworkMask[o + 3] = 255;
    }
    const artworkMaskBlob = await rgbaToPngBlob(
        artworkMask,
        newOutW,
        newOutH,
        finalDpi,
    );

    // ------------------------------------------------------------------
    // 2) 合并图：正白边时补上外扩 cutLine；负白边时把 cutLine
    //    画在内嵌白边靠图片的一侧。
    //    这样效果和旧版单张输出保持一致。
    // ------------------------------------------------------------------
    for (let i = 0; i < pixelCount; i++) {
        if (isInsetCutLinePixel(i)) {
            const o = i * 4;
            out[o] = 227;
            out[o + 1] = 76;
            out[o + 2] = 87;
            out[o + 3] = 255;
        }
        const innerHoleAlpha = innerHoleCutLineCoverage(i);
        if (innerHoleAlpha > 0) {
            const o = i * 4;
            out[o] = 227;
            out[o + 1] = 76;
            out[o + 2] = 87;
            out[o + 3] = Math.round(innerHoleAlpha * 255);
        }
        if (whiteBorder < 0) continue;
        if (!isExterior[i] || contourShape[i]) continue;

        const cutLineAlpha = cutLineCoverage(contourDistance[i]);
        if (cutLineAlpha > 0) {
            const o = i * 4;
            out[o] = 227;
            out[o + 1] = 76;
            out[o + 2] = 87;
            out[o + 3] = Math.round(cutLineAlpha * 255);
        }
    }

    postProgress(jobId, 89, '编码合并图 PNG');
    const mergedBlob = await rgbaToPngBlob(out, newOutW, newOutH, finalDpi);

    // ------------------------------------------------------------------
    // 3) 路径图：清空缓冲，只保留对应位置的 cutLine。
    //    白边、主体、内部孔洞全部透明。
    // ------------------------------------------------------------------
    out.fill(0);

    for (let i = 0; i < pixelCount; i++) {
        if (isInsetCutLinePixel(i)) {
            const o = i * 4;
            out[o] = 227;
            out[o + 1] = 76;
            out[o + 2] = 87;
            out[o + 3] = 255;
        }
        const innerHoleAlpha = innerHoleCutLineCoverage(i);
        if (innerHoleAlpha > 0) {
            const o = i * 4;
            out[o] = 227;
            out[o + 1] = 76;
            out[o + 2] = 87;
            out[o + 3] = Math.round(innerHoleAlpha * 255);
        }
        if (whiteBorder < 0) continue;
        if (!isExterior[i] || contourShape[i]) continue;

        const cutLineAlpha = cutLineCoverage(contourDistance[i]);
        if (cutLineAlpha > 0) {
            const o = i * 4;
            out[o] = 227;
            out[o + 1] = 76;
            out[o + 2] = 87;
            out[o + 3] = Math.round(cutLineAlpha * 255);
        }
    }

    postProgress(jobId, 95, '编码路径图 PNG');
    const pathBlob = await rgbaToPngBlob(out, newOutW, newOutH, finalDpi);

    postProgress(jobId, 100, '完成');

    return {
        // 兼容旧调用方：blob 仍然返回“合并图”。
        blob: mergedBlob,

        // 新增三个明确字段。
        contentBlob, // 主体 + 白边，不含裁剪线
        backingBlob, // 仅白边和组件的底板层
        artworkMaskBlob, // 原图层可见区域；负白边内嵌区域透明
        pathBlob,    // 只有外扩 cutLine 路径，背景透明
        mergedBlob,  // 主体 + 白边 + 裁剪线

        width: newOutW,
        height: newOutH,
        dpi: finalDpi,
        sourceDpi,
        slot: null,
        segment: null,
        bounds: { minX, minY, maxX, maxY },
    };
}

self.onmessage = async (event) => {
    const msg = event.data || {};
    if (msg.type !== 'build') return;

    const { jobId, file, options, rawImage } = msg;
    try {
        const result = await buildPillowSheetContour(file, options, jobId, rawImage);
        // 明确逐字段返回，前端可直接读取：
        // msg.contentBlob / msg.pathBlob / msg.mergedBlob
        self.postMessage({
            type: 'result',
            jobId,

            // 三张 PNG
            contentBlob: result.contentBlob,
            backingBlob: result.backingBlob,
            artworkMaskBlob: result.artworkMaskBlob,
            pathBlob: result.pathBlob,
            mergedBlob: result.mergedBlob,

            // 兼容旧代码：blob 等同 mergedBlob
            blob: result.mergedBlob,

            // 其他元数据
            width: result.width,
            height: result.height,
            dpi: result.dpi,
            sourceDpi: result.sourceDpi,
            slot: result.slot,
            segment: result.segment,
            bounds: result.bounds,
        });
    } catch (error) {
        self.postMessage({
            type: 'error',
            jobId,
            message: error && error.message ? error.message : String(error),
            stack: error && error.stack ? error.stack : '',
        });
    }
};
