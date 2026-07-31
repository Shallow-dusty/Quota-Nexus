/**
 * SVG displacement filters used by the WebView liquid-control layer.
 *
 * The filter is intentionally subtle: it bends the sampled backdrop instead of
 * distorting labels and icons. CSS falls back to a plain translucent material
 * when URL backdrop filters are unavailable or transparency is disabled.
 */
export function LiquidFilters() {
  return (
    <svg
      className="liquid-filter-defs"
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter
          id="liquid-control-refraction"
          x="-18%"
          y="-35%"
          width="136%"
          height="170%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.028"
            numOctaves="2"
            seed="17"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="0.45" result="softNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softNoise"
            scale="8"
            xChannelSelector="R"
            yChannelSelector="B"
          />
        </filter>

        <filter
          id="liquid-panel-refraction"
          x="-8%"
          y="-10%"
          width="116%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.006 0.012"
            numOctaves="2"
            seed="29"
            result="panelNoise"
          />
          <feGaussianBlur in="panelNoise" stdDeviation="0.7" result="softPanelNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softPanelNoise"
            scale="3.5"
            xChannelSelector="R"
            yChannelSelector="B"
          />
        </filter>
      </defs>
    </svg>
  );
}
