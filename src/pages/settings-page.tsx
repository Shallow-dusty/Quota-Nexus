import {
  Bell,
  Eye,
  History,
  LayoutGrid,
  MonitorSmartphone,
  Palette,
  ShieldCheck,
  Timer,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { commandErrorMessage, quotaClient } from "../lib/quota-client";
import { formatRelativePast } from "../lib/format";
import type {
  AppSettingsView,
  ProviderHealthView,
  ThemePreference,
} from "../lib/quota-types";
import { useNow } from "../lib/use-now";
import { PageHeader } from "../components/shell/app-shell";
import { StableSurface } from "../components/ui/surface";
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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([quotaClient.getSettings(), quotaClient.getProviderHealth()])
      .then(([nextSettings, nextHealth]) => {
        if (!active) return;
        setSettings(nextSettings);
        setHealth(nextHealth);
        onPrivacyChange?.(nextSettings.privacyMode);
      })
      .catch((reason) => active && setError(commandErrorMessage(reason)));
    return () => {
      active = false;
    };
  }, [onPrivacyChange]);

  async function save(patch: Partial<AppSettingsView>) {
    if (!settings || saving) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    setError(null);
    try {
      const stored = await quotaClient.updateSettings(next);
      setSettings(stored);
      if ("privacyMode" in patch) onPrivacyChange?.(stored.privacyMode);
      setHealth(await quotaClient.getProviderHealth());
    } catch (reason) {
      setSettings(settings);
      setError(commandErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="设置"
        subtitle={saving ? "正在保存…" : "刷新周期、通知、隐私、外观与诊断"}
      />
      <div className="page-scroll settings-page flex-1 overflow-y-auto px-7 py-5">
        {error && (
          <StableSurface className="mb-4 px-4 py-3 text-[11.5px] text-[var(--danger)]">
            {error}
          </StableSurface>
        )}
        <div className="settings-grid max-w-[920px] grid grid-cols-2 gap-4">
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
            <Row label="秘密不进入 SQLite、日志或导出">
              <span className="text-[11px] text-[var(--ok)] inline-flex items-center gap-1">
                <Eye size={12} /> 已启用
              </span>
            </Row>
          </Section>

          <Section icon={<LayoutGrid size={15} />} title="诊断">
            <ProviderHealthTable health={health} now={now} />
          </Section>
        </div>
      </div>
    </>
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
    <StableSurface className="settings-section flex flex-col">
      <div className="section-heading px-4 py-3 flex items-center gap-2.5 border-b border-[var(--line)]">
        <span className="section-icon text-ink-3">{icon}</span>
        <h3 className="text-[13px] font-semibold text-ink-1">{title}</h3>
      </div>
      <div className="flex flex-col">{children}</div>
    </StableSurface>
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
          value={value}
          min={0}
          max={100}
          onChange={(event) => onCommit(Number(event.target.value))}
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
