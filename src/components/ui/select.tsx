import {
  Button,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
} from "react-aria-components";
import { Check, ChevronDown } from "lucide-react";

export interface GlassSelectOption<T extends string> {
  id: T;
  label: string;
}

/**
 * 与设计语言一致的下拉选择：触发器是玻璃控件，浮层是同变量 CSS 玻璃。
 * 替代原生 <select>——其下拉列表样式由 OS 渲染，深色主题下是突兀的白底框。
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
  return (
    <Select
      selectedKey={value}
      onSelectionChange={(key) => onChange(key as T)}
      aria-label={ariaLabel}
      className={className}
    >
      <Button className="select-trigger">
        <SelectValue />
        <ChevronDown size={13} className="select-chevron" aria-hidden />
      </Button>
      <Popover className="glass-popover select-popover" placement="bottom start" offset={6}>
        <ListBox className="select-list" aria-label={ariaLabel}>
          {options.map((opt) => (
            <ListBoxItem
              key={opt.id}
              id={opt.id}
              textValue={opt.label}
              className="select-option"
            >
              {({ isSelected }) => (
                <>
                  <span>{opt.label}</span>
                  {isSelected && <Check size={13} aria-hidden />}
                </>
              )}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </Select>
  );
}
