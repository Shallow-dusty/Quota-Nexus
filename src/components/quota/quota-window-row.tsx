import { Clock3 } from "lucide-react";
import { QuotaProgress } from "../ui/quota-progress";
import { formatPercent, formatResetCountdown } from "../../lib/format";
import { clampPercent, remainingPercent } from "../../lib/quota-logic";
import type { QuotaWindowView, WindowTone } from "../../lib/quota-types";

/** 数字即状态：非常态档位直接把关键数字染成档位色 */
const TONE_COLOR: Record<WindowTone, string> = {
  normal: "var(--ink-1)",
  warning: "var(--fill-warn)",
  high: "var(--fill-high)",
  critical: "var(--fill-crit)",
};

export function QuotaWindowRow({
  window,
  now,
}: {
  window: QuotaWindowView;
  now: number;
}) {
  const used = clampPercent(window.usedPercent);
  const remaining = remainingPercent(used);
  const tone = window.tone;
  const countdown = formatResetCountdown(window.resetsAt, now);

  return (
    <div className="quota-window-row flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] text-ink-2">{window.label}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-ink-3">剩余</span>
          <strong
            className="tnum text-[17px] font-semibold"
            style={{ color: TONE_COLOR[tone] }}
          >
            {formatPercent(remaining)}%
          </strong>
        </span>
      </div>

      <QuotaProgress percent={used} tone={tone} />

      <div className="flex items-center justify-between text-[11.5px] text-ink-3">
        <span className="tnum">已用 {formatPercent(used)}%</span>
        <span className="inline-flex items-center gap-1">
          <Clock3 size={12} className="opacity-70" />
          {countdown ?? "重置时间未知"}
        </span>
      </div>
    </div>
  );
}
