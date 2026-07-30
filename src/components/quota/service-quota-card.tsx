import { MoreHorizontal, RefreshCw } from "lucide-react";
import { Button } from "react-aria-components";
import { formatDateTime, formatResetCountdown } from "../../lib/format";
import {
  clampPercent,
  remainingPercent,
  toneForAccount,
  toneForPercent,
} from "../../lib/quota-logic";
import type { ErrorCategory, ServiceQuotaView } from "../../lib/quota-types";
import { useNow } from "../../lib/use-now";
import { StableSurface } from "../ui/surface";
import { PlanBadge, StatusBadge } from "../ui/status-badge";
import { ProviderMark } from "./provider-mark";
import { QuotaWindowRow } from "./quota-window-row";

const ERROR_LABEL: Record<ErrorCategory, string> = {
  auth: "认证失效，请更新凭据",
  network: "网络错误，显示最后成功数据",
  parser: "上游结构变化，解析失败",
  proxy: "固定出口不可达",
};

const ERROR_HINT: Record<ErrorCategory, string> = {
  auth: "该账号已暂停自动刷新",
  network: "保留上次额度，待恢复后刷新",
  parser: "供应商级熔断，等待解析修复",
  proxy: "已停止，未回退默认出口",
};

export function ServiceQuotaCard({
  account,
  refreshing,
  onRefresh,
  onMore,
}: {
  account: ServiceQuotaView;
  refreshing?: boolean;
  onRefresh?: (id: string) => void;
  onMore?: (id: string) => void;
}) {
  const now = useNow();
  const tone = toneForAccount(account);
  const stale = account.state === "stale-with-error";

  return (
    <StableSurface className="p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <ProviderMark provider={account.provider} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-ink-1 truncate">
              {account.accountLabel}
            </h3>
            {account.plan && <PlanBadge plan={account.plan} />}
          </div>
          <p className="text-[11.5px] text-ink-3 truncate mt-0.5">
            {account.providerName}
          </p>
        </div>
        <StatusBadge tone={tone} />
      </div>

      <div className="flex flex-col gap-3 mt-0.5">
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
          <span className="text-ink-3">· {ERROR_HINT[account.errorCategory]}</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-[var(--line)]">
        <span className="text-[11px] text-ink-3">
          上次成功 {formatDateTime(account.lastSuccessAt)}
          {account.freshness === "fresh" ? " · 数据新鲜" : " · 数据陈旧"}
        </span>
        <div className="flex items-center gap-1">
          <Button
            onPress={() => onRefresh?.(account.id)}
            isDisabled={refreshing || stale}
            className="btn btn-icon"
            aria-label="刷新此账号"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          </Button>
          <Button
            onPress={() => onMore?.(account.id)}
            className="btn btn-icon"
            aria-label="更多操作"
          >
            <MoreHorizontal size={15} />
          </Button>
        </div>
      </div>
    </StableSurface>
  );
}

export { clampPercent, remainingPercent, toneForPercent, formatResetCountdown };