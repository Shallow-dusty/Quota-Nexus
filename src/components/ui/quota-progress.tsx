import type { HealthTone } from "../../lib/quota-types";
import { remainingPercent } from "../../lib/quota-logic";
import { useThresholds } from "../../lib/thresholds";

/**
 * 进度条表示“剩余量”（对齐 CPA 思路）：剩得多显充盈、快用完显紧张。
 * 填充宽度 = 剩余百分比；阈值刻度按剩余轴镜像（已用 70% = 剩 30%）。
 */
export function QuotaProgress({
  percent,
  tone,
}: {
  percent: number;
  tone: HealthTone;
}) {
  const thresholds = useThresholds();
  const remaining = remainingPercent(percent);
  const state = remaining <= 0 ? "empty" : remaining >= 100 ? "full" : "partial";
  return (
    <div
      className="quota-track"
      data-tone={tone}
      data-state={state}
      role="progressbar"
      aria-valuenow={remaining}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`剩余 ${remaining}%`}
    >
      <div
        className="quota-fill"
        style={{ width: `${remaining}%` }}
      >
        <span className="quota-fill-caustic" aria-hidden="true" />
      </div>
      <span className="quota-thresholds" aria-hidden="true">
        <i style={{ left: `${100 - thresholds.warning}%` }} />
        <i style={{ left: `${100 - thresholds.high}%` }} />
        <i style={{ left: `${100 - thresholds.critical}%` }} />
      </span>
    </div>
  );
}
