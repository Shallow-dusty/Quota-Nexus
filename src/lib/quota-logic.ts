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

/** 卡片排序：最危险状态优先（DESIGN §8），同档按最高使用率降序 */
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
