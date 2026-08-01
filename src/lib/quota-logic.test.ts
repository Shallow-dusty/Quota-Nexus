import { describe, expect, it } from "vitest";
import {
  attentionWindowCount,
  clampPercent,
  healthyAccountCount,
  highestWindow,
  remainingPercent,
  sortByRisk,
  toneForAccount,
} from "./quota-logic";
import type { QuotaWindowView, ServiceQuotaView, WindowTone } from "./quota-types";

const win = (
  usedPercent: number,
  tone: WindowTone,
  over: Partial<QuotaWindowView> = {},
): QuotaWindowView => ({
  id: over.id ?? "w",
  kind: "weekly",
  label: "W",
  usedPercent,
  tone,
  resetsAt: null,
  ...over,
});

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

describe("账号健康与排序（档位由 Core 下发）", () => {
  it("取全部窗口中的最高档位，stale-with-error 优先为陈旧", () => {
    expect(
      toneForAccount(
        account({
          state: "ready",
          windows: [win(30, "normal"), win(99, "critical", { id: "w2" })],
        }),
      ),
    ).toBe("critical");

    expect(toneForAccount(account({ state: "stale-with-error" }))).toBe("stale");
  });

  it("最高风险窗口不来自陈旧账号", () => {
    const accounts = [
      account({
        id: "stale",
        state: "stale-with-error",
        windows: [win(99, "critical")],
      }),
      account({ id: "ok", windows: [win(72, "warning")] }),
    ];
    expect(highestWindow(accounts)?.account.id).toBe("ok");
  });

  it("按风险排序：critical 在 warning 之前", () => {
    const accounts = [
      account({ id: "warn", windows: [win(72, "warning")] }),
      account({ id: "crit", windows: [win(99, "critical")] }),
    ];
    expect(sortByRisk(accounts).map((a) => a.id)).toEqual(["crit", "warn"]);
  });
});

describe("摘要统计", () => {
  it("需关注窗口数与正常账号数", () => {
    const accounts = [
      account({ id: "ok", windows: [win(40, "normal")] }),
      account({ id: "warn", windows: [win(72, "warning")] }),
      account({
        id: "stale",
        state: "stale-with-error",
        windows: [win(99, "critical")],
      }),
    ];
    expect(attentionWindowCount(accounts)).toBe(1);
    expect(healthyAccountCount(accounts)).toBe(1);
  });
});
