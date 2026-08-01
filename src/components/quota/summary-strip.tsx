import { Activity, AlertTriangle, Clock3, Timer } from "lucide-react";
import { formatResetCountdown, formatTime } from "../../lib/format";
import {
  attentionWindowCount,
  healthyAccountCount,
  highestWindow,
  nearestReset,
} from "../../lib/quota-logic";
import type { ServiceQuotaView } from "../../lib/quota-types";
import { useNow } from "../../lib/use-now";

/** 紧凑健康摘要条（DESIGN §8）：单行四段，不做大型 hero 卡片 */
export function SummaryStrip({
  accounts,
  refreshedAt,
}: {
  accounts: ServiceQuotaView[];
  refreshedAt: string | null;
}) {
  const now = useNow();
  const total = accounts.length;
  const healthy = healthyAccountCount(accounts);
  const attention = attentionWindowCount(accounts);
  const highest = highestWindow(accounts);
  const nearest = nearestReset(accounts);

  return (
    <section className="summary-board flex flex-wrap items-stretch text-[12.5px]" aria-label="额度摘要">
      <Metric
        icon={<Activity size={13} className="text-ink-3" />}
        label="正常账号"
        value={
          <>
            <strong className="tnum text-ink-1">{healthy}</strong>
            <span className="text-ink-3">/{total}</span>
          </>
        }
      />
      <Metric
        icon={<AlertTriangle size={13} className="text-warn" />}
        label="注意窗口"
        value={
          <strong className="tnum text-ink-1">{attention}</strong>
        }
        tone={attention > 0 ? "warn" : undefined}
      />
      <Metric
        icon={<Timer size={13} className="text-ink-3" />}
        label="最高使用"
        value={
          highest ? (
            <span>
              <strong className="tnum text-ink-1">
                {Math.round(highest.window.usedPercent)}%
              </strong>
              <span className="text-ink-3">
                {" "}
                · <span className="privacy-sensitive">{highest.account.accountLabel}</span>
                {" · "}{highest.window.label}
              </span>
            </span>
          ) : (
            <span className="text-ink-3">—</span>
          )
        }
      />
      <Metric
        icon={<Clock3 size={13} className="text-ink-3" />}
        label="最近重置"
        value={
          nearest ? (
            <span>
              <span className="text-ink-1">
                {formatResetCountdown(nearest.window.resetsAt, now)}
              </span>
              <span className="text-ink-3">
                {" · "}
                <span className="privacy-sensitive">{nearest.account.accountLabel}</span>
              </span>
            </span>
          ) : (
            <span className="text-ink-3">未知</span>
          )
        }
      />
      <span className="summary-updated ml-auto self-center px-3 text-[11.5px] text-ink-3">
        上次刷新 {formatTime(refreshedAt)}
      </span>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: "warn";
}) {
  return (
    <span className="summary-metric inline-flex items-center gap-1.5">
      {icon}
      <span className={tone === "warn" ? "text-warn" : "text-ink-3"}>{label}</span>
      {value}
    </span>
  );
}
