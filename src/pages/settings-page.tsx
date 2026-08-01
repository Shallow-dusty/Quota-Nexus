import {
  Bell,
  Globe2,
  History,
  LayoutGrid,
  MonitorSmartphone,
  Palette,
  ShieldCheck,
  Trash2,
  Timer,
} from "lucide-react";
import { Button } from "react-aria-components";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { commandErrorMessage, quotaClient } from "../lib/quota-client";
import { useToast } from "../components/ui/toast";
import { useApplyThresholds } from "../lib/thresholds";
import { formatRelativePast } from "../lib/format";
import type {
  AppSettingsView,
  NetworkProfileView,
  ProviderHealthView,
  ThemePreference,
} from "../lib/quota-types";
import { useNow } from "../lib/use-now";
import { PageHeader } from "../components/shell/app-shell";
import { GlassSurface } from "../components/ui/glass";
import { SegmentedControl } from "../components/ui/segmented";

interface SettingsProps {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  transparencyOff: boolean;
  onTransparencyChange: (off: boolean) => void;
  onPrivacyChange?: (enabled: boolean) => void;
}

export function SettingsPage({
  theme,
  onThemeChange,
  transparencyOff,
  onTransparencyChange,
  onPrivacyChange,
}: SettingsProps) {
  const now = useNow();
  const [settings, setSettings] = useState<AppSettingsView | null>(null);
  const [health, setHealth] = useState<ProviderHealthView[]>([]);
  const [networkProfiles, setNetworkProfiles] = useState<NetworkProfileView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [diagnosticFiles, setDiagnosticFiles] = useState<string[]>([]);
  const [diagnosticPath, setDiagnosticPath] = useState<string | null>(null);
  const toast = useToast();
  const applyThresholds = useApplyThresholds();

  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(() => {
    setLoadFailed(false);
    setError(null);
    Promise.all([
      quotaClient.getSettings(),
      quotaClient.getProviderHealth(),
      quotaClient.getNetworkProfiles(),
    ])
      .then(([nextSettings, nextHealth, nextProfiles]) => {
        setSettings(nextSettings);
        setHealth(nextHealth);
        setNetworkProfiles(nextProfiles);
        onPrivacyChange?.(nextSettings.privacyMode);
      })
      .catch((reason) => {
        setLoadFailed(true);
        setError(commandErrorMessage(reason));
      });
  }, [onPrivacyChange]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(patch: Partial<AppSettingsView>) {
    if (!settings || saving) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    setError(null);
    try {
      const stored = await quotaClient.updateSettings(next);
      setSettings(stored);
      applyThresholds({
        warning: stored.warningThreshold,
        high: stored.highThreshold,
        critical: stored.criticalThreshold,
      });
      if ("privacyMode" in patch) onPrivacyChange?.(stored.privacyMode);
      setHealth(await quotaClient.getProviderHealth());
    } catch (reason) {
      setSettings(settings);
      const message = commandErrorMessage(reason);
      setError(message);
      toast.error("设置保存失败", message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="设置"
        subtitle={saving ? "正在保存…" : undefined}
      />
      <div className="page-scroll settings-page flex-1 overflow-y-auto px-7 py-5">
        {error && (
          <GlassSurface radius={18} className="mb-4 px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-[11.5px] text-[var(--danger)]">{error}</span>
            {loadFailed && (
              <Button className="btn btn-outline" onPress={load}>
                重试
              </Button>
            )}
          </GlassSurface>
        )}
        <div className="settings-grid max-w-[920px] flex items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Section icon={<Timer size={15} />} title="刷新">
            <Row label="刷新周期">
              <SegmentedControl
                value={
                  settings?.refreshIntervalMinutes === null
                    ? "manual"
                    : String(settings?.refreshIntervalMinutes ?? 15)
                }
                onChange={(value) =>
                  save({
                    refreshIntervalMinutes:
                      value === "manual"
                        ? null
                        : (Number(value) as 5 | 15 | 30),
                  })
                }
                options={[
                  { id: "manual", label: "手动" },
                  { id: "5", label: "5 分钟" },
                  { id: "15", label: "15 分钟" },
                  { id: "30", label: "30 分钟" },
                ]}
              />
            </Row>
            <Row
              label="达到 Warning 提速至 5 分钟"
              hint="低于 Warning 5 个百分点后恢复基础周期"
            >
              <Toggle
                value={settings?.adaptiveRefresh ?? true}
                onChange={(adaptiveRefresh) => save({ adaptiveRefresh })}
              />
            </Row>
          </Section>

          <Section icon={<MonitorSmartphone size={15} />} title="系统">
            <Row label="托盘运行" hint="关闭窗口后驻留后台">
              <Toggle
                value={settings?.trayEnabled ?? true}
                onChange={(trayEnabled) => save({ trayEnabled })}
              />
            </Row>
            <Row label="开机自启" hint="默认关闭">
              <Toggle
                value={settings?.autostartEnabled ?? false}
                onChange={(autostartEnabled) => save({ autostartEnabled })}
              />
            </Row>
          </Section>

          <Section icon={<Bell size={15} />} title="通知阈值">
            <div className="grid grid-cols-3 gap-3 px-4 py-3">
              <ThresholdField
                label="Warning"
                value={settings?.warningThreshold ?? 70}
                tone="warn"
                onCommit={(warningThreshold) => save({ warningThreshold })}
              />
              <ThresholdField
                label="High"
                value={settings?.highThreshold ?? 85}
                tone="high"
                onCommit={(highThreshold) => save({ highThreshold })}
              />
              <ThresholdField
                label="Critical"
                value={settings?.criticalThreshold ?? 95}
                tone="crit"
                onCommit={(criticalThreshold) => save({ criticalThreshold })}
              />
            </div>
            <Row label="认证失效通知" hint="首次检测时通知，之后按状态代次去重">
              <Toggle
                value={settings?.notifyAuth ?? true}
                onChange={(notifyAuth) => save({ notifyAuth })}
              />
            </Row>
            <Row label="数据陈旧通知" hint="连续失败且超过刷新窗口">
              <Toggle
                value={settings?.notifyStale ?? true}
                onChange={(notifyStale) => save({ notifyStale })}
              />
            </Row>
            <Row label="恢复通知">
              <Toggle
                value={settings?.notifyRecovery ?? false}
                onChange={(notifyRecovery) => save({ notifyRecovery })}
              />
            </Row>
            <div className="px-4 py-3">
              <Button
                className="btn btn-outline"
                onPress={async () => {
                  try {
                    await quotaClient.sendTestNotification();
                    toast.success("测试通知已发送");
                  } catch (reason) {
                    toast.error("通知发送失败", commandErrorMessage(reason));
                  }
                }}
              >
                发送测试通知
              </Button>
            </div>
          </Section>

          <Section icon={<History size={15} />} title="历史保留">
            <Row label="历史保留时长">
              <SegmentedControl
                value={
                  settings?.historyDays === null
                    ? "off"
                    : String(settings?.historyDays ?? 30)
                }
                onChange={(value) =>
                  save({
                    historyDays:
                      value === "off" ? null : (Number(value) as 7 | 30 | 90),
                  })
                }
                options={[
                  { id: "off", label: "关闭" },
                  { id: "7", label: "7 天" },
                  { id: "30", label: "30 天" },
                  { id: "90", label: "90 天" },
                ]}
              />
            </Row>
          </Section>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-4">

          <Section icon={<Palette size={15} />} title="外观">
            <Row label="主题">
              <SegmentedControl
                value={theme}
                onChange={onThemeChange}
                options={[
                  { id: "system", label: "跟随系统" },
                  { id: "light", label: "浅色" },
                  { id: "dark", label: "深色" },
                ]}
              />
            </Row>
            <Row label="透明效果" hint="关闭后所有表面回退为实色">
              <Toggle
                value={!transparencyOff}
                onChange={(value) => onTransparencyChange(!value)}
              />
            </Row>
          </Section>

          <Section icon={<ShieldCheck size={15} />} title="隐私">
            <Row label="截图隐私模式" hint="隐藏账号标签与外部 ID">
              <Toggle
                value={settings?.privacyMode ?? false}
                onChange={(privacyMode) => save({ privacyMode })}
              />
            </Row>
          </Section>

          <Section icon={<Globe2 size={15} />} title="固定出口">
            <NetworkProfilesEditor
              profiles={networkProfiles}
              onChange={setNetworkProfiles}
              onError={setError}
            />
          </Section>

          <Section icon={<LayoutGrid size={15} />} title="诊断">
            <ProviderHealthTable health={health} now={now} />
            <div className="border-t border-[var(--line)] px-4 py-3">
              {diagnosticFiles.length > 0 && (
                <ul className="mb-3 list-disc pl-4 text-[11px] text-ink-3">
                  {diagnosticFiles.map((file) => <li key={file}>{file}</li>)}
                </ul>
              )}
              {diagnosticPath && (
                <p className="mb-3 break-all text-[11px] text-[var(--ok)]">
                  已导出：{diagnosticPath}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  className="btn btn-outline"
                  onPress={async () => {
                    try {
                      setDiagnosticFiles(await quotaClient.getDiagnosticManifest());
                    } catch (reason) {
                      setError(commandErrorMessage(reason));
                    }
                  }}
                >
                  查看诊断包内容
                </Button>
                <Button
                  className="btn btn-accent"
                  onPress={async () => {
                    try {
                      setDiagnosticPath(await quotaClient.exportDiagnostics());
                    } catch (reason) {
                      setError(commandErrorMessage(reason));
                    }
                  }}
                >
                  导出脱敏诊断包
                </Button>
              </div>
            </div>
          </Section>
          </div>
        </div>
      </div>
    </>
  );
}

function NetworkProfilesEditor({
  profiles,
  onChange,
  onError,
}: {
  profiles: NetworkProfileView[];
  onChange: (profiles: NetworkProfileView[]) => void;
  onError: (message: string | null) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0];
  const [label, setLabel] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [clearAuth, setClearAuth] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    setLabel(selected.label);
    setProxyUrl(selected.endpointLabel.replace(" · ", "://"));
    setUsername("");
    setPassword("");
    setClearAuth(false);
  }, [selected?.id]);

  if (!selected) {
    return (
      <p className="px-4 py-4 text-[11.5px] text-ink-3">
        尚未创建固定出口；添加账号时可新建 HTTP(S) 或 SOCKS5(H) 出口。
      </p>
    );
  }

  return (
    <div className="px-4 py-3 flex flex-col gap-2.5">
      <select
        aria-label="选择固定出口"
        value={selected.id}
        onChange={(event) => setSelectedId(event.target.value)}
        className="h-8 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-raised)] px-2 text-[12px] text-ink-1"
      >
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.label} · {profile.endpointLabel}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input
          aria-label="固定出口标签"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          className="h-8 rounded-[var(--r-md)] border border-[var(--line)] bg-[rgba(127,141,168,0.06)] px-2.5 text-[12px] text-ink-1"
        />
        <input
          aria-label="代理 URL"
          value={proxyUrl}
          onChange={(event) => setProxyUrl(event.target.value)}
          className="h-8 rounded-[var(--r-md)] border border-[var(--line)] bg-[rgba(127,141,168,0.06)] px-2.5 text-[12px] text-ink-1"
        />
        <input
          aria-label="新代理用户名"
          placeholder={selected.hasAuth ? "用户名（留空则保留）" : "用户名（可选）"}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="h-8 rounded-[var(--r-md)] border border-[var(--line)] bg-[rgba(127,141,168,0.06)] px-2.5 text-[12px] text-ink-1"
        />
        <input
          aria-label="新代理密码"
          type="password"
          placeholder={selected.hasAuth ? "密码（留空则保留）" : "密码（可选）"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-8 rounded-[var(--r-md)] border border-[var(--line)] bg-[rgba(127,141,168,0.06)] px-2.5 text-[12px] text-ink-1"
        />
      </div>
      {selected.hasAuth && (
        <label className="inline-flex items-center gap-2 text-[11.5px] text-ink-2">
          <input
            type="checkbox"
            checked={clearAuth}
            onChange={(event) => setClearAuth(event.target.checked)}
          />
          清除已保存的代理认证
        </label>
      )}
      <p className="text-[11px] text-ink-3">
        修改影响所有复用此出口的凭据；认证留空则保留现有值。
      </p>
      <div className="flex gap-2">
        <Button
          className="btn btn-accent"
          isDisabled={busy || !label.trim() || !proxyUrl.trim()}
          onPress={async () => {
            setBusy(true);
            onError(null);
            try {
              onChange(
                await quotaClient.updateNetworkProfile({
                  id: selected.id,
                  label,
                  proxyUrl,
                  username: username.trim() || undefined,
                  password: password || undefined,
                  clearAuth,
                }),
              );
            } catch (reason) {
              onError(commandErrorMessage(reason));
            } finally {
              setBusy(false);
            }
          }}
        >
          保存出口
        </Button>
        <Button
          className="btn btn-outline"
          isDisabled={busy}
          onPress={async () => {
            setBusy(true);
            onError(null);
            try {
              const next = await quotaClient.deleteNetworkProfile(selected.id);
              onChange(next);
              setSelectedId(next[0]?.id ?? "");
            } catch (reason) {
              onError(commandErrorMessage(reason));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Trash2 size={13} />
          删除未使用出口
        </Button>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <GlassSurface radius={18} className="settings-section flex flex-col">
      <div className="section-heading px-4 py-3 flex items-center gap-2.5 border-b border-[var(--line)]">
        <span className="section-icon text-ink-3">{icon}</span>
        <h3 className="text-[13px] font-semibold text-ink-1">{title}</h3>
      </div>
      <div className="flex flex-col">{children}</div>
    </GlassSurface>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between gap-4 border-b border-[var(--line)] last:border-b-0">
      <div className="min-w-0">
        <div className="text-[12.5px] text-ink-1">{label}</div>
        {hint && <div className="text-[11px] text-ink-3 mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span className="toggle-track w-9 h-5 rounded-full transition-colors" />
      <span className="toggle-thumb absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" />
    </label>
  );
}

function ThresholdField({
  label,
  value,
  tone,
  onCommit,
}: {
  label: string;
  value: number;
  tone: "warn" | "high" | "crit";
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const color =
    tone === "warn" ? "var(--warn)" : tone === "high" ? "var(--high)" : "var(--crit)";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] flex items-center gap-1.5" style={{ color }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={draft}
          min={0}
          max={100}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            const parsed = Number(draft);
            if (Number.isFinite(parsed)) onCommit(parsed);
            else setDraft(String(value));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="tnum w-14 h-7 px-2 rounded-[var(--r-sm)] text-[13px] text-ink-1 bg-[rgba(127,141,168,0.06)] border border-[var(--line)] outline-none focus:border-[var(--accent)]"
        />
        <span className="text-[11px] text-ink-3">%</span>
      </div>
    </div>
  );
}

function ProviderHealthTable({
  health,
  now,
}: {
  health: ProviderHealthView[];
  now: number;
}) {
  const circuitLabel: Record<ProviderHealthView["circuitState"], string> = {
    closed: "正常",
    "half-open": "半开",
    open: "熔断",
  };
  const circuitColor: Record<ProviderHealthView["circuitState"], string> = {
    closed: "var(--ok)",
    "half-open": "var(--warn)",
    open: "var(--crit)",
  };
  return (
    <div className="px-4 py-2 overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-ink-3 text-[11px] text-left">
            <th className="font-normal py-1.5">供应商</th>
            <th className="font-normal">状态</th>
            <th className="font-normal">失败</th>
            <th className="font-normal text-right">最后成功</th>
          </tr>
        </thead>
        <tbody>
          {health.map((item) => (
            <tr key={item.provider} className="border-t border-[var(--line)]">
              <td className="py-2 text-ink-1">{item.providerName}</td>
              <td>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: circuitColor[item.circuitState] }}
                  />
                  {circuitLabel[item.circuitState]}
                </span>
              </td>
              <td className="tnum text-ink-2">{item.consecutiveFailures}</td>
              <td className="text-ink-3 text-right">
                {formatRelativePast(item.lastSuccessAt, now)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
