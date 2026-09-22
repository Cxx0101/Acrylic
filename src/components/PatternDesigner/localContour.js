// Blend a rebuilt cut line only near the actual component/bridge silhouette.
// Pixels beyond this finite distance retain their original RGBA values.
export function mergeLocalContourPixels(
  original,
  rebuilt,
  mask,
  width,
  height,
  radius,
  feather,
) {
  const distances = new Float32Array(width * height);
  for (let index = 0; index < distances.length; index += 1) {
    distances[index] = mask[index * 4 + 3] >= 32 ? 0 : Infinity;
  }
  // Two chamfer passes approximate distance to the rotated component mask,
  // including any bridge; an axis-aligned box would also edit nearby details.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (x > 0) distances[i] = Math.min(distances[i], distances[i - 1] + 1);
      if (y > 0) {
        distances[i] = Math.min(distances[i], distances[i - width] + 1);
        if (x > 0) {
          distances[i] = Math.min(distances[i], distances[i - width - 1] + Math.SQRT2);
        }
        if (x + 1 < width) {
          distances[i] = Math.min(distances[i], distances[i - width + 1] + Math.SQRT2);
        }
      }
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x;
      if (x + 1 < width) distances[i] = Math.min(distances[i], distances[i + 1] + 1);
      if (y + 1 < height) {
        distances[i] = Math.min(distances[i], distances[i + width] + 1);
        if (x > 0) {
          distances[i] = Math.min(distances[i], distances[i + width - 1] + Math.SQRT2);
        }
        if (x + 1 < width) {
          distances[i] = Math.min(distances[i], distances[i + width + 1] + Math.SQRT2);
        }
      }
    }
  }

  const result = new Uint8ClampedArray(original);
  for (let index = 0; index < distances.length; index += 1) {
    const distance = distances[index];
    if (distance >= radius + feather) continue;
    const offset = index * 4;
    if (distance <= radius) {
      result.set(rebuilt.subarray(offset, offset + 4), offset);
      continue;
    }
    const t = (radius + feather - distance) / feather;
    const weight = t * t * (3 - 2 * t);
    const oldAlpha = original[offset + 3] * (1 - weight);
    const newAlpha = rebuilt[offset + 3] * weight;
    const alpha = oldAlpha + newAlpha;
    // Interpolate premultiplied colours so transparent pixels cannot darken
    // the antialiased line at the transition back to the original contour.
    for (let channel = 0; channel < 3; channel += 1) {
      result[offset + channel] = alpha
        ? (original[offset + channel] * oldAlpha +
            rebuilt[offset + channel] * newAlpha) / alpha
        : 0;
    }
    result[offset + 3] = alpha;
  }
  return result;
}

export function getTransformedMaskCoverage(
  primary,
  maskWidth,
  maskHeight,
  interior,
  interiorWidth,
  interiorHeight,
  position,
) {
  const radians = ((Number(position.angle) || 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  let totalWeight = 0;
  let insideWeight = 0;
  for (let y = 0; y < maskHeight; y += 1) {
    for (let x = 0; x < maskWidth; x += 1) {
      const alpha = primary[(y * maskWidth + x) * 4 + 3];
      if (alpha < 32) continue;
      totalWeight += alpha;
      const localX = x + 0.5 - maskWidth / 2;
      const localY = y + 0.5 - maskHeight / 2;
      const targetX = Math.round(position.x + localX * cos - localY * sin);
      const targetY = Math.round(position.y + localX * sin + localY * cos);
      if (
        targetX >= 0 &&
        targetX < interiorWidth &&
        targetY >= 0 &&
        targetY < interiorHeight &&
        interior[(targetY * interiorWidth + targetX) * 4 + 3] >= 32
      ) {
        insideWeight += alpha;
      }
    }
  }
  return totalWeight ? insideWeight / totalWeight : 0;
}

export function insetMaskPixels(source, width, height, radius) {
  const inset = Math.max(0, Number(radius) || 0);
  const distances = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (source[index * 4 + 3] < 32) {
        distances[index] = 0;
      } else {
        // Treat the space beyond the canvas as transparent too. Built-in SVG
        // strokes nearly touch their viewBox, so ignoring it would fail to
        // inset those outer edges.
        distances[index] = Math.min(x + 1, y + 1, width - x, height - y);
      }
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (x > 0) distances[index] = Math.min(distances[index], distances[index - 1] + 1);
      if (y > 0) {
        distances[index] = Math.min(distances[index], distances[index - width] + 1);
        if (x > 0) {
          distances[index] = Math.min(distances[index], distances[index - width - 1] + Math.SQRT2);
        }
        if (x + 1 < width) {
          distances[index] = Math.min(distances[index], distances[index - width + 1] + Math.SQRT2);
        }
      }
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (x + 1 < width) distances[index] = Math.min(distances[index], distances[index + 1] + 1);
      if (y + 1 < height) {
        distances[index] = Math.min(distances[index], distances[index + width] + 1);
        if (x > 0) {
          distances[index] = Math.min(distances[index], distances[index + width - 1] + Math.SQRT2);
        }
        if (x + 1 < width) {
          distances[index] = Math.min(distances[index], distances[index + width + 1] + Math.SQRT2);
        }
      }
    }
  }
  const result = new Uint8ClampedArray(source.length);
  for (let index = 0; index < distances.length; index += 1) {
    if (distances[index] <= inset) continue;
    const offset = index * 4;
    result[offset] = 255;
    result[offset + 1] = 255;
    result[offset + 2] = 255;
    result[offset + 3] = 255;
  }
  return result;
}

export function getMaximumDiameterPair(points, preferredNormal = null) {
  if (!points || points.length < 2) return null;
  const unique = Array.from(
    new Map(points.map((point) => [`${point.x},${point.y}`, point])).values(),
  ).sort((a, b) => a.x - b.x || a.y - b.y);
  if (unique.length < 2) return null;
  const cross = (origin, a, b) =>
    (a.x - origin.x) * (b.y - origin.y) -
    (a.y - origin.y) * (b.x - origin.x);
  const lower = [];
  unique.forEach((point) => {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  });
  const upper = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  const normalLength = preferredNormal
    ? Math.hypot(preferredNormal.x, preferredNormal.y)
    : 0;
  let pair = null;
  let maximumDistance = -1;
  let bestParallelScore = Infinity;
  for (let first = 0; first < hull.length; first += 1) {
    for (let second = first + 1; second < hull.length; second += 1) {
      const dx = hull[second].x - hull[first].x;
      const dy = hull[second].y - hull[first].y;
      const distance = dx * dx + dy * dy;
      // Circular components have several equal maximum diameters. Prefer the
      // one perpendicular to the image-to-component direction so the two
      // connectors land on opposite sides of the attachment.
      const parallelScore = normalLength
        ? Math.abs(
            (dx * preferredNormal.x + dy * preferredNormal.y) /
              (Math.sqrt(distance) * normalLength || 1),
          )
        : 0;
      if (
        distance > maximumDistance + 1e-6 ||
        (Math.abs(distance - maximumDistance) <= 1e-6 &&
          parallelScore < bestParallelScore)
      ) {
        maximumDistance = distance;
        bestParallelScore = parallelScore;
        pair = [hull[first], hull[second]];
      }
    }
  }
  return pair;
}

export function selectSmoothContourPoint(
  candidates,
  target,
  maxDistance,
  avoidPoint = null,
  minimumSeparation = 0,
) {
  let selected = null;
  candidates.forEach((candidate) => {
    if (
      avoidPoint &&
      Math.hypot(candidate.x - avoidPoint.x, candidate.y - avoidPoint.y) <
        minimumSeparation
    ) {
      return;
    }
    const dx = target.x - candidate.x;
    const dy = target.y - candidate.y;
    const distance = Math.hypot(dx, dy);
    if (distance > maxDistance) return;
    const facing = distance
      ? (dx * candidate.normalX + dy * candidate.normalY) / distance
      : 1;
    // Do not connect through the back of the artwork contour.
    if (facing < -0.2) return;
    const smoothness = Math.max(0, Math.min(1, candidate.smoothness || 0));
    const score =
      (distance / Math.max(1, maxDistance)) * 0.7 +
      (1 - smoothness) * 2 +
      (1 - Math.max(0, facing)) * 0.35;
    if (!selected || score < selected.score) {
      selected = { ...candidate, distanceSquared: distance * distance, score };
    }
  });
  return selected;
}

