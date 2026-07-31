import type { ProviderKind } from "../../lib/quota-types";

const META: Record<
  ProviderKind,
  { hue: string; title: string }
> = {
  clinepass: { hue: "var(--provider-clinepass)", title: "Cline Pass" },
  "opencode-go": { hue: "var(--provider-opencode)", title: "OpenCode Go" },
  "ollama-cloud": { hue: "var(--provider-ollama)", title: "Ollama Cloud" },
};

export function ProviderMark({
  provider,
  size = 28,
}: {
  provider: ProviderKind;
  size?: number;
}) {
  const m = META[provider];
  return (
    <span
      title={m.title}
      data-provider={provider}
      className="provider-mark inline-flex items-center justify-center"
      style={{
        width: size,
        height: size,
        color: m.hue,
      }}
    >
      <ProviderGlyph provider={provider} size={Math.round(size * 0.58)} />
    </span>
  );
}

function ProviderGlyph({ provider, size }: { provider: ProviderKind; size: number }) {
  if (provider === "opencode-go") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m9 6-5 6 5 6M15 6l5 6-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m13.5 4-3 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".62" />
      </svg>
    );
  }
  if (provider === "ollama-cloud") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7.5 8.2 5.8 4.5c-.3-.6.4-1.2 1-.8l3 2.1M16.5 8.2l1.7-3.7c.3-.6-.4-1.2-1-.8l-3 2.1" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7.2 7.6c1.1-1.5 2.7-2.2 4.8-2.2s3.7.7 4.8 2.2c1.2 1.7 1.5 6.1.5 9.1-.8 2.3-2.6 3.5-5.3 3.5s-4.5-1.2-5.3-3.5c-1-3-.7-7.4.5-9.1Z" stroke="currentColor" strokeWidth="1.65" />
        <path d="M9.4 11.2h.1M14.5 11.2h.1M9.3 15.2c1.8.9 3.6.9 5.4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5 15 9l5.5 3-5.5 3-3 5.5L9 15l-5.5-3L9 9l3-5.5Z" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" opacity=".7" />
    </svg>
  );
}
