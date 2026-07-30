import { describe, expect, it } from "vitest";
import {
  THRESHOLD_CRITICAL,
  THRESHOLD_HIGH,
  THRESHOLD_WARNING,
  attentionWindowCount,
  clampPercent,
  healthyAccountCount,
  highestWindow,
  remainingPercent,
  sortByRisk,
  toneForAccount,
  toneForPercent,
} from "./quota-logic";
import type { ServiceQuotaView } from "./quota-types";

const account = (over: Partial<ServiceQuotaView>): ServiceQuotaView => ({
  id: "a",
  provider: "clinepass",
  providerName: "Cline Pass",
  accountLabel: "A",
  state: "ready",
  freshness: "fresh",
  lastSuccessAt: null,
  windows: [],
  ...over,
});

describe("百分比与剩余", () => {
  it("夹紧到 0–100", () => {
    expect(clampPercent(-3)).toBe(0);
    expect(clampPercent(42)).toBe(42);
    expect(clampPercent(120)).toBe(100);
  });

  it("剩余 = 100 − 已用（边界计算在 UI 输出层）", () => {
    expect(remainingPercent(84)).toBe(16);
    expect(remainingPercent(0)).toBe(100);
    expect(remainingPercent(120)).toBe(0);
  });
});

describe("健康档位（DESIGN §10.1 三级阈值）", () => {
  it("低于 Warning 为 normal", () => {
    expect(toneForPercent(69.9)).toBe("normal");
  });
  it("≥70 为 warning", () => {
    expect(toneForPercent(THRESHOLD_WARNING)).toBe("warning");
  });
  it("≥85 为 high", () => {
    expect(toneForPercent(THRESHOLD_HIGH)).toBe("high");
    expect(toneForPercent(90)).toBe("high");
  });
  it("≥95 为 critical", () => {
    expect(toneForPercent(THRESHOLD_CRITICAL)).toBe("critical");
  });
});

describe("账号健康与排序", () => {
  it("取最高档位，且 stale-with-error 优先为陈旧", () => {
    expect(
      toneForAccount(
        account({
          state: "ready",
          windows: [
            { id: "w", kind: "monthly", label: "M", usedPercent: 30, resetsAt: null },
            { id: "w2", kind: "weekly", label: "W", usedPercent: 99, resetsAt: null },
          ],
        }),
      ),
    ).toBe("critical");

    expect(toneForAccount(account({ state: "stale-with-error" }))).toBe("stale");
  });

  it("最高风险窗口不来自陈旧账号", () => {
    const accounts = [
      account({ id: "stale", state: "stale-with-error", windows: [
        { id: "w", kind: "monthly", label: "M", usedPercent: 99, resetsAt: null },
      ] }),
      account({ id: "ok", windows: [
        { id: "w", kind: "weekly", label: "W", usedPercent: 72, resetsAt: null },
      ] }),
    ];
    expect(highestWindow(accounts)?.account.id).toBe("ok");
  });

  it("按风险排序：critical 在 warning 之前", () => {
    const accounts = [
      account({ id: "warn", windows: [
        { id: "w", kind: "weekly", label: "W", usedPercent: 72, resetsAt: null },
      ] }),
      account({ id: "crit", windows: [
        { id: "w", kind: "monthly", label: "M", usedPercent: 99, resetsAt: null },
      ] }),
    ];
    expect(sortByRisk(accounts).map((a) => a.id)).toEqual(["crit", "warn"]);
  });
});

describe("摘要统计", () => {
  it("需关注窗口数与正常账号数", () => {
    const accounts = [
      account({ id: "ok", windows: [
        { id: "w", kind: "weekly", label: "W", usedPercent: 40, resetsAt: null },
      ] }),
      account({ id: "warn", windows: [
        { id: "w", kind: "weekly", label: "W", usedPercent: 72, resetsAt: null },
      ] }),
      account({ id: "stale", state: "stale-with-error", windows: [
        { id: "w", kind: "weekly", label: "W", usedPercent: 99, resetsAt: null },
      ] }),
    ];
    expect(attentionWindowCount(accounts)).toBe(1);
    expect(healthyAccountCount(accounts)).toBe(1);
  });
});