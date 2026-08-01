import type {
  HealthTone,
  QuotaWindowView,
  ServiceQuotaView,
} from "./quota-types";

export function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

const TONE_RANK: Record<HealthTone, number> = {
  normal: 0,
  stale: 1,
  warning: 2,
  high: 3,
  critical: 4,
};

/** 账号健康 = 全部窗口中的最高档位（档位由 Core 下发）；陈旧/暂停状态直接标记 stale */
export function toneForAccount(account: ServiceQuotaView): HealthTone {
  if (account.state === "stale-with-error" || account.state === "paused") {
    return "stale";
  }
  return account.windows.reduce<HealthTone>((highest, window) => {
    return TONE_RANK[window.tone] > TONE_RANK[highest] ? window.tone : highest;
  }, "normal");
}

export function highestWindow(accounts: ServiceQuotaView[]): {
  account: ServiceQuotaView;
  window: QuotaWindowView;
} | null {
  const candidates = accounts
    .filter((a) => !["stale-with-error", "paused"].includes(a.state))
    .flatMap((account) =>
      account.windows.map((window) => ({ account, window })),
    );
  return (
    candidates.sort((a, b) => b.window.usedPercent - a.window.usedPercent)[0] ??
    null
  );
}

/** 需关注窗口数：档位达到 Warning 及以上的窗口（不含陈旧账号） */
export function attentionWindowCount(accounts: ServiceQuotaView[]): number {
  return accounts
    .filter((a) => !["stale-with-error", "paused"].includes(a.state))
    .flatMap((a) => a.windows)
    .filter((w) => w.tone !== "normal").length;
}

/** 健康账号数：无错误状态且最高窗口低于 Warning */
export function healthyAccountCount(accounts: ServiceQuotaView[]): number {
  return accounts.filter(
    (a) =>
      !["stale-with-error", "paused"].includes(a.state) &&
      toneForAccount(a) === "normal",
  ).length;
}

/** 最近一次重置：resetsAt 最早且未过期太多的窗口 */
export function nearestReset(accounts: ServiceQuotaView[]): {
  account: ServiceQuotaView;
  window: QuotaWindowView;
} | null {
  const now = Date.now();
  const candidates = accounts
    .flatMap((account) =>
      account.windows.map((window) => ({ account, window })),
    )
    .filter(({ window }) => {
      if (!window.resetsAt) return false;
      const t = Date.parse(window.resetsAt);
      return !Number.isNaN(t) && t > now - 60_000;
    });
  return (
    candidates.sort(
      (a, b) => Date.parse(a.window.resetsAt!) - Date.parse(b.window.resetsAt!),
    )[0] ?? null
  );
}

/** 卡片排序：最危险状态优先（§11.3），同档按最高使用率降序 */
export function sortByRisk(accounts: ServiceQuotaView[]): ServiceQuotaView[] {
  const maxUsed = (a: ServiceQuotaView) =>
    Math.max(...a.windows.map((w) => w.usedPercent), 0);
  return [...accounts].sort((a, b) => {
    const rankDiff = TONE_RANK[toneForAccount(b)] - TONE_RANK[toneForAccount(a)];
    if (rankDiff !== 0) return rankDiff;
    return maxUsed(b) - maxUsed(a);
  });
}

export type AccountSortMode = "risk" | "name" | "provider";

const PROVIDER_ORDER: Record<string, number> = {
  clinepass: 0,
  "opencode-go": 1,
  "ollama-cloud": 2,
};

const byLabel = (a: ServiceQuotaView, b: ServiceQuotaView) =>
  a.accountLabel.localeCompare(b.accountLabel, "zh-CN");

/**
 * 概览排序：risk = 风险优先（位置随状态跳动，危险总在前面）；
 * name/provider = 稳定排序（位置固定，便于肌肉记忆定位）。
 */
export function sortAccounts(
  accounts: ServiceQuotaView[],
  mode: AccountSortMode,
): ServiceQuotaView[] {
  if (mode === "name") return [...accounts].sort(byLabel);
  if (mode === "provider") {
    return [...accounts].sort(
      (a, b) =>
        (PROVIDER_ORDER[a.provider] ?? 99) - (PROVIDER_ORDER[b.provider] ?? 99) ||
        byLabel(a, b),
    );
  }
  return sortByRisk(accounts);
}

export function remainingPercent(usedPercent: number): number {
  return 100 - clampPercent(usedPercent);
}
