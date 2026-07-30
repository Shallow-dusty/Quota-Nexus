import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  Siren,
  TimerReset,
} from "lucide-react";
import type { HealthTone } from "../../lib/quota-types";

const META: Record<
  HealthTone,
  { label: string; icon: ReactNode; cls: string }
> = {
  normal: { label: "正常", icon: <CheckCircle2 size={12} />, cls: "badge-ok" },
  warning: { label: "需关注", icon: <AlertTriangle size={12} />, cls: "badge-warn" },
  high: { label: "高风险", icon: <AlertTriangle size={12} />, cls: "badge-high" },
  critical: { label: "危险", icon: <Siren size={12} />, cls: "badge-crit" },
  stale: { label: "陈旧", icon: <TimerReset size={12} />, cls: "badge-stale" },
};

/** 图标 + 文本 + 颜色三重信号（§11.3 不让颜色成为唯一信号） */
export function StatusBadge({ tone }: { tone: HealthTone }) {
  const m = META[tone];
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