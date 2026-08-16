import { useRef } from "react";

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
}

/** 分段选择器（过滤/视图切换，DESIGN §8）。roving tabindex + 方向键导航。 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (next: T) => void;
}) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (index: number, delta: number) => {
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].id);
    itemRefs.current[next]?.focus();
  };

  return (
    <div className="segmented" role="radiogroup">
      {options.map((opt, index) => (
        <button
          key={opt.id}
          ref={(el) => {
            itemRefs.current[index] = el;
          }}
          type="button"
          role="radio"
          className="btn"
          data-selected={opt.id === value ? "" : undefined}
          aria-checked={opt.id === value}
          tabIndex={opt.id === value ? 0 : -1}
          onClick={() => onChange(opt.id)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              move(index, 1);
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              move(index, -1);
            }
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
