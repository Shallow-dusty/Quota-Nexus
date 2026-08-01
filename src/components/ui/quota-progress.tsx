import type { HealthTone } from "../../lib/quota-types";

/** 有阈值参照的液态线性进度条；颜色只表达状态，不承担装饰性渐变。 */
export function QuotaProgress({
  percent,
  tone,
}: {
  percent: number;
  tone: HealthTone;
}) {
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
        <i style={{ left: "70%" }} />
        <i style={{ left: "85%" }} />
        <i style={{ left: "95%" }} />
      </span>
    </div>
  );
}
