import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

type SurfaceKind = "stable" | "control" | "floating";

export interface SurfaceProps<T extends ElementType = "div"> {
  as?: T;
  kind?: SurfaceKind;
  className?: string;
  children?: ReactNode;
}

const CLASS: Record<SurfaceKind, string> = {
  stable: "surface-stable",
  control: "surface-control",
  floating: "surface-floating",
};

/**
 * 三类材质表面（DESIGN §8.1）。
 * stable = 数据区可读性优先；control = 导航/工具条；floating = 浮层。
 * 回退由 global.css 的 @supports / prefers-reduced-transparency / data-transparency 处理。
 */
export function Surface<T extends ElementType = "div">({
  as,
  kind = "stable",
  className,
  children,
  ...props
}: SurfaceProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof SurfaceProps<T>>) {
  const Component = (as ?? "div") as ElementType;
  return (
    <Component
      className={[CLASS[kind], className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </Component>
  );
}

export const StableSurface = <T extends ElementType = "div">(
  props: SurfaceProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof SurfaceProps<T>>,
) => <Surface kind="stable" {...props} />;

export const ControlGlass = <T extends ElementType = "div">(
  props: SurfaceProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof SurfaceProps<T>>,
) => <Surface kind="control" {...props} />;

export const FloatingGlass = <T extends ElementType = "div">(
  props: SurfaceProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof SurfaceProps<T>>,
) => <Surface kind="floating" {...props} />;