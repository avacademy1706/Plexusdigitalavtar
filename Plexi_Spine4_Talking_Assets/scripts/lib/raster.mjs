/**
 * Small float-RGBA raster toolkit on top of sharp + pngjs.
 * Images are straight-alpha Float32 arrays in 0..1, row-major, 4 channels.
 */
import sharp from "sharp";

export class Img {
  constructor(w, h, data) {
    this.w = w;
    this.h = h;
    this.data = data ?? new Float32Array(w * h * 4);
  }
  static async load(path) {
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const img = new Img(info.width, info.height);
    for (let i = 0; i < data.length; i++) img.data[i] = data[i] / 255;
    return img;
  }
  static async fromSharp(pipeline) {
    const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const img = new Img(info.width, info.height);
    for (let i = 0; i < data.length; i++) img.data[i] = data[i] / 255;
    return img;
  }
  clone() {
    return new Img(this.w, this.h, new Float32Array(this.data));
  }
  idx(x, y) {
    return (y * this.w + x) * 4;
  }
  get(x, y) {
    const i = this.idx(x, y);
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  set(x, y, r, g, b, a) {
    const i = this.idx(x, y);
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }
  toBuffer() {
    const out = Buffer.alloc(this.w * this.h * 4);
    for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(this.data[i] * 255)));
    return out;
  }
  toSharp() {
    return sharp(this.toBuffer(), { raw: { width: this.w, height: this.h, channels: 4 } });
  }
  async save(path) {
    await this.toSharp().png({ compressionLevel: 9 }).toFile(path);
  }
  /** Alpha-weighted bounding box. Returns null if empty. */
  bbox(threshold = 0.004) {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.data[this.idx(x, y) + 3] > threshold) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  crop(x, y, w, h) {
    const out = new Img(w, h);
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const sx = x + xx, sy = y + yy;
        if (sx < 0 || sy < 0 || sx >= this.w || sy >= this.h) continue;
        const si = this.idx(sx, sy), di = out.idx(xx, yy);
        out.data[di] = this.data[si];
        out.data[di + 1] = this.data[si + 1];
        out.data[di + 2] = this.data[si + 2];
        out.data[di + 3] = this.data[si + 3];
      }
    return out;
  }
  /** Trim to alpha bbox plus padding. Returns { img, x, y } with x/y = top-left in the source. */
  trim(pad = 2) {
    const b = this.bbox();
    if (!b) return null;
    const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad);
    const w = Math.min(this.w - x, b.w + pad * 2), h = Math.min(this.h - y, b.h + pad * 2);
    return { img: this.crop(x, y, w, h), x, y, w, h };
  }
}

/** Single-channel float mask. */
export class Mask {
  constructor(w, h, data) {
    this.w = w;
    this.h = h;
    this.data = data ?? new Float32Array(w * h);
  }
  static from(img, fn) {
    const m = new Mask(img.w, img.h);
    for (let y = 0; y < img.h; y++)
      for (let x = 0; x < img.w; x++) {
        const i = img.idx(x, y);
        m.data[y * img.w + x] = fn(img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3], x, y);
      }
    return m;
  }
  static fromFn(w, h, fn) {
    const m = new Mask(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m.data[y * w + x] = fn(x, y);
    return m;
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[y * this.w + x];
  }
  clone() {
    return new Mask(this.w, this.h, new Float32Array(this.data));
  }
  map(fn) {
    const m = new Mask(this.w, this.h);
    for (let i = 0; i < this.data.length; i++) m.data[i] = fn(this.data[i], i);
    return m;
  }
  mul(o) {
    return this.map((v, i) => v * (typeof o === "number" ? o : o.data[i]));
  }
  max(o) {
    return this.map((v, i) => Math.max(v, o.data[i]));
  }
  min(o) {
    return this.map((v, i) => Math.min(v, o.data[i]));
  }
  invert() {
    return this.map((v) => 1 - v);
  }
  sub(o) {
    return this.map((v, i) => Math.max(0, v - o.data[i]));
  }
  threshold(t) {
    return this.map((v) => (v >= t ? 1 : 0));
  }
  sum() {
    let s = 0;
    for (const v of this.data) s += v;
    return s;
  }
  /** Separable box blur, radius r (pixels), repeated `passes` times (3 passes ~ gaussian). */
  blur(r, passes = 3) {
    let cur = this;
    for (let p = 0; p < passes; p++) cur = cur._box(r);
    return cur;
  }
  _box(r) {
    const { w, h } = this;
    const tmp = new Float32Array(w * h);
    const out = new Mask(w, h);
    const n = r * 2 + 1;
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += this.get(Math.min(w - 1, Math.max(0, x)), y);
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc / n;
        acc += this.get(Math.min(w - 1, x + r + 1), y) - this.get(Math.max(0, x - r), y);
      }
    }
    const g = (x, y) => tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += g(x, y);
      for (let y = 0; y < h; y++) {
        out.data[y * w + x] = acc / n;
        acc += g(x, y + r + 1) - g(x, y - r);
      }
    }
    return out;
  }
  /** Euclidean-ish distance (chamfer 3-4) from mask>=0.5 pixels. Returns Mask of distances in px. */
  distanceFrom() {
    const { w, h } = this;
    const INF = 1e9;
    const d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = this.data[i] >= 0.5 ? 0 : INF;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? INF : d[y * w + x]);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
      }
    for (let y = h - 1; y >= 0; y--)
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
      }
    const out = new Mask(w, h);
    for (let i = 0; i < d.length; i++) out.data[i] = d[i] / 3;
    return out;
  }
  dilate(r) {
    return this.distanceFrom().map((v) => (v <= r ? 1 : 0));
  }
  erode(r) {
    return this.invert().dilate(r).invert();
  }
  /** Soft edge: 1 inside, falling to 0 over `r` px outside the >=0.5 region. */
  feather(r) {
    return this.distanceFrom().map((v) => Math.max(0, Math.min(1, 1 - v / r)));
  }
  /** Keep only the connected component (4-neighbour, >=0.5) containing the seed, or the largest one. */
  largestComponent(seed) {
    const { w, h } = this;
    const label = new Int32Array(w * h).fill(-1);
    let best = -1, bestSize = 0, seedLabel = -1, cur = 0;
    const stack = [];
    for (let s = 0; s < w * h; s++) {
      if (this.data[s] < 0.5 || label[s] >= 0) continue;
      let size = 0;
      stack.push(s);
      label[s] = cur;
      while (stack.length) {
        const i = stack.pop();
        size++;
        const x = i % w, y = (i / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (this.data[j] >= 0.5 && label[j] < 0) {
            label[j] = cur;
            stack.push(j);
          }
        }
      }
      if (seed && label[seed[1] * w + seed[0]] === cur) seedLabel = cur;
      if (size > bestSize) {
        bestSize = size;
        best = cur;
      }
      cur++;
    }
    const keep = seedLabel >= 0 ? seedLabel : best;
    return this.map((v, i) => (label[i] === keep ? v : 0));
  }
  /** Remove components smaller than minPx. */
  removeSpecks(minPx) {
    const { w, h } = this;
    const label = new Int32Array(w * h).fill(-1);
    const sizes = [];
    const stack = [];
    for (let s = 0; s < w * h; s++) {
      if (this.data[s] < 0.5 || label[s] >= 0) continue;
      const cur = sizes.length;
      let size = 0;
      stack.push(s);
      label[s] = cur;
      while (stack.length) {
        const i = stack.pop();
        size++;
        const x = i % w, y = (i / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (this.data[j] >= 0.5 && label[j] < 0) {
            label[j] = cur;
            stack.push(j);
          }
        }
      }
      sizes.push(size);
    }
    return this.map((v, i) => (label[i] >= 0 && sizes[label[i]] < minPx ? 0 : v));
  }
  /** Star-shaped contour: sample the >=0.5 region boundary along `n` rays from (cx, cy). */
  contour(cx, cy, n = 32, maxR = 400, smoothTaps = 1) {
    const radii = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const dx = Math.cos(a), dy = Math.sin(a);
      let last = 0;
      for (let r = 0; r < maxR; r += 0.5) {
        const x = Math.round(cx + dx * r), y = Math.round(cy + dy * r);
        if (this.get(x, y) >= 0.5) last = r;
        else if (r - last > 4) break;
      }
      radii.push(last);
    }
    // circular (1,2,1)/4 smoothing of the radius function, applied smoothTaps times
    let sm = radii;
    for (let t = 0; t < smoothTaps; t++) sm = sm.map((v, i) => (sm[(i - 1 + n) % n] + 2 * v + sm[(i + 1) % n]) / 4);
    return sm.map((r, k) => {
      const a = (k / n) * Math.PI * 2;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    });
  }
  async save(path) {
    const img = new Img(this.w, this.h);
    for (let i = 0; i < this.data.length; i++) {
      const v = Math.max(0, Math.min(1, this.data[i]));
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 1;
    }
    await img.save(path);
  }
}

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const smooth = (v, a, b) => clamp01((v - a) / (b - a));

/** Axis-aligned box test in canvas px. */
export const inBox = (x, y, [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** Point-in-polygon (even-odd). */
export function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Piecewise-linear y(x) for a polyline sorted by x. */
export function curveY(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

/** Average colour (straight RGB) of pixels where mask >= 0.5 and alpha > 0.5. */
export function meanColor(img, mask) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < mask.data.length; i++) {
    if (mask.data[i] < 0.5 || img.data[i * 4 + 3] < 0.5) continue;
    r += img.data[i * 4];
    g += img.data[i * 4 + 1];
    b += img.data[i * 4 + 2];
    n++;
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0];
}

/**
 * Diffusion inpainting: pixels where `unknown` >= 0.5 are re-solved from their neighbours
 * (Laplace fill) using a 3-level pyramid so large holes converge fast. Only RGB is solved; the
 * alpha of unknown pixels is set to 1 if any neighbour is known. Known = alpha > 0.5 and not unknown.
 */
export function inpaint(img, unknown, iterations = 200) {
  const { w, h } = img;
  const known = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) known[i] = img.data[i * 4 + 3] > 0.5 && unknown.data[i] < 0.5 ? 1 : 0;
  const unk = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) unk[i] = unknown.data[i] >= 0.5 ? 1 : 0;

  // bounding box of the unknown region (+2px)
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (unk[y * w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) return img;
  x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(w - 1, x1 + 2); y1 = Math.min(h - 1, y1 + 2);

  // seed unknown pixels with the mean of the known boundary
  let sr = 0, sg = 0, sb = 0, sn = 0;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (!known[i]) continue;
      const nb = [i - 1, i + 1, i - w, i + w].some((j) => j >= 0 && j < w * h && unk[j]);
      if (nb) { sr += img.data[i * 4]; sg += img.data[i * 4 + 1]; sb += img.data[i * 4 + 2]; sn++; }
    }
  const seed = sn ? [sr / sn, sg / sn, sb / sn] : [0.5, 0.5, 0.5];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (unk[i]) { img.data[i * 4] = seed[0]; img.data[i * 4 + 1] = seed[1]; img.data[i * 4 + 2] = seed[2]; img.data[i * 4 + 3] = 1; }
    }

  // multi-scale: solve coarse first by running many iterations with a larger stencil (dilated averaging), then fine
  const solve = (step, iters) => {
    for (let it = 0; it < iters; it++) {
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = y * w + x;
          if (!unk[i]) continue;
          let r = 0, g = 0, b = 0, n = 0;
          for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (!known[j] && !unk[j]) continue;
            r += img.data[j * 4]; g += img.data[j * 4 + 1]; b += img.data[j * 4 + 2]; n++;
          }
          if (n) { img.data[i * 4] = r / n; img.data[i * 4 + 1] = g / n; img.data[i * 4 + 2] = b / n; }
        }
    }
  };
  solve(8, Math.round(iterations * 0.4));
  solve(4, Math.round(iterations * 0.4));
  solve(2, Math.round(iterations * 0.4));
  solve(1, iterations);
  return img;
}

/** Composite src over dst (straight alpha, in place). Optional per-pixel mask multiplies src alpha. */
export function over(dst, src, mask) {
  for (let i = 0; i < dst.w * dst.h; i++) {
    let sa = src.data[i * 4 + 3];
    if (mask) sa *= mask.data[i];
    if (sa <= 0) continue;
    const da = dst.data[i * 4 + 3];
    const oa = sa + da * (1 - sa);
    for (let c = 0; c < 3; c++) {
      const sc = src.data[i * 4 + c], dc = dst.data[i * 4 + c];
      dst.data[i * 4 + c] = oa > 0 ? (sc * sa + dc * da * (1 - sa)) / oa : 0;
    }
    dst.data[i * 4 + 3] = oa;
  }
  return dst;
}

/** New image = img with alpha multiplied by mask. */
export function masked(img, mask) {
  const out = img.clone();
  for (let i = 0; i < mask.data.length; i++) out.data[i * 4 + 3] *= clamp01(mask.data[i]);
  return out;
}

/** Flat colour fill where mask > 0 (alpha = mask). */
export function fill(w, h, mask, [r, g, b]) {
  const out = new Img(w, h);
  for (let i = 0; i < mask.data.length; i++) {
    const a = clamp01(mask.data[i]);
    if (a <= 0) continue;
    out.data[i * 4] = r; out.data[i * 4 + 1] = g; out.data[i * 4 + 2] = b; out.data[i * 4 + 3] = a;
  }
  return out;
}

/** Rasterise an SVG document string to an Img of the given size (librsvg via sharp). */
export async function rasterSVG(svg, w, h) {
  const pipeline = sharp(Buffer.from(svg), { density: 72 }).resize(w, h, { fit: "fill" });
  return Img.fromSharp(pipeline);
}

/** Copy RGB from opaque neighbours into transparent pixels (alpha untouched) - avoids dark halos under bilinear/mipmap filtering. */
export function bleed(img, passes = 8) {
  const { w, h } = img;
  const filled = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) filled[i] = img.data[i * 4 + 3] > 0.02 ? 1 : 0;
  for (let p = 0; p < passes; p++) {
    const next = new Uint8Array(filled);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (filled[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (!filled[j]) continue;
          r += img.data[j * 4]; g += img.data[j * 4 + 1]; b += img.data[j * 4 + 2]; n++;
        }
        if (n) { img.data[i * 4] = r / n; img.data[i * 4 + 1] = g / n; img.data[i * 4 + 2] = b / n; next[i] = 1; }
      }
    filled.set(next);
  }
  return img;
}

export const hex = ([r, g, b]) => "#" + [r, g, b].map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("");
export const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export const scaleColor = (c, k) => c.map((v) => clamp01(v * k));
