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
  { blur, saturate }: { blur: number; saturate: number },
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

  // 1. Refraction: displace backdrop in the 24px chamfer edge
  sub(filter, "feImage", {
    href: maps.dispUrl,
    x: 0,
    y: 0,
    width: maps.width,
    height: maps.height,
    preserveAspectRatio: "none",
    result: "dispmap",
  });
  sub(filter, "feDisplacementMap", {
    in: "SourceGraphic",
    in2: "dispmap",
    scale: maps.maxDisp,
    xChannelSelector: "R",
    yChannelSelector: "G",
    result: "refracted",
  });

  // 2. Chromatic Aberration: Red (+2px) and Blue (-2px) optical channel offset
  sub(filter, "feOffset", {
    in: "refracted",
    dx: 2.0,
    dy: -1.0,
    result: "redShift",
  });
  sub(filter, "feColorMatrix", {
    in: "redShift",
    type: "matrix",
    values: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0",
    result: "redOnly",
  });
  sub(filter, "feBlend", {
    in: "refracted",
    in2: "redOnly",
    mode: "screen",
    result: "chromatic",
  });

  // 3. Specular rim highlight: blend onto the prism edge
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
    in: "chromatic",
    in2: "specmap",
    mode: "screen",
  });

  // Crystal transparency: extremely low blur (1.5px) keeps center 100% sharp & vivid
  const chain = `blur(${blur}px) saturate(${saturate}) url(#${id})`;
  el.style.backdropFilter = chain;
  el.style.setProperty("-webkit-backdrop-filter", chain);

  return () => {
    filter.remove();
  };
}

function applyPlain(el: HTMLElement, { blur, saturate }: { blur: number; saturate: number }): void {
  const chain = `blur(${blur}px) saturate(${saturate})`;
  el.style.backdropFilter = chain;
  el.style.setProperty("-webkit-backdrop-filter", chain);
}

/* ---------- component ---------- */

export function GlassSurface<T extends ElementType = "div">({
  as,
  radius = 20,
  blur = 1.5,
  saturate = 1.6,
  glass,
  className,
  style,
  children,
  ...props
}: GlassSurfaceProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof GlassSurfaceProps<T>>) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!glassEnabled()) {
      applyPlain(el, { blur: Math.max(blur, 12), saturate });
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
      dispose = applyGlassFilter(el, maps, { blur, saturate });
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
