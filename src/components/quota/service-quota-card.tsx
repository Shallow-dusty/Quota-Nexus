import { RefreshCw } from "lucide-react";
import { Button } from "react-aria-components";
import { formatDateTime } from "../../lib/format";
import { ERROR_HINT, ERROR_LABEL } from "../../lib/quota-copy";
import { toneForAccount } from "../../lib/quota-logic";
import type { ServiceQuotaView } from "../../lib/quota-types";
import { useNow } from "../../lib/use-now";
import { GlassSurface } from "../ui/glass";
import { PausedBadge, PlanBadge, StatusBadge } from "../ui/status-badge";
import { ProviderMark } from "./provider-mark";
import { QuotaWindowRow } from "./quota-window-row";

export function ServiceQuotaCard({
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
  const stale = account.state === "stale-with-error";
  const paused = account.state === "paused";

  return (
    <GlassSurface
      radius={18}
      className="quota-card p-4 flex flex-col gap-3"
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
      <div className="quota-card-header flex items-start gap-3">
        <ProviderMark provider={account.provider} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="privacy-sensitive text-[14px] font-semibold text-ink-1 truncate">
              {account.accountLabel}
            </h3>
            {account.plan && <PlanBadge plan={account.plan} />}
          </div>
          <p className="text-[11.5px] text-ink-3 truncate mt-0.5">
            {account.providerName}
          </p>
        </div>
        {paused ? <PausedBadge /> : <StatusBadge tone={tone} />}
      </div>

      <div className="quota-windows flex flex-col gap-3.5 mt-1">
        {account.windows.map((w) => (
          <QuotaWindowRow key={w.id} window={w} now={now} />
        ))}
      </div>

      {stale && account.errorCategory && (
        <div
          className="flex items-start gap-2 px-2.5 py-2 rounded-[var(--r-sm)] text-[11.5px]"
          style={{
            background: "var(--stale-soft)",
            color: "var(--stale)",
          }}
        >
          <span className="font-medium">{ERROR_LABEL[account.errorCategory]}</span>
          <span className="text-ink-3"> · {ERROR_HINT[account.errorCategory]}</span>
        </div>
      )}

      <div className="quota-card-footer flex items-center justify-between pt-2 border-t border-[var(--line)]">
        <span className="text-[11px] text-ink-3">
          上次成功 {formatDateTime(account.lastSuccessAt)}
        </span>
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
    </GlassSurface>
  );
}
