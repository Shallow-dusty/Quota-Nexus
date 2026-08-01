import { ArrowLeft, ArrowRight, Check, Globe } from "lucide-react";
import { Button, Dialog, Modal, ModalOverlay } from "react-aria-components";
import { useEffect, useState } from "react";
import {
  commandErrorMessage,
  quotaClient,
  type RouteSelectionInput,
} from "../../lib/quota-client";
import type {
  AccountConnectionView,
  CredentialOptionView,
  NetworkProfileView,
} from "../../lib/quota-types";
import type { ProviderKind } from "../../lib/quota-types";
import { GlassSurface } from "../ui/glass";
import { ProviderMark } from "./provider-mark";

const PROVIDERS: Array<{ id: ProviderKind; name: string; hint: string }> = [
  { id: "clinepass", name: "Cline Pass", hint: "API Key · 5h/周/月窗口" },
  { id: "opencode-go", name: "OpenCode Go", hint: "Cookie · 多工作区 · 5h/周/月" },
  { id: "ollama-cloud", name: "Ollama Cloud", hint: "API Key（推荐）· Session/Weekly" },
];

export function AddAccountDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: (connections: AccountConnectionView[]) => void;
}) {
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState<ProviderKind | null>(null);
  const [credentialSource, setCredentialSource] = useState<"existing" | "new">("new");
  const [route, setRoute] = useState<"default" | "existing" | "new">("default");
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState("");
  const [credentialLabel, setCredentialLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [networkProfiles, setNetworkProfiles] = useState<NetworkProfileView[]>([]);
  const [credentials, setCredentials] = useState<CredentialOptionView[]>([]);
  const [existingCredentialId, setExistingCredentialId] = useState("");
  const [existingProfileId, setExistingProfileId] = useState("");
  const [proxyLabel, setProxyLabel] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [proxyUsername, setProxyUsername] = useState("");
  const [proxyPassword, setProxyPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep(0);
    setProvider(null);
    setCredentialSource("new");
    setRoute("default");
    setLabel("");
    setScope("");
    setCredentialLabel("");
    setSecret("");
    setExistingProfileId("");
    setExistingCredentialId("");
    setProxyLabel("");
    setProxyUrl("");
    setProxyUsername("");
    setProxyPassword("");
    setSaving(false);
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([
      quotaClient.getNetworkProfiles(),
      quotaClient.getCredentials(),
    ])
      .then(([profiles, credentialOptions]) => {
        if (!active) return;
        setNetworkProfiles(profiles);
        setCredentials(credentialOptions);
        setExistingProfileId((current) => current || profiles[0]?.id || "");
      })
      .catch((reason) => {
        if (active) setError(commandErrorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [open]);

  function selectedRoute(): RouteSelectionInput {
    if (route === "existing") {
      return { mode: "existing", profileId: existingProfileId };
    }
    if (route === "new") {
      return {
        mode: "new",
        label: proxyLabel,
        proxyUrl,
        username: proxyUsername.trim() || undefined,
        password: proxyPassword || undefined,
      };
    }
    return { mode: "default" };
  }

  function invalidateValidation() {
    setError(null);
  }

  const steps = ["供应商", "账号与凭据"];
  const providerCredentials = credentials.filter(
    (credential) => credential.provider === provider,
  );

  return (
    <ModalOverlay
      isOpen={open}
      onOpenChange={(v) => !v && close()}
      isDismissable
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15, 18, 26, 0.32)", backdropFilter: "blur(3px)" }}
    >
      <Modal>
        <Dialog className="outline-none" aria-label="添加账号">
          {({ close: closeDialog }) => (
            <GlassSurface radius={20} blur={8}
              className="account-dialog w-[500px] max-w-full p-0 overflow-hidden"
            >
              {/* 步骤头 */}
              <div className="px-5 pt-4 pb-3 border-b border-[var(--line)]">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold text-ink-1">添加账号</h2>
                  <span className="text-[11.5px] text-ink-3">
                    步骤 {step + 1}/{steps.length} · {steps[step]}
                  </span>
                </div>
                <div className="mt-2.5 flex gap-1">
                  {steps.map((s, i) => (
                    <span
                      key={s}
                      className="h-1 flex-1 rounded-full"
                      style={{
                        background:
                          i <= step ? "var(--accent)" : "var(--track)",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* 步骤体 */}
              <div className="px-5 py-4 min-h-[220px]">
                {step === 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[12.5px] text-ink-3 mb-1">选择要添加的供应商</p>
                    {PROVIDERS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setProvider(p.id);
                          const firstCredential = credentials.find(
                            (credential) => credential.provider === p.id,
                          );
                          setExistingCredentialId(firstCredential?.id ?? "");
                          if (!firstCredential && credentialSource === "existing") {
                            setCredentialSource("new");
                          }
                          invalidateValidation();
                        }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--r-md)] text-left transition-colors"
                        style={{
                          border: "1px solid var(--line)",
                          background:
                            provider === p.id ? "var(--accent-soft)" : "transparent",
                          borderColor:
                            provider === p.id ? "var(--accent)" : "var(--line)",
                        }}
                      >
                        <ProviderMark provider={p.id} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-ink-1">{p.name}</div>
                          <div className="text-[11.5px] text-ink-3">
                            {p.hint}
                          </div>
                        </div>
                        {provider === p.id && (
                          <Check size={16} className="text-accent" />
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {step === 1 && (
                  <div className="flex flex-col gap-4">
                    <Field label="账号标签">
                      <TextInput
                        placeholder="如 主账号、工作区 B"
                        value={label}
                        onChange={(event) => {
                          setLabel(event.target.value);
                          invalidateValidation();
                        }}
                      />
                    </Field>
                    {provider === "opencode-go" && (
                      <Field label="Workspace ID（可选）">
                        <TextInput
                          placeholder="wrk_… 留空则自动发现全部工作区"
                          value={scope}
                          onChange={(event) => {
                            setScope(event.target.value);
                            invalidateValidation();
                          }}
                        />
                      </Field>
                    )}
                    <Field label="凭据来源">
                      <RadioGroup
                        value={credentialSource}
                        onChange={setCredentialSource}
                        options={[
                          {
                            id: "existing",
                            label: "使用已有凭据",
                            disabled: providerCredentials.length === 0,
                          },
                          { id: "new", label: "新建凭据（填写标签与秘密）" },
                        ]}
                      />
                      {credentialSource === "existing" && (
                        <select
                          value={existingCredentialId}
                          onChange={(event) => {
                            setExistingCredentialId(event.target.value);
                            invalidateValidation();
                          }}
                          className="mt-2 px-2.5 h-8 rounded-[var(--r-md)] text-[12.5px] text-ink-1 bg-[var(--surface-raised)] border border-[var(--line)] outline-none focus:border-[var(--accent)]"
                        >
                          {providerCredentials.map((credential) => (
                            <option key={credential.id} value={credential.id}>
                              {credential.label} · {credential.routeModeLabel}
                            </option>
                          ))}
                        </select>
                      )}
                      {credentialSource === "new" && (
                        <div className="flex flex-col gap-2 mt-2">
                          <TextInput
                            placeholder={`凭据标签，如 ${
                              provider === "clinepass"
                                ? "Cline Pass · 主 Key"
                                : provider === "opencode-go"
                                  ? "OpenCode · 主账号"
                                  : "Ollama · 主账号"
                            }`}
                            value={credentialLabel}
                            onChange={(event) => {
                              setCredentialLabel(event.target.value);
                              invalidateValidation();
                            }}
                          />
                          <TextAreaInput
                            placeholder={
                              provider === "clinepass"
                                ? "粘贴 API Key 或 Authorization 请求头"
                                : provider === "opencode-go"
                                  ? "粘贴 Cookie，或 Firefox 请求头 JSON"
                                  : "粘贴 Ollama API Key（推荐），也兼容 Cookie"
                            }
                            value={secret}
                            onChange={(event) => {
                              setSecret(event.target.value);
                              invalidateValidation();
                            }}
                          />
                        </div>
                      )}
                    </Field>

                    {credentialSource === "new" && <Field label="网络出口">
                      <RadioGroup
                        value={route}
                        onChange={(next) => {
                          setRoute(next);
                          invalidateValidation();
                        }}
                        options={[
                          { id: "default", label: "默认网络栈（当前 TUN/系统）" },
                          {
                            id: "existing",
                            label: "使用已有固定出口",
                            disabled: networkProfiles.length === 0,
                          },
                          {
                            id: "new",
                            label: "新建固定代理",
                          },
                        ]}
                      />
                      {route === "existing" && (
                        <select
                          value={existingProfileId}
                          onChange={(event) => {
                            setExistingProfileId(event.target.value);
                            invalidateValidation();
                          }}
                          className="mt-2 px-2.5 h-8 rounded-[var(--r-md)] text-[12.5px] text-ink-1 bg-[var(--surface-raised)] border border-[var(--line)] outline-none focus:border-[var(--accent)]"
                        >
                          {networkProfiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                              {profile.label} · {profile.endpointLabel}
                              {profile.hasAuth ? " · 已认证" : ""}
                            </option>
                          ))}
                        </select>
                      )}
                      {route === "new" && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <TextInput
                            placeholder="出口标签，如 OpenCode · 日本"
                            value={proxyLabel}
                            onChange={(event) => {
                              setProxyLabel(event.target.value);
                              invalidateValidation();
                            }}
                          />
                          <TextInput
                            placeholder="socks5h://host:port"
                            value={proxyUrl}
                            onChange={(event) => {
                              setProxyUrl(event.target.value);
                              invalidateValidation();
                            }}
                          />
                          <TextInput
                            placeholder="用户名（可选）"
                            value={proxyUsername}
                            onChange={(event) => {
                              setProxyUsername(event.target.value);
                              invalidateValidation();
                            }}
                          />
                          <TextInput
                            type="password"
                            placeholder="密码（可选）"
                            value={proxyPassword}
                            onChange={(event) => {
                              setProxyPassword(event.target.value);
                              invalidateValidation();
                            }}
                          />
                        </div>
                      )}
                      {provider === "opencode-go" && (
                        <p className="text-[11px] text-ink-3 mt-2 flex items-center gap-1">
                          <Globe size={11} />
                          建议与网页登录时使用的网络出口一致
                        </p>
                      )}
                    </Field>}
                    {error && (
                      <p className="text-[11px] text-[var(--danger)]" role="alert">
                        {error}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* 步骤尾 */}
              <div className="px-5 py-3 border-t border-[var(--line)] flex items-center justify-between">
                <Button
                  className="btn btn-outline"
                  onPress={() => (step === 0 ? closeDialog() : setStep(step - 1))}
                >
                  <ArrowLeft size={14} />
                  {step === 0 ? "取消" : "上一步"}
                </Button>
                <Button
                  className="btn btn-accent"
                  isDisabled={
                    saving ||
                    (step === 0 && !provider) ||
                    (step === 1 &&
                      (credentialSource === "new"
                        ? !label.trim() ||
                          !credentialLabel.trim() ||
                          !secret.trim() ||
                          (route === "existing" && !existingProfileId) ||
                          (route === "new" &&
                            (!proxyLabel.trim() || !proxyUrl.trim()))
                        : !label.trim() || !existingCredentialId))
                  }
                  onPress={async () => {
                    if (step < 1) {
                      setStep(step + 1);
                      return;
                    }
                    setSaving(true);
                    setError(null);
                    try {
                      if (!provider) return;
                      const connections =
                        await quotaClient.createProviderAccount({
                          provider,
                          accountLabel: label,
                          credentialLabel,
                          secret,
                          existingCredentialId:
                            credentialSource === "existing"
                              ? existingCredentialId
                              : undefined,
                          workspaceId: scope.trim() || undefined,
                          route: selectedRoute(),
                        });
                      setSecret("");
                      onSaved?.(connections);
                      close();
                    } catch (reason) {
                      setError(commandErrorMessage(reason));
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {step === 1
                    ? saving
                      ? "验证中…"
                      : "验证并添加"
                    : "下一步"}
                  {step < 1 && <ArrowRight size={14} />}
                </Button>
              </div>
            </GlassSurface>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12.5px] font-medium text-ink-2">{label}</label>
      {children}
    </div>
  );
}

function RadioGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ id: T; label: string; disabled?: boolean }>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((opt) => (
        <label
          key={opt.id}
          className="flex items-center gap-2 cursor-pointer text-[12.5px] text-ink-2"
          style={{ opacity: opt.disabled ? 0.52 : 1 }}
        >
          <input
            type="radio"
            checked={value === opt.id}
            onChange={() => onChange(opt.id)}
            disabled={opt.disabled}
            className="accent-[var(--accent)]"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <input
      {...props}
      className={`px-2.5 h-8 rounded-[var(--r-md)] text-[12.5px] text-ink-1 bg-[rgba(127,141,168,0.06)] border border-[var(--line)] outline-none focus:border-[var(--accent)] ${props.className ?? ""}`}
    />
  );
}

function TextAreaInput(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      rows={3}
      className="px-2.5 py-2 rounded-[var(--r-md)] text-[12.5px] text-ink-1 bg-[rgba(127,141,168,0.06)] border border-[var(--line)] outline-none focus:border-[var(--accent)] resize-none"
    />
  );
}
