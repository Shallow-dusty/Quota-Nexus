import type { HealthTone } from "../../lib/quota-types";
import { useThresholds } from "../../lib/thresholds";

/** 有阈值参照的线性进度条；刻度位置跟随用户设置，颜色只表达状态。 */
export function QuotaProgress({
  percent,
  tone,
}: {
  percent: number;
  tone: HealthTone;
}) {
  const thresholds = useThresholds();
  const width = Math.min(100, Math.max(0, percent));
  const state = width <= 0 ? "empty" : width >= 100 ? "full" : "partial";
  return (
    <div
      className="quota-track"
      data-tone={tone}
      data-state={state}
      role="progressbar"
      aria-valuenow={width}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${width}% 已用`}
    >
      <div
        className="quota-fill"
        style={{ width: `${width}%` }}
      >
        <span className="quota-fill-caustic" aria-hidden="true" />
      </div>
      <span className="quota-thresholds" aria-hidden="true">
        <i style={{ left: `${thresholds.warning}%` }} />
        <i style={{ left: `${thresholds.high}%` }} />
        <i style={{ left: `${thresholds.critical}%` }} />
      </span>
    </div>
  );
}
