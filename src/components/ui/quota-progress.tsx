import type { HealthTone } from "../../lib/quota-types";
import { remainingPercent } from "../../lib/quota-logic";
import { useThresholds } from "../../lib/thresholds";

/**
 * 3D 液态晶莹果冻胶囊进度条 (3D Liquid Jelly Pill Progress Bar)
 * 具备沉浸式 3D 凹槽、顶部高光反光带、尾部发光晶体头。
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
        style={{ width: `${Math.max(remaining, 0)}%` }}
      >
        <span className="quota-fill-sheen" aria-hidden="true" />
        <span className="quota-fill-bulb" aria-hidden="true" />
      </div>
      <span className="quota-thresholds" aria-hidden="true">
        <i style={{ left: `${100 - thresholds.warning}%` }} />
        <i style={{ left: `${100 - thresholds.high}%` }} />
        <i style={{ left: `${100 - thresholds.critical}%` }} />
      </span>
    </div>
  );
}
