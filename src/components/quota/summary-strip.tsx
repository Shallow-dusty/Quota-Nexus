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
import { StableSurface } from "../ui/surface";

/** 紧凑健康摘要条（§11.2）：单行四段，不做大型 hero 卡片 */
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
    <StableSurface className="px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px]">
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
      <Divider />
      <Metric
        icon={<AlertTriangle size={13} className="text-warn" />}
        label="需关注窗口"
        value={
          <strong className="tnum text-ink-1">{attention}</strong>
        }
        tone={attention > 0 ? "warn" : undefined}
      />
      <Divider />
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
                · {highest.account.accountLabel}·{highest.window.label}
              </span>
            </span>
          ) : (
            <span className="text-ink-3">—</span>
          )
        }
      />
      <Divider />
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
                {" "}
                · {nearest.account.accountLabel}
              </span>
            </span>
          ) : (
            <span className="text-ink-3">未知</span>
          )
        }
      />
      <span className="ml-auto text-[11.5px] text-ink-3">
        上次刷新 {formatTime(refreshedAt)}
      </span>
    </StableSurface>
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
    <span className="inline-flex items-center gap-1.5">
      {icon}
      <span className={tone === "warn" ? "text-warn" : "text-ink-3"}>{label}</span>
      {value}
    </span>
  );
}

function Divider() {
  return <span className="h-3.5 w-px bg-[var(--line)]" />;
}