import type { ProviderKind } from "../../lib/quota-types";

const META: Record<
  ProviderKind,
  { hue: string; glyph: string; title: string }
> = {
  clinepass: { hue: "var(--provider-clinepass)", glyph: "CP", title: "Cline Pass" },
  "opencode-go": { hue: "var(--provider-opencode)", glyph: "OC", title: "OpenCode Go" },
  "ollama-cloud": { hue: "var(--provider-ollama)", glyph: "OL", title: "Ollama Cloud" },
};

/** 供应商文字标：不伪造品牌 Logo，以中性字标提供稳定识别。 */
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
      className="provider-mark inline-flex items-center justify-center font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size <= 26 ? 8.5 : 9.5,
        color: m.hue,
        letterSpacing: "-0.035em",
      }}
    >
      {m.glyph}
    </span>
  );
}
