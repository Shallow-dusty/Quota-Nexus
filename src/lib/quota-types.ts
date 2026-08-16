/**
 * 前端视图模型（DESIGN.md §2、§3、§8）。
 * 只承载 Rust Core 脱敏 DTO 的展示形态；秘密、代理端点、完整 Workspace ID
 * 不在此层出现。浏览器预览（非 Tauri 运行时）由脱敏样本驱动。
 */

export type ProviderKind = "clinepass" | "opencode-go" | "ollama-cloud";

/** 窗口健康档位：由 Rust Core 按用户阈值计算下发（normal/warning/high/critical） */
export type WindowTone = "normal" | "warning" | "high" | "critical";

/** 账号健康档位：窗口档位外加陈旧（数据状态，非阈值结果） */
export type HealthTone = WindowTone | "stale";

export type DataState =
  | "initial-loading"
  | "ready"
  | "refreshing"
  | "stale-with-error"
  | "paused"
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
  /** Core 按用户阈值计算的档位；前端不得自行用百分比比较阈值 */
  tone: WindowTone;
  /** ISO8601；null 表示上游未提供，UI 必须显示"重置时间未知"（DESIGN §8） */
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
  /** 可编辑回填用的结构化代理 URL（scheme://host:port） */
  proxyUrl: string;
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

export interface HistoryPointView {
  accountId: string;
  provider: ProviderKind;
  accountLabel: string;
  windowKind: WindowKind;
  windowLabel: string;
  usedPercent: number;
  observedAt: string;
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
  notifyQuota: boolean;
}
