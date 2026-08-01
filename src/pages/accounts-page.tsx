import {
  KeyRound,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "react-aria-components";
import { useEffect, useState } from "react";
import { commandErrorMessage, quotaClient } from "../lib/quota-client";
import { formatDateTime, formatRelativePast } from "../lib/format";
import { toneForAccount } from "../lib/quota-logic";
import type { AccountConnectionView, ProviderKind } from "../lib/quota-types";
import { useNow } from "../lib/use-now";
import { PageHeader } from "../components/shell/app-shell";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { StableSurface } from "../components/ui/surface";
import { useToast } from "../components/ui/toast";
import { PausedBadge, PlanBadge, StatusBadge } from "../components/ui/status-badge";
import { ProviderMark } from "../components/quota/provider-mark";
import { AddAccountDialog } from "../components/quota/add-account-dialog";
import { AccountDetailDrawer } from "../components/quota/account-detail-drawer";
import {
  EditAccountDialog,
  UpdateCredentialDialog,
} from "../components/quota/account-dialogs";

export function AccountsPage() {
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [connections, setConnections] = useState<AccountConnectionView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AccountConnectionView | null>(null);
  const [credentialAccount, setCredentialAccount] =
    useState<AccountConnectionView | null>(null);
  const [deleting, setDeleting] = useState<AccountConnectionView | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const toast = useToast();

  async function reload() {
    setConnections(await quotaClient.getConnections());
  }

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

  async function act(id: string, action: () => Promise<unknown>): Promise<boolean> {
    setBusyId(id);
    setLoadError(null);
    let ok = true;
    try {
      await action();
    } catch (reason) {
      ok = false;
      setLoadError(commandErrorMessage(reason));
    } finally {
      try {
        await reload();
      } catch (reason) {
        ok = false;
        setLoadError(commandErrorMessage(reason));
      }
      setBusyId(null);
    }
    return ok;
  }

  return (
    <>
      <PageHeader
        title="账号与连接"
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
            <StableSurface className="px-4 py-3">
              <p className="text-[12.5px] text-ink-2">操作未完成</p>
              <p className="mt-0.5 text-[11px] text-ink-3">{loadError}</p>
            </StableSurface>
          )}
          {(connections ?? []).map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              now={now}
              busy={busyId === connection.id}
              onOpen={() => setDetailId(connection.id)}
              onVerify={() =>
                act(connection.id, () => quotaClient.refreshAccount(connection.id))
              }
              onToggle={() =>
                act(connection.id, () =>
                  quotaClient.updateAccount({
                    id: connection.id,
                    label: connection.accountLabel,
                    enabled: !connection.enabled,
                  }),
                )
              }
              onEdit={() => setEditing(connection)}
              onCredential={() => setCredentialAccount(connection)}
              onDelete={() => setDeleting(connection)}
            />
          ))}
          {connections?.length === 0 && (
            <StableSurface className="px-6 py-10 text-center">
              <p className="text-[13px] text-ink-2">还没有本地账号</p>
              <p className="mt-1 text-[11.5px] text-ink-3">
                添加供应商账号，开始统一监控额度
              </p>
            </StableSurface>
          )}
        </div>
      </div>

      <AddAccountDialog
        open={open}
        onClose={() => setOpen(false)}
        onSaved={(data) => {
          setConnections(data);
          toast.success("账号已添加");
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="删除本地账号"
        confirmLabel="删除"
        danger
        busy={deleting !== null && busyId === deleting.id}
        onConfirm={() => {
          if (!deleting) return;
          void act(deleting.id, () => quotaClient.deleteAccount(deleting.id)).then(
            (ok) => {
              if (ok) {
                setDeleting(null);
                toast.success("已删除本地账号");
              }
            },
          );
        }}
        onClose={() => setDeleting(null)}
      >
        将从本机删除“{deleting?.accountLabel}”及其历史记录，供应商账号不受影响。
      </ConfirmDialog>
      <EditAccountDialog
        account={editing}
        onClose={() => setEditing(null)}
        onSaved={(data) => {
          setConnections(data);
          setEditing(null);
          toast.success("账号标签已保存");
        }}
      />
      <UpdateCredentialDialog
        account={credentialAccount}
        onClose={() => setCredentialAccount(null)}
        onSaved={(data) => {
          setConnections(data);
          setCredentialAccount(null);
          toast.success("凭据已更新");
        }}
      />
      <AccountDetailDrawer
        accountId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={() =>
          void reload().catch((reason) => setLoadError(commandErrorMessage(reason)))
        }
      />
    </>
  );
}

function ConnectionRow({
  connection,
  now,
  busy,
  onOpen,
  onVerify,
  onToggle,
  onEdit,
  onCredential,
  onDelete,
}: {
  connection: AccountConnectionView;
  now: number;
  busy: boolean;
  onOpen: () => void;
  onVerify: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onCredential: () => void;
  onDelete: () => void;
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
  const scheduleText = !connection.enabled
    ? "已暂停"
    : connection.authPaused
      ? "凭据失效，自动刷新已暂停"
      : connection.nextAttemptAt
        ? `将于 ${formatDateTime(connection.nextAttemptAt)} 重试`
        : connection.nextRefreshAt
          ? `计划 ${formatDateTime(connection.nextRefreshAt)}`
          : "仅手动刷新";

  return (
    <StableSurface
      className="connection-row px-4 py-3.5 flex items-center gap-3.5"
      role="button"
      tabIndex={0}
      aria-label={`查看账号详情：${connection.accountLabel}`}
      onClick={onOpen}
      onKeyDown={(event: React.KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <ProviderMark provider={connection.provider} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="privacy-sensitive text-[13.5px] font-medium text-ink-1 truncate">
            {connection.accountLabel}
          </span>
          {connection.plan && <PlanBadge plan={connection.plan} />}
          {connection.enabled ? <StatusBadge tone={tone} /> : <PausedBadge />}
        </div>
        <div className="text-[11.5px] text-ink-3 truncate mt-0.5">
          {connection.providerName} · {connection.credentialLabel}
          {connection.sharedAccountCount > 1 && (
            <span>（共享 {connection.sharedAccountCount} 账号）</span>
          )}
        </div>
      </div>

      <div className="hidden md:flex flex-col items-end gap-0.5 w-[190px] shrink-0">
        <span className="text-[11.5px] text-ink-2">{connection.routeModeLabel}</span>
        <span className="text-[11px] text-ink-3">{scheduleText}</span>
      </div>

      <div className="hidden sm:flex flex-col items-end gap-0.5 w-[120px] shrink-0">
        <span className="text-[11.5px] text-ink-2">
          {connection.lastSuccessAt ? formatDateTime(connection.lastSuccessAt) : "从未"}
        </span>
        <span className="text-[11px] text-ink-3">
          {connection.consecutiveFailures > 0
            ? `连续失败 ${connection.consecutiveFailures} 次`
            : formatRelativePast(connection.lastSuccessAt, now)}
        </span>
      </div>

      <div
        className="flex items-center gap-1 shrink-0"
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          className="btn btn-icon"
          onPress={onVerify}
          isDisabled={busy || connection.authPaused || !connection.enabled}
          aria-label="立即验证"
          data-tooltip="立即刷新并验证"
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
        </Button>
        <Button
          className="btn btn-icon"
          onPress={onToggle}
          isDisabled={busy}
          aria-label={connection.enabled ? "暂停账号" : "恢复账号"}
          data-tooltip={connection.enabled ? "暂停自动刷新" : "恢复自动刷新"}
        >
          {connection.enabled ? <Pause size={14} /> : <Play size={14} />}
        </Button>
        <Button
          className="btn btn-icon"
          onPress={onCredential}
          aria-label="更新凭据"
          data-tooltip="更新此账号使用的凭据"
        >
          <KeyRound size={14} />
        </Button>
        <Button
          className="btn btn-icon"
          onPress={onEdit}
          aria-label="编辑账号标签"
          data-tooltip="编辑账号标签"
        >
          <Pencil size={14} />
        </Button>
        <Button
          className="btn btn-icon"
          onPress={onDelete}
          isDisabled={busy}
          aria-label="删除本地账号"
          data-tooltip="删除本地账号"
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </StableSurface>
  );
}

export type { ProviderKind };
