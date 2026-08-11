import { Check, KeyRound } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, Modal, ModalOverlay } from "../ui/modal";
import { useEffect, useState } from "react";
import { commandErrorMessage, quotaClient } from "../../lib/quota-client";
import type { AccountConnectionView } from "../../lib/quota-types";
import { GlassSurface } from "../ui/glass";

/** 编辑账号标签（账号页与详情抽屉共用） */
export function EditAccountDialog({
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
          <GlassSurface radius={20} blur={8} className="w-[390px] max-w-full p-5">
            <h2 className="text-[15px] font-semibold text-ink-1">编辑账号</h2>
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
          </GlassSurface>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/** 更新凭据（账号页与详情抽屉共用） */
export function UpdateCredentialDialog({
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
          <GlassSurface radius={20} blur={8} className="w-[430px] max-w-full p-5">
            <h2 className="text-[15px] font-semibold text-ink-1">更新凭据</h2>
            <p className="mt-1 text-[11.5px] text-ink-3">
              {account?.sharedAccountCount && account.sharedAccountCount > 1
                ? `该凭据被 ${account.sharedAccountCount} 个账号共享，更新后将同时恢复。`
                : "验证通过后才会替换旧凭据。"}
            </p>
            <textarea
              autoFocus
              rows={4}
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder={
                account?.provider === "clinepass"
                  ? "粘贴新的 API Key 或 Authorization 请求头"
                  : account?.provider === "ollama-cloud"
                    ? "粘贴新的 API Key（推荐）或兼容 Cookie"
                    : "粘贴新的 Cookie 或 Firefox 请求头 JSON"
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
          </GlassSurface>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
