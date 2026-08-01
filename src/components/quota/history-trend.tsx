import { useEffect, useMemo, useState } from "react";
import { commandErrorMessage, quotaClient } from "../../lib/quota-client";
import type { HistoryPointView } from "../../lib/quota-types";
import { SegmentedControl } from "../ui/segmented";

type HistoryDays = 7 | 30 | 90;

/** 单账号额度趋势（详情抽屉内）：本机历史快照折线，按窗口类型分组。 */
export function AccountTrend({ accountId }: { accountId: string }) {
  const [days, setDays] = useState<HistoryDays>(30);
  const [points, setPoints] = useState<HistoryPointView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPoints(null);
    setError(null);
    void quotaClient
      .getHistory(days)
      .then((data) => {
        if (!active) return;
        setPoints(data.filter((point) => point.accountId === accountId));
      })
      .catch((reason) => active && setError(commandErrorMessage(reason)));
    return () => {
      active = false;
    };
  }, [days, accountId]);

  return (
    <section aria-label="额度趋势">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-[13px] font-semibold text-ink-1">额度趋势</h3>
        <SegmentedControl
          value={String(days)}
          onChange={(value) => setDays(Number(value) as HistoryDays)}
          options={[
            { id: "7", label: "7 天" },
            { id: "30", label: "30 天" },
            { id: "90", label: "90 天" },
          ]}
        />
      </div>
      {error ? (
        <p className="py-8 text-center text-[12px] text-[var(--danger)]">{error}</p>
      ) : points === null ? (
        <p className="py-10 text-center text-[12px] text-ink-3">正在读取历史…</p>
      ) : points.length === 0 ? (
        <p className="py-10 text-center text-[12px] text-ink-3">所选范围暂无历史数据</p>
      ) : (
        <TrendPlot points={points} />
      )}
    </section>
  );
}

function TrendPlot({ points }: { points: HistoryPointView[] }) {
  const series = useMemo(() => {
    const grouped = new Map<string, HistoryPointView[]>();
    points.forEach((point) => {
      const current = grouped.get(point.windowKind) ?? [];
      current.push(point);
      grouped.set(point.windowKind, current);
    });
    return [...grouped.entries()];
  }, [points]);
  const timestamps = points.map((point) => Date.parse(point.observedAt));
  const minimum = Math.min(...timestamps);
  const maximum = Math.max(...timestamps);
  const span = Math.max(maximum - minimum, 1);
  const colors = ["var(--accent)", "var(--warn)", "var(--ok)", "var(--high)"];

  return (
    <div>
      <div className="h-[190px] rounded-[var(--r-md)] border border-[var(--line)] bg-[rgba(127,141,168,0.035)] p-3">
        <svg
          viewBox="0 0 800 180"
          className="h-full w-full"
          role="img"
          aria-label="所选账号各额度窗口的历史使用率折线图"
          preserveAspectRatio="none"
        >
          {[0, 25, 50, 75, 100].map((value) => (
            <g key={value}>
              <line
                x1="0"
                x2="800"
                y1={170 - value * 1.6}
                y2={170 - value * 1.6}
                stroke="var(--line)"
                strokeWidth="1"
              />
              <text x="4" y={165 - value * 1.6} fill="var(--ink-3)" fontSize="10">
                {value}%
              </text>
            </g>
          ))}
          {series.map(([kind, values], index) => {
            const coordinates = values
              .map((point) => {
                const x = ((Date.parse(point.observedAt) - minimum) / span) * 760 + 30;
                const y = 170 - point.usedPercent * 1.6;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join(" ");
            return (
              <polyline
                key={kind}
                points={coordinates}
                fill="none"
                stroke={colors[index % colors.length]}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {series.map(([kind, values], index) => {
          const latest = values[values.length - 1];
          return (
            <span key={kind} className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-2">
              <span
                className="h-0.5 w-4 rounded-full"
                style={{ background: colors[index % colors.length] }}
              />
              {latest.windowLabel}：{latest.usedPercent.toFixed(1)}%
            </span>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>额度趋势等效数据表</caption>
        <thead><tr><th>时间</th><th>窗口</th><th>已用百分比</th></tr></thead>
        <tbody>
          {points.map((point) => (
            <tr key={`${point.windowKind}-${point.observedAt}`}>
              <td>{point.observedAt}</td>
              <td>{point.windowLabel}</td>
              <td>{point.usedPercent}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
