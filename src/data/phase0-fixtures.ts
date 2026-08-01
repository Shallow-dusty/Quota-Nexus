import type {
  AccountConnectionView,
  OverviewView,
  ProviderHealthView,
  ServiceQuotaView,
} from "../lib/quota-types";

/**
 * Phase 0 脱敏样本驱动的前端静态矩阵。
 *
 * - 前三家账号的百分比与重置语义均来自 Phase 0 真实探针快照
 *   （docs/provider-contracts/snapshots/*-20260730T09*.json）。
 * - 后两个账号为状态矩阵覆盖用的演示样本（OpenCode 共享凭据的第二个工作区、
 *   Ollama 旧 Free 账号认证失效），使用合理的合成值，已在 source 标注。
 * - resetsAt 一律在模块加载时相对 now 现算，保证倒计时始终存活。
 */
const NOW = Date.now();
const iso = (offsetSec: number) =>
  new Date(NOW + offsetSec * 1000).toISOString();

const clineMain: ServiceQuotaView = {
  id: "cline-main",
  provider: "clinepass",
  providerName: "Cline Pass",
  accountLabel: "主账号",
  plan: "Pro",
  state: "ready",
  freshness: "fresh",
  lastSuccessAt: new Date(NOW - 3 * 60_000).toISOString(),
  windows: [
    { id: "five-hour", kind: "rolling_5h", label: "5 小时", usedPercent: 0, tone: "normal", resetsAt: iso(5 * 3600) },
    { id: "weekly", kind: "weekly", label: "周额度", usedPercent: 0, tone: "normal", resetsAt: iso(3 * 86400) },
    { id: "monthly", kind: "monthly", label: "月额度", usedPercent: 99, tone: "critical", resetsAt: iso(11 * 86400) },
  ],
};

const opencodeB: ServiceQuotaView = {
  id: "opencode-b",
  provider: "opencode-go",
  providerName: "OpenCode Go",
  accountLabel: "工作区 B",
  state: "ready",
  freshness: "fresh",
  lastSuccessAt: new Date(NOW - 2 * 60_000).toISOString(),
  windows: [
    { id: "rolling", kind: "rolling_5h", label: "5 小时", usedPercent: 0, tone: "normal", resetsAt: iso(18000) },
    { id: "weekly", kind: "weekly", label: "周额度", usedPercent: 86, tone: "high", resetsAt: iso(310816) },
    { id: "monthly", kind: "monthly", label: "月额度", usedPercent: 44, tone: "normal", resetsAt: iso(1797923) },
  ],
};

// 与 opencodeB 共享同一 OpenCode Cookie（DESIGN §3 N:1），演示凭据复用
const opencodeA: ServiceQuotaView = {
  id: "opencode-a",
  provider: "opencode-go",
  providerName: "OpenCode Go",
  accountLabel: "工作区 A",
  state: "ready",
  freshness: "fresh",
  lastSuccessAt: new Date(NOW - 2 * 60_000).toISOString(),
  windows: [
    { id: "rolling", kind: "rolling_5h", label: "5 小时", usedPercent: 12, tone: "normal", resetsAt: iso(15840) },
    { id: "weekly", kind: "weekly", label: "周额度", usedPercent: 72, tone: "warning", resetsAt: iso(284400) },
    { id: "monthly", kind: "monthly", label: "月额度", usedPercent: 30, tone: "normal", resetsAt: iso(1640000) },
  ],
};

const ollamaPro: ServiceQuotaView = {
  id: "ollama-pro",
  provider: "ollama-cloud",
  providerName: "Ollama Cloud",
  accountLabel: "Pro 账号",
  plan: "Pro",
  state: "ready",
  freshness: "fresh",
  lastSuccessAt: new Date(NOW - 4 * 60_000).toISOString(),
  windows: [
    { id: "session", kind: "session", label: "Session", usedPercent: 0.6, tone: "normal", resetsAt: iso(4 * 3600) },
    { id: "weekly", kind: "weekly", label: "Weekly", usedPercent: 48.3, tone: "normal", resetsAt: iso(3.4 * 86400) },
  ],
};

// 状态矩阵：认证失效，保留最后成功数据（DESIGN §3、§8 stale-with-error）
const ollamaFreeStale: ServiceQuotaView = {
  id: "ollama-free-stale",
  provider: "ollama-cloud",
  providerName: "Ollama Cloud",
  accountLabel: "Free 账号（旧）",
  plan: "Free",
  state: "stale-with-error",
  freshness: "stale",
  lastSuccessAt: new Date(NOW - 2 * 3600_000).toISOString(),
  errorCategory: "auth",
  windows: [
    { id: "session", kind: "session", label: "Session", usedPercent: 33, tone: "normal", resetsAt: iso(2.2 * 3600) },
    { id: "weekly", kind: "weekly", label: "Weekly", usedPercent: 61, tone: "normal", resetsAt: iso(1.8 * 86400) },
  ],
};

export const phase0Overview: OverviewView = {
  accounts: [clineMain, opencodeB, opencodeA, ollamaPro, ollamaFreeStale],
  refreshedAt: new Date(NOW - 3 * 60_000).toISOString(),
  source: "phase0-fixture",
};

/** 账号与连接页样本 */
export const phase0Connections: AccountConnectionView[] = [
  {
    id: "cline-main",
    provider: "clinepass",
    providerName: "Cline Pass",
    accountLabel: "主账号",
    credentialLabel: "Cline Pass · 主 Key",
    credentialId: "fixture-cline",
    sharedAccountCount: 1,
    routeModeLabel: "默认 TUN",
    state: "ready",
    freshness: "fresh",
    lastSuccessAt: new Date(NOW - 3 * 60_000).toISOString(),
    nextRefreshAt: new Date(NOW + 12 * 60_000).toISOString(),
    nextAttemptAt: null,
    effectiveRefreshMinutes: 15,
    consecutiveFailures: 0,
    authPaused: false,
    enabled: true,
  },
  {
    id: "opencode-b",
    provider: "opencode-go",
    providerName: "OpenCode Go",
    accountLabel: "工作区 B",
    scopeLabel: "wrk_••••",
    credentialLabel: "OpenCode · 主 Cookie",
    credentialId: "fixture-opencode",
    sharedAccountCount: 2,
    routeModeLabel: "固定代理 · 登录出口",
    state: "ready",
    freshness: "fresh",
    lastSuccessAt: new Date(NOW - 2 * 60_000).toISOString(),
    nextRefreshAt: new Date(NOW + 13 * 60_000).toISOString(),
    nextAttemptAt: null,
    effectiveRefreshMinutes: 15,
    consecutiveFailures: 0,
    authPaused: false,
    enabled: true,
  },
  {
    id: "opencode-a",
    provider: "opencode-go",
    providerName: "OpenCode Go",
    accountLabel: "工作区 A",
    scopeLabel: "wrk_••••",
    credentialLabel: "OpenCode · 主 Cookie",
    credentialId: "fixture-opencode",
    sharedAccountCount: 2,
    routeModeLabel: "固定代理 · 登录出口",
    state: "ready",
    freshness: "fresh",
    lastSuccessAt: new Date(NOW - 2 * 60_000).toISOString(),
    nextRefreshAt: new Date(NOW + 13 * 60_000).toISOString(),
    nextAttemptAt: null,
    effectiveRefreshMinutes: 15,
    consecutiveFailures: 0,
    authPaused: false,
    enabled: true,
  },
  {
    id: "ollama-pro",
    provider: "ollama-cloud",
    providerName: "Ollama Cloud",
    accountLabel: "Pro 账号",
    credentialLabel: "Ollama · Pro Cookie",
    credentialId: "fixture-ollama-pro",
    sharedAccountCount: 1,
    routeModeLabel: "固定代理 · 登录出口",
    state: "ready",
    freshness: "fresh",
    lastSuccessAt: new Date(NOW - 4 * 60_000).toISOString(),
    nextRefreshAt: new Date(NOW + 11 * 60_000).toISOString(),
    nextAttemptAt: null,
    effectiveRefreshMinutes: 15,
    consecutiveFailures: 0,
    authPaused: false,
    enabled: true,
  },
  {
    id: "ollama-free-stale",
    provider: "ollama-cloud",
    providerName: "Ollama Cloud",
    accountLabel: "Free 账号（旧）",
    plan: "Free",
    credentialLabel: "Ollama · Free Cookie",
    credentialId: "fixture-ollama-free",
    sharedAccountCount: 1,
    routeModeLabel: "默认 TUN",
    state: "stale-with-error",
    freshness: "stale",
    lastSuccessAt: new Date(NOW - 2 * 3600_000).toISOString(),
    nextRefreshAt: null,
    nextAttemptAt: null,
    effectiveRefreshMinutes: null,
    consecutiveFailures: 1,
    authPaused: true,
    enabled: false,
    errorCategory: "auth",
  },
];

/** 诊断区样本（DESIGN §6.1 Settings 内嵌） */
export const phase0ProviderHealth: ProviderHealthView[] = [
  {
    provider: "clinepass",
    providerName: "Cline Pass",
    circuitState: "closed",
    lastSuccessAt: new Date(NOW - 3 * 60_000).toISOString(),
    nextProbeAt: new Date(NOW + 12 * 60_000).toISOString(),
    consecutiveFailures: 0,
  },
  {
    provider: "opencode-go",
    providerName: "OpenCode Go",
    circuitState: "closed",
    lastSuccessAt: new Date(NOW - 2 * 60_000).toISOString(),
    nextProbeAt: new Date(NOW + 13 * 60_000).toISOString(),
    consecutiveFailures: 0,
  },
  {
    provider: "ollama-cloud",
    providerName: "Ollama Cloud",
    circuitState: "half-open",
    lastSuccessAt: new Date(NOW - 4 * 60_000).toISOString(),
    nextProbeAt: new Date(NOW + 26 * 60_000).toISOString(),
    consecutiveFailures: 2,
  },
];
