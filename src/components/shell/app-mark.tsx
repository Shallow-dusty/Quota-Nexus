/** 应用标识：三段递进条 = 额度/水位隐喻，克制无 emoji */
export function AppMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="aiqm-mark" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#6b7bf2" />
          <stop offset="1" stopColor="#3b5bdb" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#aiqm-mark)" />
      <g fill="white">
        <rect x="7" y="16" width="4.5" height="9" rx="2.25" opacity="0.65" />
        <rect x="13.75" y="11.5" width="4.5" height="13.5" rx="2.25" opacity="0.82" />
        <rect x="20.5" y="7.5" width="4.5" height="17.5" rx="2.25" />
      </g>
    </svg>
  );
}