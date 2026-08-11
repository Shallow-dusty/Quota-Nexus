import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * 原生 button 轻封装，保留既有 onPress/isDisabled 调用约定。
 * 桌面应用场景下原生 :hover/:active/:disabled 与语义足以替代 react-aria Button。
 */
export function Button({
  onPress,
  isDisabled,
  children,
  type = "button",
  ...rest
}: {
  onPress?: () => void;
  isDisabled?: boolean;
  children?: ReactNode;
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "disabled" | "type"
> &
  Pick<ButtonHTMLAttributes<HTMLButtonElement>, "type">) {
  return (
    <button type={type} disabled={isDisabled} onClick={onPress} {...rest}>
      {children}
    </button>
  );
}
