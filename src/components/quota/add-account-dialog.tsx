import { ArrowLeft, ArrowRight, Check, Globe, KeyRound } from "lucide-react";
import { Button, Dialog, DialogTrigger, Modal, ModalOverlay } from "react-aria-components";
import { useState } from "react";
import type { ProviderKind } from "../../lib/quota-types";
import { FloatingGlass } from "../ui/surface";
import { ProviderMark } from "./provider-mark";

const PROVIDERS: Array<{ id: ProviderKind; name: string; hint: string }> = [
  { id: "clinepass", name: "Cline Pass", hint: "API Key · 5h/周/月窗口" },
  { id: "opencode-go", name: "OpenCode Go", hint: "Cookie · 多工作区 · 5h/周/月" },
  { id: "ollama-cloud", name: "Ollama Cloud", hint: "Cookie · Session/Weekly" },
];

export function AddAccountDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState<ProviderKind | null>(null);
  const [credentialSource, setCredentialSource] = useState<"existing" | "new">("new");
  const [route, setRoute] = useState<"default" | "existing" | "new">("default");
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  function reset() {
    setStep(0);
    setProvider(null);
    setCredentialSource("new");
    setRoute("default");
    setLabel("");
    setScope("");
    setVerifying(false);
    setVerified(false);
  }

  function close() {
    reset();
    onClose();
  }

  const steps = ["供应商", "凭据与出口", "账号与验证"];

  return (
    <ModalOverlay
      isOpen={open}
      onOpenChange={(v) => !v && close()}
      isDismissable
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15, 18, 26, 0.32)", backdropFilter: "blur(3px)" }}
    >
      <Modal>
        <Dialog className="outline-none">
          {({ close: closeDialog }) => (
            <FloatingGlass
              className="w-[440px] max-w-full p-0 overflow-hidden"
              style={{ borderRadius: "var(--r-lg)" }}
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
                        onClick={() => setProvider(p.id)}
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
                          <div className="text-[11.5px] text-ink-3">{p.hint}</div>
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
                    <Field label="凭据来源">
                      <RadioGroup
                        value={credentialSource}
                        onChange={setCredentialSource}
                        options={[
                          { id: "existing", label: "使用已有凭据" },
                          { id: "new", label: "新建凭据（填写标签与秘密）" },
                        ]}
                      />
                      {credentialSource === "new" && (
                        <div className="flex flex-col gap-2 mt-2">
                          <TextInput placeholder="凭据标签，如 OpenCode · 主 Cookie" />
                          <TextAreaInput
                            placeholder={
                              provider === "clinepass"
                                ? "粘贴 ClinePass API Key"
                                : "粘贴完整 Cookie 请求头"
                            }
                          />
                          <p className="text-[11px] text-ink-3 flex items-center gap-1">
                            <KeyRound size={11} />
                            秘密仅本机保存到 Windows Credential Manager，不回显
                          </p>
                        </div>
                      )}
                    </Field>

                    <Field label="网络出口">
                      <RadioGroup
                        value={route}
                        onChange={setRoute}
                        options={[
                          { id: "default", label: "默认网络栈（当前 TUN/系统）" },
                          { id: "existing", label: "已有固定出口" },
                          { id: "new", label: "新建固定代理（scheme/host/port）" },
                        ]}
                      />
                      {route === "new" && (
                        <div className="flex gap-2 mt-2">
                          <TextInput placeholder="socks5h://host:port" className="flex-1" />
                          <TextInput placeholder="用户名" className="w-24" />
                          <TextInput placeholder="密码" className="w-20" />
                        </div>
                      )}
                      {provider && provider !== "clinepass" && (
                        <p className="text-[11px] text-ink-3 mt-2 flex items-center gap-1">
                          <Globe size={11} />
                          建议绑定创建该网页登录会话时的出口
                        </p>
                      )}
                    </Field>
                  </div>
                )}

                {step === 2 && (
                  <div className="flex flex-col gap-4">
                    <Field label="账号标签">
                      <TextInput
                        placeholder="如 工作区 B"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                      />
                    </Field>
                    {provider === "opencode-go" && (
                      <Field label="Workspace ID（可选）">
                        <TextInput
                          placeholder="wrk_… 留空则自动发现第一个"
                          value={scope}
                          onChange={(e) => setScope(e.target.value)}
                        />
                      </Field>
                    )}
                    <Field label="连接验证">
                      <Button
                        className="btn btn-accent"
                        onPress={async () => {
                          setVerifying(true);
                          await new Promise((r) => setTimeout(r, 700));
                          setVerifying(false);
                          setVerified(true);
                        }}
                        isDisabled={verifying || verified}
                      >
                        {verified ? (
                          <><Check size={14} /> 验证通过</>
                        ) : (
                          <>{verifying ? "验证中…" : "验证连接"}</>
                        )}
                      </Button>
                      <p className="text-[11px] text-ink-3 mt-2">
                        {verified
                          ? "凭据可用，可保存账号"
                          : "验证只读额度接口，不消耗模型额度"}
                      </p>
                    </Field>
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
                    (step === 0 && !provider) || (step === 2 && !verified)
                  }
                  onPress={() => {
                    if (step < 2) setStep(step + 1);
                    else close();
                  }}
                >
                  {step === 2 ? "保存账号" : "下一步"}
                  {step < 2 && <ArrowRight size={14} />}
                </Button>
              </div>
            </FloatingGlass>
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
  options: Array<{ id: T; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((opt) => (
        <label
          key={opt.id}
          className="flex items-center gap-2 cursor-pointer text-[12.5px] text-ink-2"
        >
          <input
            type="radio"
            checked={value === opt.id}
            onChange={() => onChange(opt.id)}
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