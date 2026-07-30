import { ArrowDownWideNarrow, Plus, RefreshCw } from "lucide-react";
import { Button } from "react-aria-components";
import { useEffect, useMemo, useState } from "react";
import { phase0Connections } from "../data/phase0-fixtures";
import { quotaClient } from "../lib/quota-client";
import { sortByRisk } from "../lib/quota-logic";
import type { PageId, ServiceQuotaView } from "../lib/quota-types";
import { PageHeader } from "../components/shell/app-shell";
import { SegmentedControl } from "../components/ui/segmented";
import { SkeletonCard } from "../components/ui/skeleton";
import { ServiceQuotaCard } from "../components/quota/service-quota-card";
import { SummaryStrip } from "../components/quota/summary-strip";

type Filter = "all" | "attention" | "stale";

export function OverviewPage({
  onPageChange,
}: {
  onPageChange: (page: PageId) => void;
}) {
  const [accounts, setAccounts] = useState<ServiceQuotaView[] | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cardRefreshing, setCardRefreshing] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  // 首屏一次性加载（静态阶段；接入 Tauri 后由 TanStack Query 承载）
  useEffect(() => {
    let cancelled = false;
    void quotaClient.getOverview().then((data) => {
      if (cancelled) return;
      setAccounts(data.accounts);
      setRefreshedAt(data.refreshedAt);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    if (!accounts) return [];
    const filtered = accounts.filter((a) => {
      if (filter === "attention") return a.state !== "stale-with-error";
      if (filter === "stale") return a.state === "stale-with-error";
      return true;
    });
    return sortByRisk(filtered);
  }, [accounts, filter]);

  async function refreshAll() {
    setRefreshing(true);
    try {
      const data = await quotaClient.refreshAll();
      setAccounts(data.accounts);
      setRefreshedAt(data.refreshedAt);
    } finally {
      setRefreshing(false);
    }
  }

  async function refreshAccount(id: string) {
    setCardRefreshing(id);
    try {
      const data = await quotaClient.refreshAccount(id);
      setAccounts(data.accounts);
      setRefreshedAt(data.refreshedAt);
    } finally {
      setCardRefreshing(null);
    }
  }

  return (
    <>
      <PageHeader
        title="概览"
        subtitle="全部账号的额度窗口、重置时间与健康状态"
        actions={
          <>
            <SegmentedControl
              value={filter}
              onChange={setFilter}
              options={[
                { id: "all", label: "全部" },
                { id: "attention", label: "需关注" },
                { id: "stale", label: "陈旧" },
              ]}
            />
            <Button className="btn btn-outline" onPress={() => refreshAll()} isDisabled={refreshing}>
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              <span>全部刷新</span>
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {accounts && (
          <div className="mb-4">
            <SummaryStrip accounts={accounts} refreshedAt={refreshedAt} />
          </div>
        )}

        {!accounts ? (
          <Grid>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </Grid>
        ) : visible.length === 0 ? (
          <EmptyOverview onPageChange={onPageChange} />
        ) : (
          <Grid>
            {visible.map((account) => (
              <ServiceQuotaCard
                key={account.id}
                account={account}
                refreshing={cardRefreshing === account.id}
                onRefresh={refreshAccount}
                onMore={onMore}
              />
            ))}
          </Grid>
        )}

        <div className="mt-4 text-[11px] text-ink-3">
          已连接 {phase0Connections.filter((c) => c.enabled).length}/
          {phase0Connections.length} 个账号 · 数据来源：Phase 0 脱敏样本
        </div>
      </div>
    </>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns:
          "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
      }}
    >
      {children}
    </div>
  );
}

function EmptyOverview({
  onPageChange,
}: {
  onPageChange: (page: PageId) => void;
}) {
  return (
    <div className="surface-stable p-10 flex flex-col items-center justify-center text-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-accent">
        <ArrowDownWideNarrow size={22} />
      </div>
      <div>
        <p className="text-ink-1 font-medium">还没有账号</p>
        <p className="text-[12.5px] text-ink-3 mt-1">
          添加第一个供应商账号，开始统一监控额度
        </p>
      </div>
      <Button
        className="btn btn-accent"
        onPress={() => onPageChange("accounts")}
      >
        <Plus size={14} />
        添加账号
      </Button>
    </div>
  );
}

function onMore(_id: string) {
  // 静态阶段：更多操作入口占位（更新凭据/暂停/删除等在 Phase 1 后端接入后实现）
}