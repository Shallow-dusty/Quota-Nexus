import { describe, expect, it } from "vitest";
import {
  clampPercent,
  remainingPercent,
  sortAccounts,
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

  it("按风险排序：critical 在 warning 之前", () => {
    const accounts = [
      account({ id: "warn", windows: [win(72, "warning")] }),
      account({ id: "crit", windows: [win(99, "critical")] }),
    ];
    expect(sortByRisk(accounts).map((a) => a.id)).toEqual(["crit", "warn"]);
  });
});

describe("概览排序", () => {
  const accounts = [
    account({ id: "b-opencode", provider: "opencode-go", accountLabel: "乙", windows: [win(72, "warning")] }),
    account({ id: "a-cline", provider: "clinepass", accountLabel: "甲", windows: [win(99, "critical")] }),
    account({ id: "c-ollama", provider: "ollama-cloud", accountLabel: "丙", windows: [win(10, "normal")] }),
  ];

  it("risk：危险在前，与默认 sortByRisk 一致", () => {
    expect(sortAccounts(accounts, "risk").map((a) => a.id)).toEqual([
      "a-cline",
      "b-opencode",
      "c-ollama",
    ]);
  });

  it("name：按中文标签稳定排序", () => {
    expect(sortAccounts(accounts, "name").map((a) => a.id)).toEqual([
      "c-ollama",
      "a-cline",
      "b-opencode",
    ]);
  });

  it("provider：按供应商分组，组内按名称", () => {
    expect(sortAccounts(accounts, "provider").map((a) => a.id)).toEqual([
      "a-cline",
      "b-opencode",
      "c-ollama",
    ]);
  });
});
