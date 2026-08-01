import { ToggleButton, ToggleButtonGroup } from "react-aria-components";

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
}

/** 分段选择器（过滤/排序，DESIGN §8） */
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
    <ToggleButtonGroup
      selectionMode="single"
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const next = Array.from(keys)[0];
        if (typeof next === "string") onChange(next as T);
      }}
      className="segmented"
    >
      {options.map((opt) => (
        <ToggleButton key={opt.id} id={opt.id} className="btn">
          {opt.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}