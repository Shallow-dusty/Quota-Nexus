export interface SegmentOption<T extends string> {
  id: T;
  label: string;
}

/** 分段选择器（过滤/视图切换，DESIGN §8） */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="radio"
          className="btn"
          data-selected={opt.id === value ? "" : undefined}
          aria-checked={opt.id === value}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
