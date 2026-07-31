import {
  Check,
  KeyRound,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button, Dialog, Modal, ModalOverlay } from "react-aria-components";
import { useEffect, useState } from "react";
import { commandErrorMessage, quotaClient } from "../lib/quota-client";
import { formatDateTime, formatRelativePast } from "../lib/format";
import { toneForAccount } from "../lib/quota-logic";
import type { AccountConnectionView, ProviderKind } from "../lib/quota-types";
import { useNow } from "../lib/use-now";
import { PageHeader } from "../components/shell/app-shell";
import { FloatingGlass, StableSurface } from "../components/ui/surface";
import { PausedBadge, PlanBadge, StatusBadge } from "../components/ui/status-badge";
import { ProviderMark } from "../components/quota/provider-mark";
import { AddAccountDialog } from "../components/quota/add-account-dialog";

export function AccountsPage() {
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [connections, setConnections] = useState<AccountConnectionView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AccountConnectionView | null>(null);
  const [credentialAccount, setCredentialAccount] =
    useState<AccountConnectionView | null>(null);

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

  async function act(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setLoadError(null);
    try {
      await action();
      await reload();
    } catch (reason) {
      setLoadError(commandErrorMessage(reason));
    } finally {
      setBusyId(null);
    }
  }

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
        onSaved={setConnections}
      />
      <EditAccountDialog
        account={editing}
        onClose={() => setEditing(null)}
        onSaved={(data) => {
          setConnections(data);
          setEditing(null);
        }}
      />
      <UpdateCredentialDialog
        account={credentialAccount}
        onClose={() => setCredentialAccount(null)}
        onSaved={(data) => {
          setConnections(data);
          setCredentialAccount(null);
        }}
      />
    </>
  );
}

function ConnectionRow({
  connection,
  now,
  busy,
  onVerify,
  onToggle,
  onEdit,
  onCredential,
}: {
  connection: AccountConnectionView;
  now: number;
  busy: boolean;
  onVerify: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onCredential: () => void;
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
        ? `退避至 ${formatDateTime(connection.nextAttemptAt)}`
        : connection.nextRefreshAt
          ? `计划 ${formatDateTime(connection.nextRefreshAt)}`
          : "仅手动刷新";

  return (
    <StableSurface className="connection-row px-4 py-3.5 flex items-center gap-3.5">
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

      <div className="flex items-center gap-1 shrink-0">
        <Button
          className="btn btn-icon"
          onPress={onVerify}
          isDisabled={busy || connection.authPaused || !connection.enabled}
          aria-label="立即验证"
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
        </Button>
        <Button
          className="btn btn-icon"
          onPress={onToggle}
          isDisabled={busy}
          aria-label={connection.enabled ? "暂停账号" : "恢复账号"}
        >
          {connection.enabled ? <Pause size={14} /> : <Play size={14} />}
        </Button>
        <Button
          className="btn btn-icon"
          onPress={onCredential}
          aria-label="更新凭据"
        >
          <KeyRound size={14} />
        </Button>
        <Button
          className="btn btn-icon"
          onPress={onEdit}
          aria-label="编辑账号标签"
        >
          <Pencil size={14} />
        </Button>
      </div>
    </StableSurface>
  );
}

function EditAccountDialog({
  account,
  onClose,
  onSaved,
}: {
  account: AccountConnectionView | null;
  onClose: () => void;
  onSaved: (connections: AccountConnectionView[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setLabel(account?.accountLabel ?? ""), [account]);
  return (
    <ModalOverlay
      isOpen={account !== null}
      onOpenChange={(open) => !open && onClose()}
      isDismissable
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(15,18,26,.32)] backdrop-blur-[3px]"
    >
      <Modal>
        <Dialog aria-label="编辑账号" className="outline-none">
          <FloatingGlass className="w-[390px] max-w-full p-5">
            <h2 className="text-[15px] font-semibold text-ink-1">编辑账号</h2>
            <p className="mt-1 text-[11.5px] text-ink-3">
              修改本地显示标签，不影响供应商账号。
            </p>
            <input
              autoFocus
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="mt-4 w-full px-2.5 h-9 rounded-[var(--r-md)] text-[12.5px] text-ink-1 bg-[rgba(127,141,168,.06)] border border-[var(--line)] outline-none focus:border-[var(--accent)]"
            />
            {error && <p className="mt-2 text-[11px] text-[var(--danger)]">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button className="btn btn-outline" onPress={onClose}>取消</Button>
              <Button
                className="btn btn-accent"
                isDisabled={saving || !label.trim()}
                onPress={async () => {
                  if (!account) return;
                  setSaving(true);
                  setError(null);
                  try {
                    onSaved(
                      await quotaClient.updateAccount({
                        id: account.id,
                        label,
                        enabled: account.enabled,
                      }),
                    );
                  } catch (reason) {
                    setError(commandErrorMessage(reason));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Check size={14} /> {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </FloatingGlass>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function UpdateCredentialDialog({
  account,
  onClose,
  onSaved,
}: {
  account: AccountConnectionView | null;
  onClose: () => void;
  onSaved: (connections: AccountConnectionView[]) => void;
}) {
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setSecret("");
    setError(null);
  }, [account]);
  return (
    <ModalOverlay
      isOpen={account !== null}
      onOpenChange={(open) => !open && onClose()}
      isDismissable
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(15,18,26,.32)] backdrop-blur-[3px]"
    >
      <Modal>
        <Dialog aria-label="更新凭据" className="outline-none">
          <FloatingGlass className="w-[430px] max-w-full p-5">
            <h2 className="text-[15px] font-semibold text-ink-1">更新凭据</h2>
            <p className="mt-1 text-[11.5px] text-ink-3">
              {account?.sharedAccountCount && account.sharedAccountCount > 1
                ? `更新后会恢复共享该凭据的 ${account.sharedAccountCount} 个账号。`
                : "新凭据通过只读额度验证后才会替换旧值。"}
            </p>
            <textarea
              autoFocus
              rows={4}
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder={
                account?.provider === "clinepass" ? "粘贴新的 API Key" : "粘贴新的完整 Cookie"
              }
              className="mt-4 w-full px-2.5 py-2 rounded-[var(--r-md)] text-[12.5px] text-ink-1 bg-[rgba(127,141,168,.06)] border border-[var(--line)] outline-none focus:border-[var(--accent)] resize-none"
            />
            {error && <p className="mt-2 text-[11px] text-[var(--danger)]">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button className="btn btn-outline" onPress={onClose}>取消</Button>
              <Button
                className="btn btn-accent"
                isDisabled={saving || !secret.trim()}
                onPress={async () => {
                  if (!account) return;
                  setSaving(true);
                  setError(null);
                  try {
                    onSaved(
                      await quotaClient.updateCredential({
                        credentialId: account.credentialId,
                        secret,
                      }),
                    );
                    setSecret("");
                  } catch (reason) {
                    setError(commandErrorMessage(reason));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <KeyRound size={14} /> {saving ? "验证中…" : "验证并更新"}
              </Button>
            </div>
          </FloatingGlass>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

export type { ProviderKind };
