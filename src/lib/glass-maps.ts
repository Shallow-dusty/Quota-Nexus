/**
 * Physical liquid-glass maps for Chromium `backdrop-filter: url(#filter)`.
 *
 * Two maps are generated per element size:
 * - displacement: bends the backdrop. The profile follows the derivative of a
 *   convex squircle cap (a physical lens approximation), so the warp peaks at
 *   the outer rim and eases to zero at the inner bevel — that curved-lens edge
 *   is what reads as solid glass rather than water. Encoded for
 *   feDisplacementMap (R=X, G=Y, 128=neutral).
 * - specular: a dual-band highlight — crisp ~1.8px rim hugging the contour plus
 *   a soft ~12px incident light band, both brighter where the surface normal
 *   faces the light, with a faint opposite bounce.
 *
 * Maps are immutable and expensive to build, so they are cached across elements
 * by full parameter key (same-size cards share one map set).
 *
 * Chromium-only capability; callers must feature-detect and fall back to a
 * plain blur material elsewhere.
 */

export interface GlassMapsOptions {
  width: number;
  height: number;
  /** corner radius px */
  radius?: number;
  /** px width of the refracting rim; default scales with radius */
  bevel?: number | null;
  /** max pixel shift at the edge */
  maxDisp?: number;
  /** refraction multiplier */
  refraction?: number;
  /** degrees; 0 = +x (right), -90 = up. Light comes from the upper area. */
  lightAngle?: number;
  /** directional rim brightness */
  specStrength?: number;
  /** px width of the crisp edge highlight */
  edgeWidth?: number;
  /** always-on edge brightness */
  edgeAmbient?: number;
  /** <1 downsamples the generated map for perf (filter scales it back up) */
  resolution?: number;
}

export interface GlassMaps {
  dispUrl: string;
  specUrl: string;
  /** element-space size the filter should cover (px) */
  width: number;
  height: number;
  maxDisp: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Signed distance to a rounded box centred on origin. Negative inside. */
function sdRoundBox(
  px: number,
  py: number,
  bx: number,
  by: number,
  r: number,
): number {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  const outside = Math.hypot(ax, ay);
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - r;
}

/**
 * Refraction profile of a convex squircle cap: displacement is proportional to
 * the slope of the cap height function (Snell-style lens approximation).
 * x ∈ [0,1]: 0 = inner bevel edge, 1 = outer rim.
 */
function lensProfile(x: number): number {
  const h = (t: number) => Math.pow(1 - Math.pow(1 - t, 4), 0.25);
  const d = (t: number) => {
    const e = 1e-4;
    return (h(Math.min(1, t + e)) - h(Math.max(0, t - e))) / (2 * e);
  };
  const slope = d(clamp01(x));
  const max = d(0.995);
  return clamp01(slope / (max * 1.02));
}

function dataToUrl(data: Uint8ClampedArray, w: number, h: number): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(new ImageData(data as ImageDataArray, w, h), 0, 0);
  return c.toDataURL("image/png");
}

/** Cross-element map cache (same-size surfaces share maps); FIFO with touch. */
const CACHE_LIMIT = 48;
const cache = new Map<string, GlassMaps>();

export function buildGlassMaps({
  width,
  height,
  radius = 20,
  bevel = null,
  maxDisp = 18,
  refraction = 1,
  lightAngle = -75,
  specStrength = 0.95,
  edgeWidth = 1.8,
  edgeAmbient = 0.3,
  resolution = 1,
}: GlassMapsOptions): GlassMaps {
  const cacheKey = JSON.stringify([
    width, height, radius, bevel, maxDisp, refraction,
    lightAngle, specStrength, edgeWidth, edgeAmbient, resolution,
  ]);
  const hit = cache.get(cacheKey);
  if (hit) {
    cache.delete(cacheKey);
    cache.set(cacheKey, hit);
    return hit;
  }

  const w = Math.max(2, Math.round(width * resolution));
  const h = Math.max(2, Math.round(height * resolution));
  const bev = (bevel ?? Math.max(18, Math.min(radius * 1.25, 26))) * resolution;

  const disp = new Uint8ClampedArray(w * h * 4);
  const spec = new Uint8ClampedArray(w * h * 4);

  const cx = w / 2;
  const cy = h / 2;
  const bx = w / 2;
  const by = h / 2;
  const r = Math.min(radius * resolution, Math.min(w, h) / 2);
  const md = Math.max(1e-6, maxDisp * resolution);

  const la = (lightAngle * Math.PI) / 180;
  const lx = Math.cos(la);
  const ly = Math.sin(la);

  const rimWidth = Math.max(1.2, edgeWidth * resolution + 0.7);
  const bandWidth = 12 * resolution;
  const eps = 1;

  for (let y = 0; y < h; y++) {
    const py = y + 0.5 - cy;
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - cx;
      const d = sdRoundBox(px, py, bx, by, r);
      const distIn = -d; // >0 inside, distance from edge

      // outward normal via central differences
      const gx =
        sdRoundBox(px + eps, py, bx, by, r) - sdRoundBox(px - eps, py, bx, by, r);
      const gy =
        sdRoundBox(px, py + eps, bx, by, r) - sdRoundBox(px, py - eps, bx, by, r);
      const gl = Math.hypot(gx, gy) || 1;
      const nx = gx / gl;
      const ny = gy / gl;

      // Convex-lens profile: warp peaks at the outer rim, zero at inner bevel
      const t = clamp01(1 - distIn / bev);
      const prof = lensProfile(t);
      const amount = md * prof * refraction;
      const dx = -nx * amount;
      const dy = -ny * amount;

      const i = (y * w + x) * 4;
      disp[i] = 128 + (dx / md) * 127 * refraction;
      disp[i + 1] = 128 + (dy / md) * 127 * refraction;
      disp[i + 2] = 128;
      disp[i + 3] = 255;

      // Dual-band specular: crisp rim + soft incident light band, faint bounce
      const facing = Math.max(0, nx * lx + ny * ly);
      const back = Math.max(0, -(nx * lx + ny * ly));
      const rim = Math.pow(clamp01(1 - distIn / rimWidth), 1.15);
      const band = Math.pow(clamp01(1 - distIn / bandWidth), 2.0);
      const s =
        rim * (edgeAmbient * 1.4 + specStrength * 1.32 * facing) +
        band * 0.4 * specStrength * facing +
        rim * back * 0.2;
      spec[i] = 255;
      spec[i + 1] = 255;
      spec[i + 2] = 255;
      spec[i + 3] = Math.round(clamp01(s) * 255);
    }
  }

  const maps = {
    dispUrl: dataToUrl(disp, w, h),
    specUrl: dataToUrl(spec, w, h),
    width,
    height,
    maxDisp,
  };
  cache.set(cacheKey, maps);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return maps;
}
