import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 轻量模态原语（替代 react-aria Modal/ModalOverlay/Dialog 的既有用法）：
 * portal 到 body（避免祖先 backdrop-filter 改变 fixed 包含块）、Escape 关闭、
 * 可驳回时点击背板关闭、焦点圈禁在对话框内、关闭后还原焦点。
 */
export function ModalOverlay({
  isOpen,
  onOpenChange,
  isDismissable,
  className,
  style,
  children,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isDismissable?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      prev?.focus();
    };
  }, [isOpen, onOpenChange]);

  if (!isOpen) return null;
  return createPortal(
    <div
      ref={ref}
      className={className ? `modal-overlay ${className}` : "modal-overlay"}
      style={style}
      onPointerDown={(event) => {
        if (isDismissable && event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function Modal({ children }: { children?: ReactNode }) {
  return children;
}

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  className,
  children,
  "aria-label": ariaLabel,
}: {
  className?: string;
  children?: ReactNode;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // 初始焦点：第一个可聚焦元素，否则对话框自身；Tab 在内部循环
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const first = root.querySelector<HTMLElement>("[autofocus]") ??
      root.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? root).focus();
  }, []);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      tabIndex={-1}
      className={className}
      onKeyDown={(event) => {
        if (event.key !== "Tab" || !ref.current) return;
        const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) {
          event.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !ref.current.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      {children}
    </div>
  );
}
