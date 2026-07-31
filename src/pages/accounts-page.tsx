import { Check, Plus } from "lucide-react";
import { Button } from "react-aria-components";
import { useState } from "react";
import { useEffect } from "react";
import { commandErrorMessage, quotaClient } from "../lib/quota-client";
import { formatDateTime, formatRelativePast } from "../lib/format";
import { toneForAccount } from "../lib/quota-logic";
import type { AccountConnectionView, ProviderKind } from "../lib/quota-types";
import { useNow } from "../lib/use-now";
import { PageHeader } from "../components/shell/app-shell";
import { StableSurface } from "../components/ui/surface";
import { PausedBadge, PlanBadge, StatusBadge } from "../components/ui/status-badge";
import { ProviderMark } from "../components/quota/provider-mark";
import { AddAccountDialog } from "../components/quota/add-account-dialog";

export function AccountsPage() {
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [connections, setConnections] = useState<AccountConnectionView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void quotaClient
      .getConnections()
      .then((data) => {
        if (!cancelled) setConnections(data);
      })
      .catch((reason) => {
        if (!cancelled) setLoadError(commandErrorMessage(reason));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageHeader
        title="账号与连接"
        subtitle="管理供应商账号、凭据复用与固定网络出口"
        actions={
          <Button className="btn btn-prominent" onPress={() => setOpen(true)}>
            <Plus size={14} />
            添加账号
          </Button>
        }
      />

      <div className="page-scroll accounts-page flex-1 overflow-y-auto px-7 py-5">
        <div className="connections-list flex flex-col gap-3">
          {loadError && (
            <StableSurface className="px-6 py-8 text-center">
              <p className="text-[13px] text-ink-2">账号列表读取失败</p>
              <p className="mt-1 text-[11.5px] text-ink-3">{loadError}</p>
            </StableSurface>
          )}
          {(connections ?? []).map((c) => (
            <ConnectionRow key={c.id} connection={c} now={now} />
          ))}
          {connections?.length === 0 && (
            <StableSurface className="px-6 py-10 text-center">
              <p className="text-[13px] text-ink-2">还没有本地账号</p>
              <p className="mt-1 text-[11.5px] text-ink-3">
                添加一个 Cline Pass 账号，完成第一条实时额度链路
              </p>
            </StableSurface>
          )}
        </div>
      </div>

      <AddAccountDialog
        open={open}
        onClose={() => setOpen(false)}
        onSaved={setConnections}
      />
    </>
  );
}

function ConnectionRow({
  connection,
  now,
}: {
  connection: AccountConnectionView;
  now: number;
}) {
  const tone = toneForAccount({
    id: connection.id,
    provider: connection.provider,
    providerName: connection.providerName,
    accountLabel: connection.accountLabel,
    state: connection.state,
    freshness: connection.freshness,
    lastSuccessAt: connection.lastSuccessAt,
    errorCategory: connection.errorCategory,
    windows: [],
  });

  return (
    <StableSurface className="connection-row px-4 py-3.5 flex items-center gap-3.5">
      <ProviderMark provider={connection.provider} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-medium text-ink-1 truncate">
            {connection.accountLabel}
          </span>
          {connection.plan && <PlanBadge plan={connection.plan} />}
          {connection.enabled ? (
            <StatusBadge tone={tone} />
          ) : (
            <PausedBadge />
          )}
        </div>
        <div className="text-[11.5px] text-ink-3 truncate mt-0.5">
          {connection.providerName}
          {connection.scopeLabel && ` · ${connection.scopeLabel}`} ·{" "}
          {connection.credentialLabel}
          {connection.sharedAccountCount > 1 && (
            <span className="text-ink-3">（共享 {connection.sharedAccountCount} 账号）</span>
          )}
        </div>
      </div>

      <div className="hidden sm:flex flex-col items-end gap-0.5 w-[150px] shrink-0">
        <span className="text-[11.5px] text-ink-2">{connection.routeModeLabel}</span>
        <span className="text-[11px] text-ink-3">
          {connection.enabled
            ? connection.nextRefreshAt
              ? `下次刷新 ${formatRelativePast(connection.nextRefreshAt, now + (Date.parse(connection.nextRefreshAt!) - now))}`
              : "待刷新"
            : "已暂停"}
        </span>
      </div>

      <div className="flex flex-col items-end gap-0.5 w-[120px] shrink-0">
        <span className="text-[11.5px] text-ink-2">
          {connection.lastSuccessAt ? formatDateTime(connection.lastSuccessAt) : "从未"}
        </span>
        <span className="text-[11px] text-ink-3">
          {connection.enabled ? "运行中" : "已停止"}
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button className="btn btn-outline" onPress={() => {}}>
          <Check size={13} /> 验证
        </Button>
        <Button className="btn btn-icon" onPress={() => {}} aria-label="编辑账号">
          <Plus size={14} className="rotate-45" />
        </Button>
      </div>
    </StableSurface>
  );
}

export type { ProviderKind };
