import { Bell, Eye, History, LayoutGrid, MonitorSmartphone, Palette, ShieldCheck, Timer } from "lucide-react";
import type { ReactNode } from "react";
import { phase0ProviderHealth } from "../data/phase0-fixtures";
import { formatRelativePast } from "../lib/format";
import { THRESHOLD_CRITICAL, THRESHOLD_HIGH, THRESHOLD_WARNING } from "../lib/quota-logic";
import type { ProviderHealthView, ThemePreference } from "../lib/quota-types";
import { useNow } from "../lib/use-now";
import { PageHeader } from "../components/shell/app-shell";
import { StableSurface } from "../components/ui/surface";
import { SegmentedControl } from "../components/ui/segmented";

interface SettingsProps {
  theme: ThemePreference;
  onThemeChange: (t: ThemePreference) => void;
  transparencyOff: boolean;
  onTransparencyChange: (off: boolean) => void;
}

export function SettingsPage({
  theme,
  onThemeChange,
  transparencyOff,
  onTransparencyChange,
}: SettingsProps) {
  const now = useNow();
  return (
    <>
      <PageHeader
        title="设置"
        subtitle="刷新周期、通知、隐私、外观与诊断"
      />
      <div className="page-scroll settings-page flex-1 overflow-y-auto px-7 py-5">
        <div className="settings-grid max-w-[920px] grid grid-cols-2 gap-4">
          <Section icon={<Timer size={15} />} title="刷新">
            <Row label="刷新周期">
              <SegmentedControl
                value="15"
                onChange={() => {}}
                options={[
                  { id: "manual", label: "手动" },
                  { id: "5", label: "5 分钟" },
                  { id: "15", label: "15 分钟" },
                  { id: "30", label: "30 分钟" },
                ]}
              />
            </Row>
            <Row label="达到 Warning 提速至 5 分钟" hint="任一窗口 ≥ 70% 时自动缩短周期">
              <Toggle defaultOn />
            </Row>
          </Section>

          <Section icon={<MonitorSmartphone size={15} />} title="系统">
            <Row label="托盘运行" hint="关闭窗口后驻留后台">
              <Toggle defaultOn />
            </Row>
            <Row label="开机自启" hint="默认关闭">
              <Toggle />
            </Row>
          </Section>

          <Section icon={<Bell size={15} />} title="通知阈值">
            <div className="grid grid-cols-3 gap-3 px-4 py-3">
              <ThresholdField label="Warning" value={THRESHOLD_WARNING} tone="warn" />
              <ThresholdField label="High" value={THRESHOLD_HIGH} tone="high" />
              <ThresholdField label="Critical" value={THRESHOLD_CRITICAL} tone="crit" />
            </div>
            <Row label="认证失效通知" hint="首次检测时通知，之后每 24 小时最多一次">
              <Toggle defaultOn />
            </Row>
            <Row label="数据陈旧通知" hint="连续 3 次失败且超过 30 分钟">
              <Toggle defaultOn />
            </Row>
            <Row label="恢复通知">
              <Toggle />
            </Row>
          </Section>

          <Section icon={<History size={15} />} title="历史保留">
            <Row label="历史保留时长">
              <SegmentedControl
                value="30"
                onChange={() => {}}
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
            <Row label="透明效果" hint="关闭后所有表面回退为实色（GlassFallback）">
              <Toggle
                defaultOn={!transparencyOff}
                onChange={(v) => onTransparencyChange(!v)}
              />
            </Row>
          </Section>

          <Section icon={<ShieldCheck size={15} />} title="隐私">
            <Row label="截图隐私模式" hint="隐藏账号标签与外部 ID">
              <Toggle />
            </Row>
            <Row label="默认不展示邮箱与组织名">
              <Toggle defaultOn />
            </Row>
          </Section>

          <Section icon={<LayoutGrid size={15} />} title="诊断">
            <ProviderHealthTable health={phase0ProviderHealth} now={now} />
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
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

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
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

function Toggle({ defaultOn = false, onChange }: { defaultOn?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        defaultChecked={defaultOn}
        onChange={(e) => onChange?.(e.target.checked)}
        className="peer sr-only"
      />
      <span
        className="toggle-track w-9 h-5 rounded-full transition-colors"
      />
      <span className="toggle-thumb absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" />
    </label>
  );
}

function ThresholdField({ label, value, tone }: { label: string; value: number; tone: "warn" | "high" | "crit" }) {
  const color = tone === "warn" ? "var(--warn)" : tone === "high" ? "var(--high)" : "var(--crit)";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] flex items-center gap-1.5" style={{ color }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          defaultValue={value}
          min={0}
          max={100}
          className="tnum w-14 h-7 px-2 rounded-[var(--r-sm)] text-[13px] text-ink-1 bg-[rgba(127,141,168,0.06)] border border-[var(--line)] outline-none focus:border-[var(--accent)]"
        />
        <span className="text-[11px] text-ink-3">% 已用</span>
      </div>
    </div>
  );
}

function ProviderHealthTable({ health, now }: { health: ProviderHealthView[]; now: number }) {
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
    <div className="px-4 py-2">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-ink-3 text-[11px] text-left">
            <th className="font-normal py-1.5">供应商</th>
            <th className="font-normal">熔断状态</th>
            <th className="font-normal">连续失败</th>
            <th className="font-normal">最后成功</th>
            <th className="font-normal text-right">下次探测</th>
          </tr>
        </thead>
        <tbody>
          {health.map((h) => (
            <tr key={h.provider} className="border-t border-[var(--line)]">
              <td className="py-2 text-ink-1">{h.providerName}</td>
              <td>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: circuitColor[h.circuitState] }} />
                  {circuitLabel[h.circuitState]}
                </span>
              </td>
              <td className="tnum text-ink-2">{h.consecutiveFailures}</td>
              <td className="text-ink-3">{formatRelativePast(h.lastSuccessAt, now)}</td>
              <td className="tnum text-ink-3 text-right">
                {h.nextProbeAt ? formatRelativePast(h.nextProbeAt, now) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
