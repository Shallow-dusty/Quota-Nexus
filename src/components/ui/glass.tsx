import {
  useEffect,
  useRef,
  useState,
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
  /** 悬停/按压时折射强度液态变化：位移 scale 是唯一无需重建地图即可动画的参数 */
  interactive?: boolean;
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

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
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

function sub(parent: Element, name: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVGNS, name);
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  parent.appendChild(el);
  return el;
}

export interface GlassFilterHandle {
  dispose: () => void;
  /** 倍率 1 = 基准折射强度；不重建位移图即可更新（悬停/按压的"液态"过渡） */
  setScale: (factor: number) => void;
}

function applyGlassFilter(
  el: HTMLElement,
  maps: ReturnType<typeof buildGlassMaps>,
  {
    blur,
    saturate,
    dispersion,
  }: { blur: string; saturate: string; dispersion: number },
): GlassFilterHandle {
  const defs = ensureDefs();
  const id = `qn-glass-${++seq}`;
  const filter = document.createElementNS(SVGNS, "filter");
  filter.setAttribute("id", id);
  filter.setAttribute("filterUnits", "userSpaceOnUse");
  filter.setAttribute("primitiveUnits", "userSpaceOnUse");
  // filterUnits 必须显式声明：默认的 objectBoundingBox 会把下面这些像素值
  // 解析成边界框倍数，产生数百倍于元素的 filter 区域（GPU 纹理浪费）。
  filter.setAttribute("x", "-20");
  filter.setAttribute("y", "-20");
  filter.setAttribute("width", String(maps.width + 40));
  filter.setAttribute("height", String(maps.height + 40));
  filter.setAttribute("colorInterpolationFilters", "sRGB");
  defs.appendChild(filter);

  // 1. Refraction with per-channel dispersion: R/B channels are displaced
  // ±dispersion around G, so chromatic fringing appears only where displacement
  // is non-zero (the bevelled edge) — physical, no artificial mask needed.
  sub(filter, "feImage", {
    href: maps.dispUrl,
    x: 0,
    y: 0,
    width: maps.width,
    height: maps.height,
    preserveAspectRatio: "none",
    result: "dispmap",
  });
  const strongScale = maps.maxDisp * (1 + dispersion);
  const weakScale = maps.maxDisp * (1 - dispersion);
  const dispR = sub(filter, "feDisplacementMap", {
    in: "SourceGraphic",
    in2: "dispmap",
    scale: strongScale,
    xChannelSelector: "R",
    yChannelSelector: "G",
    result: "dispR",
  });
  const dispG = sub(filter, "feDisplacementMap", {
    in: "SourceGraphic",
    in2: "dispmap",
    scale: maps.maxDisp,
    xChannelSelector: "R",
    yChannelSelector: "G",
    result: "dispG",
  });
  const dispB = sub(filter, "feDisplacementMap", {
    in: "SourceGraphic",
    in2: "dispmap",
    scale: weakScale,
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

  return {
    setScale(factor: number) {
      dispR.setAttribute("scale", (strongScale * factor).toFixed(2));
      dispG.setAttribute("scale", (maps.maxDisp * factor).toFixed(2));
      dispB.setAttribute("scale", (weakScale * factor).toFixed(2));
    },
    dispose() {
      filter.remove();
    },
  };
}

function applyPlain(el: HTMLElement, { blur, saturate }: { blur: string; saturate: string }): void {
  const chain = `blur(${blur}) saturate(${saturate})`;
  el.style.backdropFilter = chain;
  el.style.setProperty("-webkit-backdrop-filter", chain);
}

/* ---------- component ---------- */

/** 跟踪根元素 data-theme（切换主题时折射强度等需要重建滤镜） */
function useDocumentTheme(): string {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme ?? "light",
  );
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setTheme(document.documentElement.dataset.theme ?? "light"),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}

export function GlassSurface<T extends ElementType = "div">({
  as,
  radius = 20,
  blur,
  saturate,
  interactive = false,
  glass,
  className,
  style,
  children,
  ...props
}: GlassSurfaceProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof GlassSurfaceProps<T>>) {
  const ref = useRef<HTMLElement | null>(null);
  // 未显式传参时走主题 token（--glass-blur/--glass-saturate）
  const blurCss = blur != null ? `${blur}px` : "var(--glass-blur)";
  const saturateCss = saturate != null ? String(saturate) : "var(--glass-saturate)";
  const theme = useDocumentTheme();
  // 视口懒挂：屏幕外的表面只保留轻量模糊，滚回视口再挂折射链（大量卡片时 GPU 减负）
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => setVisible(entries[entries.length - 1]?.isIntersecting ?? true),
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!glassEnabled() || !visible) {
      applyPlain(el, { blur: blurCss, saturate: saturateCss });
      return;
    }

    // 暗色走"弱折射"而不是纯模糊：v0.1.13 的污渍根因是底板饱和预烘
    // （侧栏/工作台 saturate 1.8 会把极光放大成色斑），预烘撤除后保留
    // 位移 halved、色散关闭、高光收敛的克制透镜边即可。
    const dark = theme === "dark";
    let handle: GlassFilterHandle | null = null;
    let raf = 0;
    let scaleRaf = 0;
    let currentFactor = 1;
    let targetFactor = 1;
    const reducedMotion = prefersReducedMotion();

    const regenerate = () => {
      const rect = el.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      handle?.dispose();
      handle = null;
      if (width < 3 || height < 3) return;
      const maps = buildGlassMaps({
        width,
        height,
        radius,
        resolution: 0.6,
        ...(dark ? { maxDisp: 9, specStrength: 0.5, edgeAmbient: 0.22 } : {}),
        ...glass,
      });
      handle = applyGlassFilter(el, maps, {
        blur: blurCss,
        saturate: saturateCss,
        dispersion: dark ? 0 : 0.09,
      });
      currentFactor = 1;
      targetFactor = 1;
    };

    // 悬停/按压的液态折射过渡：rAF 向目标倍率插值（reduced-motion 直接跳变）
    const applyScale = (factor: number) => {
      currentFactor = factor;
      handle?.setScale(factor);
    };
    const tick = () => {
      if (Math.abs(targetFactor - currentFactor) < 0.004) {
        applyScale(targetFactor);
        scaleRaf = 0;
        return;
      }
      applyScale(currentFactor + (targetFactor - currentFactor) * 0.22);
      scaleRaf = requestAnimationFrame(tick);
    };
    const requestScale = (factor: number) => {
      targetFactor = factor;
      if (reducedMotion) {
        cancelAnimationFrame(scaleRaf);
        scaleRaf = 0;
        applyScale(factor);
        return;
      }
      if (!scaleRaf) scaleRaf = requestAnimationFrame(tick);
    };

    let detachPointer: (() => void) | undefined;
    if (interactive) {
      const onEnter = () => requestScale(1.14);
      const onLeave = () => requestScale(1);
      const onDown = () => requestScale(0.74);
      const onUp = () => requestScale(1.14);
      el.addEventListener("pointerenter", onEnter);
      el.addEventListener("pointerleave", onLeave);
      el.addEventListener("pointerdown", onDown);
      el.addEventListener("pointerup", onUp);
      detachPointer = () => {
        el.removeEventListener("pointerenter", onEnter);
        el.removeEventListener("pointerleave", onLeave);
        el.removeEventListener("pointerdown", onDown);
        el.removeEventListener("pointerup", onUp);
      };
    }

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(regenerate);
    };

    regenerate();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(scaleRaf);
      ro.disconnect();
      detachPointer?.();
      handle?.dispose();
    };
    // radius/blur/saturate/glass changes re-run via parent re-render + key usage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius, blur, saturate, interactive, theme, visible, JSON.stringify(glass ?? {})]);

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
