import { RefreshCw } from "lucide-react";
import { Button } from "react-aria-components";
import { formatPercent, formatRelativePast } from "../../lib/format";
import { clampPercent, remainingPercent, toneForAccount } from "../../lib/quota-logic";
import type { ServiceQuotaView, WindowTone } from "../../lib/quota-types";
import { useNow } from "../../lib/use-now";
import { StableSurface } from "../ui/surface";
import { PausedBadge, PlanBadge, StatusBadge } from "../ui/status-badge";
import { ProviderMark } from "./provider-mark";

const TONE_COLOR: Record<WindowTone, string> = {
  normal: "var(--ink-1)",
  warning: "var(--fill-warn)",
  high: "var(--fill-high)",
  critical: "var(--fill-crit)",
};

/** 列表视图的紧凑账号行：窗口内联展示，点击进入详情抽屉。 */
export function ServiceQuotaRow({
  account,
  refreshing,
  onRefresh,
  onOpen,
}: {
  account: ServiceQuotaView;
  refreshing?: boolean;
  onRefresh?: (id: string) => void;
  onOpen?: (id: string) => void;
}) {
  const now = useNow();
  const tone = toneForAccount(account);
  const paused = account.state === "paused";

  return (
    <StableSurface
      className="quota-row px-5 py-4 flex items-center gap-5"
      role="button"
      tabIndex={0}
      aria-label={`查看账号详情：${account.accountLabel}`}
      onClick={() => onOpen?.(account.id)}
      onKeyDown={(event: React.KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen?.(account.id);
        }
      }}
    >
      <ProviderMark provider={account.provider} size={30} />

      <div className="quota-row-id min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="privacy-sensitive text-[13px] font-medium text-ink-1 truncate">
            {account.accountLabel}
          </span>
          {account.plan && <PlanBadge plan={account.plan} />}
        </div>
        <p className="text-[11px] text-ink-3 truncate mt-0.5">{account.providerName}</p>
      </div>

      <div className="quota-row-windows flex-1 flex items-center gap-4 min-w-0">
        {account.windows.map((w) => {
          const used = clampPercent(w.usedPercent);
          const remaining = remainingPercent(used);
          return (
            <div key={w.id} className="quota-row-window min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11.5px] text-ink-3 truncate">{w.label}</span>
                <strong
                  className="tnum text-[15px] font-semibold"
                  style={{ color: TONE_COLOR[w.tone] }}
                >
                  {formatPercent(remaining)}%
                </strong>
              </div>
              <div className="quota-row-track mt-1" data-tone={w.tone}>
                <div style={{ width: `${remaining}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden lg:block w-[86px] shrink-0 text-[11px] text-ink-3 text-right">
        {formatRelativePast(account.lastSuccessAt, now)}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {paused ? <PausedBadge /> : <StatusBadge tone={tone} />}
        <div onClick={(event) => event.stopPropagation()}>
          <Button
            onPress={() => onRefresh?.(account.id)}
            isDisabled={refreshing || paused || account.errorCategory === "auth"}
            className="btn btn-icon"
            aria-label="刷新此账号"
            data-tooltip="刷新此账号"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>
    </StableSurface>
  );
}
