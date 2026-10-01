/* Copyright 2025 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// stephanrauh/pdf.js#14 modified by ngx-extended-pdf-viewer: the eraser's
// geometry, from the fork's rework of mozilla/pdf.js#20227. The whole file is
// ngx-specific.

/**
 * Geometry helpers shared by the editors that can be erased (see
 * EraserEditor). The eraser is a circle swept along the pointer path; the
 * erasable content is described by polylines or rectangles in layer pixels.
 */

/**
 * @returns {Array<number>|null} The parameter interval [t0, t1] of the
 *   segment AB lying inside the circle (t0 may be < 0 and t1 > 1 when an
 *   endpoint is inside), or null when the segment doesn't touch the circle.
 */
function segmentInCircle(ax, ay, bx, by, cx, cy, r2) {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - r2;
  if (a === 0) {
    // Degenerate segment.
    return c <= 0 ? [0, 1] : null;
  }
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) {
    return null;
  }
  const sq = Math.sqrt(disc);
  const t0 = (-b - sq) / (2 * a);
  const t1 = (-b + sq) / (2 * a);
  if (t1 < 0 || t0 > 1) {
    return null;
  }
  return [t0, t1];
}

/**
 * Remove from the polylines everything lying inside the circle of center
 * (cx, cy) and radius r. Segments crossing the circle are cut at the
 * intersection points, so the remaining polylines end exactly at the eraser
 * boundary and not at the nearest sampled point.
 * @param {Array<Float32Array>} paths - Polylines [x0, y0, x1, y1, ...].
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @returns {{paths: Array<Float32Array>, modified: boolean}} The remaining
 *   polylines (the input array when nothing was removed).
 */
function clipPathsWithCircle(paths, cx, cy, r) {
  const r2 = r * r;
  const newPaths = [];
  let modified = false;

  for (const path of paths) {
    const len = path.length;
    if (len === 2) {
      // A single dot.
      const dx = path[0] - cx;
      const dy = path[1] - cy;
      if (dx * dx + dy * dy <= r2) {
        modified = true;
      } else {
        newPaths.push(path);
      }
      continue;
    }

    let current = null;
    const flush = () => {
      if (current && current.length >= 4) {
        newPaths.push(new Float32Array(current));
      }
      current = null;
    };

    let ax = path[0];
    let ay = path[1];
    for (let i = 2; i < len; i += 2) {
      const bx = path[i];
      const by = path[i + 1];
      const inside = segmentInCircle(ax, ay, bx, by, cx, cy, r2);
      if (!inside) {
        current ??= [ax, ay];
        current.push(bx, by);
      } else {
        modified = true;
        const [t0, t1] = inside;
        if (t0 > 0) {
          // The segment enters the circle: keep the part before it.
          current ??= [ax, ay];
          current.push(ax + (bx - ax) * t0, ay + (by - ay) * t0);
        }
        flush();
        if (t1 < 1) {
          // The segment leaves the circle: start a new path from there.
          current = [ax + (bx - ax) * t1, ay + (by - ay) * t1, bx, by];
        }
      }
      ax = bx;
      ay = by;
    }
    flush();
  }

  return { paths: modified ? newPaths : paths, modified };
}

/**
 * Call `callback(cx, cy)` for each position of a circle of radius r sampled
 * along the move from (prevX, prevY) to (x, y), the start excluded.
 * With a step of r/2 the sampled circles leave a gap of at most 3% of r, so
 * a fast move can't jump over what lies between two pointer events.
 */
function forEachSweepSample(x, y, r, prevX, prevY, callback) {
  const dx = x - prevX;
  const dy = y - prevY;
  const step = Math.max(r / 2, 1);
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / step));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    callback(prevX + dx * t, prevY + dy * t);
  }
}

/**
 * Remove from the polylines everything swept by the circle of radius r
 * moving from (prevX, prevY) to (x, y).
 * @param {Array<Float32Array>} paths
 * @param {number} x
 * @param {number} y
 * @param {number} r
 * @param {number} [prevX]
 * @param {number} [prevY]
 * @returns {{paths: Array<Float32Array>, modified: boolean}}
 */
function sweepCircleOverPaths(paths, x, y, r, prevX = x, prevY = y) {
  let modified = false;
  forEachSweepSample(x, y, r, prevX, prevY, (cx, cy) => {
    const result = clipPathsWithCircle(paths, cx, cy, r);
    paths = result.paths;
    modified ||= result.modified;
  });
  return { paths, modified };
}

/**
 * @param {Array<Float32Array>} paths
 * @param {number} [margin] - Added on each side.
 * @returns {Array<number>|null} The bounding box [left, top, right, bottom]
 *   of the polylines, or null when there is no point.
 */
function getPathsBBox(paths, margin = 0) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of paths) {
    for (let i = 0, ii = path.length; i < ii; i += 2) {
      minX = Math.min(minX, path[i]);
      minY = Math.min(minY, path[i + 1]);
      maxX = Math.max(maxX, path[i]);
      maxY = Math.max(maxY, path[i + 1]);
    }
  }
  if (minX === Infinity) {
    return null;
  }
  return [minX - margin, minY - margin, maxX + margin, maxY + margin];
}

/**
 * Build the exact, invertible mapping between the PDF page coordinates used by
 * a drawing editor's serialized points and the layer pixels used by the
 * eraser, for the given view rotation.
 * @param {number} rotation - The view rotation (0/90/180/270).
 * @param {{width: number, height: number}} layerRect - The editor layer size.
 * @param {Array<number>} pageTranslation - [pageX, pageY].
 * @param {Array<number>} pageDimensions - [pageWidth, pageHeight].
 * @returns {{toLayer: Function, toPage: Function}}
 */
function makeLayerTransform(
  rotation,
  { width: layerW, height: layerH },
  [pageX, pageY],
  [pageW, pageH]
) {
  switch ((rotation || 0) % 360) {
    case 90:
      return {
        toLayer: (px, py) => [
          ((py - pageY) / pageH) * layerW,
          ((px - pageX) / pageW) * layerH,
        ],
        toPage: (lx, ly) => [
          pageX + (ly / layerH) * pageW,
          pageY + (lx / layerW) * pageH,
        ],
      };
    case 180:
      return {
        toLayer: (px, py) => [
          (1 - (px - pageX) / pageW) * layerW,
          ((py - pageY) / pageH) * layerH,
        ],
        toPage: (lx, ly) => [
          pageX + (1 - lx / layerW) * pageW,
          pageY + (ly / layerH) * pageH,
        ],
      };
    case 270:
      return {
        toLayer: (px, py) => [
          (1 - (py - pageY) / pageH) * layerW,
          (1 - (px - pageX) / pageW) * layerH,
        ],
        toPage: (lx, ly) => [
          pageX + (1 - ly / layerH) * pageW,
          pageY + (1 - lx / layerW) * pageH,
        ],
      };
    default:
      return {
        toLayer: (px, py) => [
          ((px - pageX) / pageW) * layerW,
          (1 - (py - pageY) / pageH) * layerH,
        ],
        toPage: (lx, ly) => [
          pageX + (lx / layerW) * pageW,
          pageY + (1 - ly / layerH) * pageH,
        ],
      };
  }
}

export {
  clipPathsWithCircle,
  getPathsBBox,
  makeLayerTransform,
  sweepCircleOverPaths,
};
