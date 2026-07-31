/** 透明水滴中的三段水位：额度监控语义，不借用任何供应商品牌。 */
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
        <linearGradient id="aiqm-glass" x1="4" y1="3" x2="28" y2="30">
          <stop stopColor="rgba(255,255,255,.94)" />
          <stop offset=".42" stopColor="rgba(209,231,255,.72)" />
          <stop offset="1" stopColor="rgba(91,139,255,.26)" />
        </linearGradient>
        <linearGradient id="aiqm-water" x1="8" y1="24" x2="25" y2="8">
          <stop stopColor="#2868ef" />
          <stop offset="1" stopColor="#72d8ff" />
        </linearGradient>
        <filter id="aiqm-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.4" floodColor="#365a9f" floodOpacity=".24" />
        </filter>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="10" fill="url(#aiqm-glass)" filter="url(#aiqm-shadow)" />
      <rect x="1.5" y="1.5" width="29" height="29" rx="9.5" fill="none" stroke="rgba(255,255,255,.82)" />
      <path d="M6.5 10C9.8 4.8 17.8 2.8 24.8 6.4" stroke="white" strokeWidth="1.6" strokeLinecap="round" opacity=".8" />
      <g fill="url(#aiqm-water)">
        <rect x="7.5" y="17" width="4" height="8" rx="2" opacity=".55" />
        <rect x="14" y="12" width="4" height="13" rx="2" opacity=".78" />
        <rect x="20.5" y="7.5" width="4" height="17.5" rx="2" />
      </g>
    </svg>
  );
}
