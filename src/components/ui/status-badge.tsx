import type { ReactNode } from "react";
import { PauseCircle, TimerReset } from "lucide-react";
import type { HealthTone } from "../../lib/quota-types";

/**
 * 状态徽标做减法（对齐 CPA 逻辑）：正常与额度档位不再贴"正常/注意/危险"——
 * 额度紧张由进度条与关键数字的颜色表达；只有数据层面的异常（陈旧）才开口。
 */
const META: Partial<
  Record<HealthTone, { label: string; icon: ReactNode; cls: string }>
> = {
  stale: { label: "待刷新", icon: <TimerReset size={12} />, cls: "badge-stale" },
};

/** 正常/额度档位返回 null（沉默）；陈旧显示"待刷新"。 */
export function StatusBadge({ tone }: { tone: HealthTone }) {
  const m = META[tone];
  if (!m) return null;
  return (
    <span className={`badge ${m.cls}`}>
      {m.icon}
      {m.label}
    </span>
  );
}

export function PausedBadge() {
  return (
    <span className="badge badge-stale">
      <PauseCircle size={12} />已暂停
    </span>
  );
}

export function PlanBadge({ plan }: { plan: string }) {
  return <span className="badge badge-plan">{plan}</span>;
}
