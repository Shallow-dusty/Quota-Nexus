import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface GlassSelectOption<T extends string> {
  id: T;
  label: string;
}

/**
 * 与设计语言一致的下拉选择：触发器是玻璃控件，浮层是同变量 CSS 玻璃。
 * 替代原生 <select>（OS 渲染的列表在深色主题下突兀）。轻量自实现：
 * 点击/键盘开合、上下键移动、Enter 选定、Esc 或外部点击关闭。
 */
export function GlassSelect<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (id: T) => void;
  options: GlassSelectOption<T>[];
  ariaLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<T>(value);
  const [popStyle, setPopStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const current = options.find((opt) => opt.id === value);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const choose = (id: T) => {
    onChange(id);
    close();
  };

  // 开合时按触发器位置放置浮层（fixed + portal，避开祖先滤镜的包含块陷阱）
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const estimated = Math.min(320, options.length * 30 + 12);
    const fitsBelow = rect.bottom + 6 + estimated <= window.innerHeight - 8;
    setPopStyle({
      position: "fixed",
      left: rect.left,
      ...(fitsBelow
        ? { top: rect.bottom + 6 }
        : { bottom: window.innerHeight - rect.top + 6 }),
      ["--trigger-width" as string]: `${rect.width}px`,
    });
    setActive(value);
    listRef.current?.focus();
  }, [open, options.length, value]);

  // 外部点击关闭
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !listRef.current?.contains(target)
      ) {
        close(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  const moveActive = (delta: number) => {
    const index = options.findIndex((opt) => opt.id === active);
    const next = (index + delta + options.length) % options.length;
    setActive(options[next].id);
  };

  return (
    <div className={className} style={{ display: "inline-flex" }}>
      <button
        ref={triggerRef}
        type="button"
        className="select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) setOpen(true);
            else moveActive(event.key === "ArrowDown" ? 1 : -1);
          }
        }}
      >
        <span>{current?.label}</span>
        <ChevronDown size={13} className="select-chevron" aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            ref={listRef}
            className="glass-popover select-popover select-list"
            style={popStyle}
            role="listbox"
            aria-label={ariaLabel}
            aria-activedescendant={`select-opt-${active}`}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                moveActive(event.key === "ArrowDown" ? 1 : -1);
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                choose(active);
              } else if (event.key === "Escape") {
                event.preventDefault();
                close();
              } else if (event.key === "Home") {
                event.preventDefault();
                setActive(options[0].id);
              } else if (event.key === "End") {
                event.preventDefault();
                setActive(options[options.length - 1].id);
              }
            }}
          >
            {options.map((opt) => (
              <div
                key={opt.id}
                id={`select-opt-${opt.id}`}
                role="option"
                aria-selected={opt.id === value}
                className="select-option"
                data-selected={opt.id === value ? "" : undefined}
                data-focused={opt.id === active ? "" : undefined}
                onClick={() => choose(opt.id)}
                onPointerMove={() => setActive(opt.id)}
              >
                <span>{opt.label}</span>
                {opt.id === value && <Check size={13} aria-hidden />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
