/** 克制的额度刻度标，不使用渐变、拟物图标或供应商品牌。 */
export function AppMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="28" height="28" rx="9" fill="currentColor" />
      <path
        d="M9 21.5V18m7 3.5V13m7 8.5V8.5"
        stroke="var(--mark-cutout)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
