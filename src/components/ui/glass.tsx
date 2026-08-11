import {
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import { buildGlassMaps, type GlassMapsOptions } from "../../lib/glass-maps";

/**
 * Liquid-glass surface for Chromium `backdrop-filter: url(#filter)`.
 *
 * The backdrop is blurred + saturated, then refracted through a per-size
 * displacement map and finished with a specular edge highlight. Chromium is the
 * only engine that accepts an SVG filter as `backdrop-filter`, so elsewhere
 * (or when transparency is off / reduced / forced-colors) the surface falls
 * back to a plain translucent blur material with the same tint and border.
 */

export type GlassOptions = Partial<
  Pick<
    GlassMapsOptions,
    "bevel" | "maxDisp" | "refraction" | "lightAngle" | "specStrength" | "edgeWidth" | "edgeAmbient"
  >
>;

export interface GlassSurfaceProps<T extends ElementType = "div"> {
  as?: T;
  /** corner radius px — kept in sync between the CSS border-radius and the map */
  radius?: number;
  /** backdrop frosted blur px */
  blur?: number;
  saturate?: number;
  glass?: GlassOptions;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/* ---------- feature / preference detection ---------- */

let supportsUrl: boolean | null = null;
export function supportsBackdropUrl(): boolean {
  if (supportsUrl !== null) return supportsUrl;
  try {
    supportsUrl =
      typeof CSS !== "undefined" &&
      (CSS.supports("backdrop-filter", "url(#g)") ||
        CSS.supports("-webkit-backdrop-filter", "url(#g)"));
  } catch {
    supportsUrl = false;
  }
  return supportsUrl;
}

function prefersPlain(): boolean {
  if (typeof window === "undefined") return true;
  const root = document.documentElement;
  if (root.dataset.transparency === "off") return true;
  const mm = (q: string) => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  if (mm("(prefers-reduced-transparency: reduce)")) return true;
  if (mm("(forced-colors: active)")) return true;
  return false;
}

/** True when the expensive refraction filter should run. */
export function glassEnabled(): boolean {
  return supportsBackdropUrl() && !prefersPlain();
}

/* ---------- filter DOM ---------- */

const SVGNS = "http://www.w3.org/2000/svg";
let defsEl: SVGDefsElement | null = null;
let seq = 0;

function ensureDefs(): SVGDefsElement {
  if (defsEl && document.body.contains(defsEl)) return defsEl;
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "fixed";
  svg.style.inset = "0";
  svg.style.pointerEvents = "none";
  defsEl = document.createElementNS(SVGNS, "defs") as SVGDefsElement;
  svg.appendChild(defsEl);
  document.body.appendChild(svg);
  return defsEl;
}

function sub(parent: Element, name: string, attrs: Record<string, string | number>): void {
  const el = document.createElementNS(SVGNS, name);
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  parent.appendChild(el);
}

function applyGlassFilter(
  el: HTMLElement,
  maps: ReturnType<typeof buildGlassMaps>,
  { blur, saturate }: { blur: string; saturate: string },
): () => void {
  const defs = ensureDefs();
  const id = `qn-glass-${++seq}`;
  const filter = document.createElementNS(SVGNS, "filter");
  filter.setAttribute("id", id);
  filter.setAttribute("primitiveUnits", "userSpaceOnUse");
  filter.setAttribute("x", "-20");
  filter.setAttribute("y", "-20");
  filter.setAttribute("width", String(maps.width + 40));
  filter.setAttribute("height", String(maps.height + 40));
  filter.setAttribute("colorInterpolationFilters", "sRGB");
  defs.appendChild(filter);

  // 1. Refraction with per-channel dispersion: R/B channels are displaced
  // ±9% around G, so chromatic fringing appears only where displacement is
  // non-zero (the bevelled edge) — physical, no artificial mask needed.
  sub(filter, "feImage", {
    href: maps.dispUrl,
    x: 0,
    y: 0,
    width: maps.width,
    height: maps.height,
    preserveAspectRatio: "none",
    result: "dispmap",
  });
  const dispStrong = (maps.maxDisp * 1.09).toFixed(2);
  const dispWeak = (maps.maxDisp * 0.91).toFixed(2);
  sub(filter, "feDisplacementMap", {
    in: "SourceGraphic",
    in2: "dispmap",
    scale: dispStrong,
    xChannelSelector: "R",
    yChannelSelector: "G",
    result: "dispR",
  });
  sub(filter, "feDisplacementMap", {
    in: "SourceGraphic",
    in2: "dispmap",
    scale: maps.maxDisp,
    xChannelSelector: "R",
    yChannelSelector: "G",
    result: "dispG",
  });
  sub(filter, "feDisplacementMap", {
    in: "SourceGraphic",
    in2: "dispmap",
    scale: dispWeak,
    xChannelSelector: "R",
    yChannelSelector: "G",
    result: "dispB",
  });
  // Keep alpha on every channel: SVG filters run on premultiplied colors, so an
  // alpha=0 channel would lose its RGB contribution in the arithmetic sum.
  sub(filter, "feColorMatrix", {
    in: "dispR",
    type: "matrix",
    values: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1",
    result: "chR",
  });
  sub(filter, "feColorMatrix", {
    in: "dispG",
    type: "matrix",
    values: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 0 1",
    result: "chG",
  });
  sub(filter, "feColorMatrix", {
    in: "dispB",
    type: "matrix",
    values: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 0 1",
    result: "chB",
  });
  sub(filter, "feComposite", {
    in: "chR",
    in2: "chG",
    operator: "arithmetic",
    k1: 0,
    k2: 1,
    k3: 1,
    k4: 0,
    result: "rg",
  });
  sub(filter, "feComposite", {
    in: "rg",
    in2: "chB",
    operator: "arithmetic",
    k1: 0,
    k2: 1,
    k3: 1,
    k4: 0,
    result: "refracted",
  });

  // 2. Dual-band specular rim (crisp edge + soft incident band) via screen blend
  sub(filter, "feImage", {
    href: maps.specUrl,
    x: 0,
    y: 0,
    width: maps.width,
    height: maps.height,
    preserveAspectRatio: "none",
    result: "specmap",
  });
  sub(filter, "feBlend", {
    in: "refracted",
    in2: "specmap",
    mode: "screen",
  });

  // Refraction handles the edge lens; a small blur keeps the centre legible
  const chain = `blur(${blur}) saturate(${saturate}) url(#${id})`;
  el.style.backdropFilter = chain;
  el.style.setProperty("-webkit-backdrop-filter", chain);

  return () => {
    filter.remove();
  };
}

function applyPlain(el: HTMLElement, { blur, saturate }: { blur: string; saturate: string }): void {
  const chain = `blur(${blur}) saturate(${saturate})`;
  el.style.backdropFilter = chain;
  el.style.setProperty("-webkit-backdrop-filter", chain);
}

/* ---------- component ---------- */

export function GlassSurface<T extends ElementType = "div">({
  as,
  radius = 20,
  blur,
  saturate,
  glass,
  className,
  style,
  children,
  ...props
}: GlassSurfaceProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof GlassSurfaceProps<T>>) {
  const ref = useRef<HTMLElement | null>(null);
  // 未显式传参时走主题 token（--glass-blur/--glass-saturate，暗色主题更深更低保和）
  const blurCss = blur != null ? `${blur}px` : "var(--glass-blur)";
  const saturateCss = saturate != null ? String(saturate) : "var(--glass-saturate)";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!glassEnabled()) {
      applyPlain(el, { blur: blurCss, saturate: saturateCss });
      return;
    }

    let dispose: () => void = () => {};
    let raf = 0;
    const regenerate = () => {
      const rect = el.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      dispose();
      dispose = () => {};
      if (width < 3 || height < 3) return;
      const maps = buildGlassMaps({
        width,
        height,
        radius,
        resolution: 0.6,
        ...glass,
      });
      dispose = applyGlassFilter(el, maps, { blur: blurCss, saturate: saturateCss });
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(regenerate);
    };

    regenerate();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dispose();
    };
    // radius/blur/saturate/glass changes re-run via parent re-render + key usage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius, blur, saturate, JSON.stringify(glass ?? {})]);

  const Component = (as ?? "div") as ElementType;
  return (
    <Component
      ref={ref}
      className={["glass-surface", className].filter(Boolean).join(" ")}
      style={{ borderRadius: radius, ...style }}
      {...props}
    >
      {children}
    </Component>
  );
}
