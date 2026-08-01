import {
  KeyRound,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "react-aria-components";
import { useCallback, useEffect, useState } from "react";
import { commandErrorMessage, quotaClient } from "../../lib/quota-client";
import { ERROR_HINT, ERROR_LABEL } from "../../lib/quota-copy";
import { formatDateTime, formatRelativePast } from "../../lib/format";
import { toneForAccount } from "../../lib/quota-logic";
import type {
  AccountConnectionView,
  ServiceQuotaView,
} from "../../lib/quota-types";
import { useNow } from "../../lib/use-now";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { PausedBadge, PlanBadge, StatusBadge } from "../ui/status-badge";
import { useToast } from "../ui/toast";
import { ProviderMark } from "./provider-mark";
import { QuotaWindowRow } from "./quota-window-row";
import { AccountTrend } from "./history-trend";
import { EditAccountDialog, UpdateCredentialDialog } from "./account-dialogs";

/**
 * 账号详情抽屉：从概览卡片或账号列表进入的详情层。
 * 聚合当前额度、调度状态、历史趋势与全部账号操作，
 * 按 accountId 自加载数据，操作后通过 onChanged 通知父级刷新。
 */
export function AccountDetailDrawer({
  accountId,
  onClose,
  onChanged,
}: {
  accountId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const now = useNow();
  const toast = useToast();
  const [account, setAccount] = useState<ServiceQuotaView | null>(null);
  const [connection, setConnection] = useState<AccountConnectionView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [credential, setCredential] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    try {
      const [overview, connections] = await Promise.all([
        quotaClient.getOverview(),
        quotaClient.getConnections(),
      ]);
      setAccount(overview.accounts.find((a) => a.id === accountId) ?? null);
      setConnection(connections.find((c) => c.id === accountId) ?? null);
      setLoadError(null);
    } catch (reason) {
      setLoadError(commandErrorMessage(reason));
    }
  }, [accountId]);

  useEffect(() => {
    setAccount(null);
    setConnection(null);
    setLoadError(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (!accountId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [accountId, onClose]);

  if (!accountId) return null;

  const paused = account?.state === "paused";
  const stale = account?.state === "stale-with-error";
  const tone = account ? toneForAccount(account) : "normal";

  async function run(action: () => Promise<unknown>, success?: string): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      await load();
      onChanged();
      if (success) toast.success(success);
      return true;
    } catch (reason) {
      toast.error("操作未完成", commandErrorMessage(reason));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="drawer-root fixed inset-0 z-[60]">
      <button
        type="button"
        className="drawer-backdrop absolute inset-0 w-full h-full"
        aria-label="关闭详情"
        onClick={onClose}
      />
      <aside
        className="drawer-panel absolute top-0 right-0 bottom-0 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={account ? `账号详情：${account.accountLabel}` : "账号详情"}
      >
        {loadError && (
          <p className="m-4 px-3 py-2.5 rounded-[var(--r-md)] text-[12px] text-[var(--danger)] border border-[var(--line)]">
            {loadError}
          </p>
        )}
        {!account && !loadError ? (
          <p className="py-20 text-center text-[12px] text-ink-3">正在读取账号…</p>
        ) : account ? (
          <>
            <header className="drawer-heading flex items-start gap-3 px-5 pt-5 pb-4 border-b border-[var(--line)]">
              <ProviderMark provider={account.provider} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="privacy-sensitive text-[15px] font-semibold text-ink-1 truncate">
                    {account.accountLabel}
                  </h2>
                  {account.plan && <PlanBadge plan={account.plan} />}
                </div>
                <p className="text-[11.5px] text-ink-3 mt-0.5">
                  {account.providerName}
                </p>
                <div className="mt-2">
                  {paused ? <PausedBadge /> : <StatusBadge tone={tone} />}
                </div>
              </div>
              <Button
                className="btn btn-icon shrink-0"
                aria-label="关闭详情"
                onPress={onClose}
              >
                <X size={15} />
              </Button>
            </header>

            <div className="drawer-body flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
              <div className="flex flex-wrap gap-2">
                <Button
                  className="btn btn-outline"
                  isDisabled={busy || paused || account.errorCategory === "auth"}
                  onPress={() => void run(() => quotaClient.refreshAccount(account.id))}
                >
                  <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
                  立即刷新
                </Button>
                {connection && (
                  <Button
                    className="btn btn-outline"
                    isDisabled={busy}
                    onPress={() =>
                      void run(
                        () =>
                          quotaClient.updateAccount({
                            id: connection.id,
                            label: connection.accountLabel,
                            enabled: !connection.enabled,
                          }),
                        connection.enabled ? "已暂停自动刷新" : "已恢复自动刷新",
                      )
                    }
                  >
                    {connection.enabled ? <Pause size={14} /> : <Play size={14} />}
                    {connection.enabled ? "暂停自动刷新" : "恢复自动刷新"}
                  </Button>
                )}
                {connection && (
                  <>
                    <Button
                      className="btn btn-outline"
                      isDisabled={busy}
                      onPress={() => setEditing(true)}
                    >
                      <Pencil size={14} />
                      编辑标签
                    </Button>
                    <Button
                      className="btn btn-outline"
                      isDisabled={busy}
                      onPress={() => setCredential(true)}
                    >
                      <KeyRound size={14} />
                      更新凭据
                    </Button>
                    <Button
                      className="btn btn-outline drawer-delete"
                      isDisabled={busy}
                      onPress={() => setConfirmDelete(true)}
                    >
                      <Trash2 size={14} />
                      删除
                    </Button>
                  </>
                )}
              </div>

              {stale && account.errorCategory && (
                <div
                  className="px-3 py-2.5 rounded-[var(--r-md)] text-[12px]"
                  style={{ background: "var(--stale-soft)", color: "var(--stale)" }}
                >
                  <span className="font-medium">{ERROR_LABEL[account.errorCategory]}</span>
                  <span className="text-ink-3"> · {ERROR_HINT[account.errorCategory]}</span>
                </div>
              )}

              <section aria-label="额度窗口">
                <h3 className="text-[13px] font-semibold text-ink-1 mb-3">额度窗口</h3>
                <div className="flex flex-col gap-4">
                  {account.windows.map((w) => (
                    <QuotaWindowRow key={w.id} window={w} now={now} />
                  ))}
                </div>
              </section>

              {connection && (
                <section aria-label="连接状态">
                  <h3 className="text-[13px] font-semibold text-ink-1 mb-2">连接状态</h3>
                  <dl className="drawer-meta">
                    <div>
                      <dt>上次成功</dt>
                      <dd>{formatRelativePast(connection.lastSuccessAt, now)}</dd>
                    </div>
                    <div>
                      <dt>下次刷新</dt>
                      <dd>
                        {!connection.enabled
                          ? "已暂停"
                          : connection.authPaused
                            ? "凭据失效，已暂停"
                            : connection.nextAttemptAt
                              ? `将于 ${formatDateTime(connection.nextAttemptAt)} 重试`
                              : connection.nextRefreshAt
                                ? formatDateTime(connection.nextRefreshAt)
                                : "仅手动刷新"}
                      </dd>
                    </div>
                    <div>
                      <dt>网络出口</dt>
                      <dd>{connection.routeModeLabel}</dd>
                    </div>
                    <div>
                      <dt>凭据</dt>
                      <dd>
                        {connection.credentialLabel}
                        {connection.sharedAccountCount > 1
                          ? `（${connection.sharedAccountCount} 个账号共享）`
                          : ""}
                      </dd>
                    </div>
                  </dl>
                </section>
              )}

              <AccountTrend accountId={account.id} />
            </div>
          </>
        ) : null}

        {connection && account && (
          <>
            <EditAccountDialog
              account={editing ? connection : null}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                void run(async () => undefined, "账号标签已保存");
              }}
            />
            <UpdateCredentialDialog
              account={credential ? connection : null}
              onClose={() => setCredential(false)}
              onSaved={() => {
                setCredential(false);
                void run(async () => undefined, "凭据已更新");
              }}
            />
            <ConfirmDialog
              open={confirmDelete}
              title="删除本地账号"
              confirmLabel="删除"
              danger
              busy={busy}
              onConfirm={() => {
                void run(
                  () => quotaClient.deleteAccount(account.id),
                  "已删除本地账号",
                ).then((ok) => {
                  if (ok) {
                    setConfirmDelete(false);
                    onClose();
                  }
                });
              }}
              onClose={() => setConfirmDelete(false)}
            >
              将从本机删除“{account.accountLabel}”及其历史记录，供应商账号不受影响。
            </ConfirmDialog>
          </>
        )}
      </aside>
    </div>
  );
}
