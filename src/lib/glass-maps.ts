/**
 * Physical liquid-glass maps for Chromium `backdrop-filter: url(#filter)`.
 *
 * Two maps are generated per element size:
 * - displacement: bends the backdrop. Displacement peaks at the bevelled edge
 *   and falls to zero at the centre — that edge concentration is what reads as
 *   glass rather than water. Encoded for feDisplacementMap (R=X, G=Y, 128=neutral).
 * - specular: a crisp ~edgeWidth highlight hugging the contour, brighter where
 *   the surface normal faces the light, plus a faint opposite bounce.
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
function smoothstep(t: number): number {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
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

function dataToUrl(data: Uint8ClampedArray, w: number, h: number): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(new ImageData(data as ImageDataArray, w, h), 0, 0);
  return c.toDataURL("image/png");
}

export function buildGlassMaps({
  width,
  height,
  radius = 18,
  bevel = null,
  maxDisp = 8,
  refraction = 1,
  lightAngle = -65,
  specStrength = 1.25,
  edgeWidth = 1.6,
  edgeAmbient = 0.38,
  resolution = 1,
}: GlassMapsOptions): GlassMaps {
  const w = Math.max(2, Math.round(width * resolution));
  const h = Math.max(2, Math.round(height * resolution));
  const bev = (bevel ?? Math.max(9, Math.min(radius, 15))) * resolution;

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

  const ew = Math.max(0.75, edgeWidth * resolution);
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

      // refraction: peak at the edge, ease to zero across the bevel
      const prof = smoothstep(1 - distIn / bev);
      const amount = md * prof * refraction;
      const dx = -nx * amount;
      const dy = -ny * amount;

      const i = (y * w + x) * 4;
      disp[i] = 128 + (dx / md) * 127 * refraction;
      disp[i + 1] = 128 + (dy / md) * 127 * refraction;
      disp[i + 2] = 128;
      disp[i + 3] = 255;

      // specular: crisp edge line, directional + faint opposite bounce
      const edgeT = clamp01(1 - distIn / ew);
      const facing = Math.max(0, nx * lx + ny * ly);
      const back = Math.max(0, -(nx * lx + ny * ly));
      const s = edgeT * (edgeAmbient + specStrength * facing) + edgeT * back * 0.18;
      spec[i] = 255;
      spec[i + 1] = 255;
      spec[i + 2] = 255;
      spec[i + 3] = Math.round(clamp01(s) * 255);
    }
  }

  return {
    dispUrl: dataToUrl(disp, w, h),
    specUrl: dataToUrl(spec, w, h),
    width,
    height,
    maxDisp,
  };
}
