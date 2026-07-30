import type { ProviderKind } from "../../lib/quota-types";

const META: Record<
  ProviderKind,
  { hue: string; glyph: string; title: string }
> = {
  clinepass: { hue: "var(--provider-clinepass)", glyph: "C", title: "Cline Pass" },
  "opencode-go": { hue: "var(--provider-opencode)", glyph: "</>", title: "OpenCode Go" },
  "ollama-cloud": { hue: "var(--provider-ollama)", glyph: "O", title: "Ollama Cloud" },
};

/** 供应商识别标：克制配色，仅装饰用途，不承担健康语义（§11.3） */
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
      className="inline-flex items-center justify-center rounded-lg font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size <= 26 ? 11 : 13,
        color: m.hue,
        background: "color-mix(in srgb, currentColor 12%, transparent)",
        border: "1px solid color-mix(in srgb, currentColor 22%, transparent)",
        letterSpacing: provider === "opencode-go" ? "-0.04em" : 0,
      }}
    >
      {m.glyph}
    </span>
  );
}