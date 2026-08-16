import { Clock3 } from "lucide-react";
import { QuotaProgress } from "../ui/quota-progress";
import { formatPercent, formatResetCountdown } from "../../lib/format";
import { clampPercent, remainingPercent } from "../../lib/quota-logic";
import type { QuotaWindowView, WindowTone } from "../../lib/quota-types";

/** 数字即状态：非常态档位直接把关键数字染成档位色（跟随主题的档位填充色） */
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
    <div className="quota-window-row flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13.5px] font-semibold text-ink-1 tracking-tight">
          {window.label}
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-[12.5px] font-normal text-ink-3">剩余</span>
          <strong
            className="tnum text-[19px] font-bold tracking-tight"
            style={{ color: TONE_COLOR[tone] }}
          >
            {formatPercent(remaining)}%
          </strong>
        </span>
      </div>

      <QuotaProgress percent={used} tone={tone} />

      <div className="flex items-center justify-between text-[12px] text-ink-3">
        <span className="tnum font-medium">已用 {formatPercent(used)}%</span>
        <span className="inline-flex items-center gap-1 font-medium">
          <Clock3 size={13} className="opacity-60" />
          {countdown ?? "重置时间未知"}
        </span>
      </div>
    </div>
  );
}
