import type { HealthTone } from "../../lib/quota-types";

/** 线性进度条（§11.3 圆环不进 MVP）；填充色按档位切换，常态用品牌色避免"圣诞树" */
export function QuotaProgress({
  percent,
  tone,
}: {
  percent: number;
  tone: HealthTone;
}) {
  const width = Math.min(100, Math.max(0, percent));
  return (
    <div className="quota-track" role="progressbar" aria-valuenow={width} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="quota-fill"
        data-tone={tone}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}