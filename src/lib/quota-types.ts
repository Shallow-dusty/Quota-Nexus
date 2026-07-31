/**
 * 前端视图模型（DESIGN.md §6.1、§8）。
 * 只承载 Rust Core 脱敏 DTO 的展示形态；秘密、代理端点、完整 Workspace ID
 * 不在此层出现。Phase 1 静态阶段由 Phase 0 脱敏样本驱动。
 */

export type ProviderKind = "clinepass" | "opencode-go" | "ollama-cloud";

/** 健康档位：与 §10.1 告警三级（Warning 70 / High 85 / Critical 95）对齐，外加陈旧 */
export type HealthTone = "normal" | "warning" | "high" | "critical" | "stale";

export type DataState =
  | "initial-loading"
  | "ready"
  | "refreshing"
  | "stale-with-error"
  | "empty";

export type WindowKind =
  | "session"
  | "rolling_5h"
  | "weekly"
  | "monthly"
  | "unknown";

export interface QuotaWindowView {
  id: string;
  kind: WindowKind;
  label: string;
  usedPercent: number;
  /** ISO8601；null 表示上游未提供，UI 必须显示"重置时间未知"（§8.3） */
  resetsAt: string | null;
}

export type ErrorCategory = "auth" | "network" | "parser" | "proxy";

export interface ServiceQuotaView {
  id: string;
  provider: ProviderKind;
  providerName: string;
  accountLabel: string;
  plan?: string;
  state: DataState;
  freshness: "fresh" | "stale";
  lastSuccessAt: string | null;
  errorCategory?: ErrorCategory;
  windows: QuotaWindowView[];
}

export interface OverviewView {
  accounts: ServiceQuotaView[];
  refreshedAt: string | null;
  source: "phase0-fixture" | "tauri";
}

export type PageId = "overview" | "accounts" | "settings";

export type ThemePreference = "system" | "light" | "dark";

/** 账号与连接页的连接视图（静态矩阵阶段由样本驱动） */
export interface AccountConnectionView {
  id: string;
  provider: ProviderKind;
  providerName: string;
  accountLabel: string;
  plan?: string;
  scopeLabel?: string;
  credentialLabel: string;
  credentialId: string;
  sharedAccountCount: number;
  routeModeLabel: string;
  state: DataState;
  freshness: "fresh" | "stale";
  lastSuccessAt: string | null;
  nextRefreshAt: string | null;
  nextAttemptAt: string | null;
  effectiveRefreshMinutes: number | null;
  consecutiveFailures: number;
  authPaused: boolean;
  enabled: boolean;
  errorCategory?: ErrorCategory;
}

export interface ProviderHealthView {
  provider: ProviderKind;
  providerName: string;
  circuitState: "closed" | "open" | "half-open";
  lastSuccessAt: string | null;
  nextProbeAt: string | null;
  consecutiveFailures: number;
}

/** 固定出口只向 UI 暴露脱敏端点；认证材料仍留在 Windows Credential Manager。 */
export interface NetworkProfileView {
  id: string;
  label: string;
  endpointLabel: string;
  hasAuth: boolean;
}

export interface CredentialOptionView {
  id: string;
  provider: ProviderKind;
  label: string;
  sharedAccountCount: number;
  routeModeLabel: string;
  lastValidatedAt: string | null;
}

export interface AppSettingsView {
  refreshIntervalMinutes: 5 | 15 | 30 | null;
  adaptiveRefresh: boolean;
  warningThreshold: number;
  highThreshold: number;
  criticalThreshold: number;
  historyDays: 7 | 30 | 90 | null;
  trayEnabled: boolean;
  autostartEnabled: boolean;
  privacyMode: boolean;
  notifyAuth: boolean;
  notifyStale: boolean;
  notifyRecovery: boolean;
}
