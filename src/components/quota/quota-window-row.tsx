import { Clock3 } from "lucide-react";
import { QuotaProgress } from "../ui/quota-progress";
import { formatPercent, formatResetCountdown } from "../../lib/format";
import { clampPercent, remainingPercent } from "../../lib/quota-logic";
import type { QuotaWindowView } from "../../lib/quota-types";

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
          <strong className="tnum text-[15px] font-semibold text-ink-1">
            {formatPercent(used)}%
          </strong>
          <span className="text-[11px] text-ink-3">已用</span>
        </span>
      </div>

      <QuotaProgress percent={used} tone={tone} />

      <div className="flex items-center justify-between text-[11.5px] text-ink-3">
        <span className="tnum">剩余 {formatPercent(remaining)}%</span>
        <span className="inline-flex items-center gap-1">
          <Clock3 size={12} className="opacity-70" />
          {countdown ?? "重置时间未知"}
        </span>
      </div>
    </div>
  );
}
