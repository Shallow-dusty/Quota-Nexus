import { Download, FilterX, Inbox, Plus, RefreshCw } from "lucide-react";
import { Button } from "react-aria-components";
import { useEffect, useMemo, useState } from "react";
import { commandErrorMessage, quotaClient } from "../lib/quota-client";
import { useToast } from "../components/ui/toast";
import { sortByRisk } from "../lib/quota-logic";
import type { PageId, ServiceQuotaView } from "../lib/quota-types";
import { PageHeader } from "../components/shell/app-shell";
import { SegmentedControl } from "../components/ui/segmented";
import { SkeletonCard } from "../components/ui/skeleton";
import { ServiceQuotaCard } from "../components/quota/service-quota-card";
import { SummaryStrip } from "../components/quota/summary-strip";
import { StableSurface } from "../components/ui/surface";
import { HistoryTrend } from "../components/quota/history-trend";

type Filter = "all" | "attention" | "stale";

export function OverviewPage({
  onPageChange,
}: {
  onPageChange: (page: PageId) => void;
}) {
  const [accounts, setAccounts] = useState<ServiceQuotaView[] | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [source, setSource] = useState<"phase0-fixture" | "tauri">("phase0-fixture");
  const [refreshing, setRefreshing] = useState(false);
  const [cardRefreshing, setCardRefreshing] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const toast = useToast();

  // Rust Core 是唯一刷新时钟；页面只接收首屏 DTO 与后续 overview-updated 事件。
  useEffect(() => {
    let cancelled = false;
    void quotaClient
      .getOverview()
      .then((data) => {
        if (cancelled) return;
        setAccounts(data.accounts);
        setRefreshedAt(data.refreshedAt);
        setSource(data.source);
      })
      .catch((reason) => {
        if (!cancelled) setLoadError(commandErrorMessage(reason));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void quotaClient
      .onOverviewUpdated((data) => {
        if (!active) return;
        setAccounts(data.accounts);
        setRefreshedAt(data.refreshedAt);
        setSource(data.source);
      })
      .then((dispose) => {
        if (active) unlisten = dispose;
        else dispose();
      });
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const visible = useMemo(() => {
    if (!accounts) return [];
    const filtered = accounts.filter((a) => {
      if (filter === "attention") {
        return (
          a.state === "stale-with-error" ||
          a.windows.some((window) => window.tone !== "normal")
        );
      }
      if (filter === "stale") return a.state === "stale-with-error";
      return true;
    });
    return sortByRisk(filtered);
  }, [accounts, filter]);

  async function refreshAll() {
    setRefreshing(true);
    setLoadError(null);
    try {
      const data = await quotaClient.refreshAll();
      setAccounts(data.accounts);
      setRefreshedAt(data.refreshedAt);
      setSource(data.source);
    } catch (reason) {
      setLoadError(commandErrorMessage(reason));
    } finally {
      setRefreshing(false);
    }
  }

  async function refreshAccount(id: string) {
    setCardRefreshing(id);
    setLoadError(null);
    try {
      const data = await quotaClient.refreshAccount(id);
      setAccounts(data.accounts);
      setRefreshedAt(data.refreshedAt);
      setSource(data.source);
    } catch (reason) {
      setLoadError(commandErrorMessage(reason));
    } finally {
      setCardRefreshing(null);
    }
  }

  return (
    <>
      <PageHeader
        title="概览"
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
            <Button
              className="btn btn-glass"
              onPress={() => refreshAll()}
              isDisabled={refreshing}
              data-tooltip="刷新全部账号（Ctrl+R）"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              <span>全部刷新</span>
            </Button>
            <Button
              className="btn btn-outline"
              onPress={async () => {
                try {
                  const path = await quotaClient.exportLatestSnapshot();
                  toast.success("脱敏快照已导出", path);
                } catch (reason) {
                  toast.error("快照导出失败", commandErrorMessage(reason));
                }
              }}
            >
              <Download size={14} />
              导出快照
            </Button>
          </>
        }
      />

      <div className="page-scroll overview-page flex-1 overflow-y-auto px-7 py-5">
        {loadError && (
          <StableSurface className="mb-4 px-4 py-3">
            <p className="text-[12.5px] text-ink-2">额度数据读取失败</p>
            <p className="mt-0.5 text-[11px] text-ink-3">{loadError}</p>
          </StableSurface>
        )}
        {accounts && (
          <div className="mb-5">
            <SummaryStrip accounts={accounts} refreshedAt={refreshedAt} />
          </div>
        )}

        {!accounts && !loadError ? (
          <Grid>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </Grid>
        ) : accounts && accounts.length === 0 ? (
          <EmptyOverview onPageChange={onPageChange} />
        ) : accounts && visible.length === 0 ? (
          <FilterEmpty onClear={() => setFilter("all")} />
        ) : accounts ? (
          <Grid>
            {visible.map((account) => (
              <ServiceQuotaCard
                key={account.id}
                account={account}
                refreshing={cardRefreshing === account.id}
                onRefresh={refreshAccount}
                onMore={() => onPageChange("accounts")}
              />
            ))}
          </Grid>
        ) : null}

        {source === "phase0-fixture" && (
          <div className="data-provenance mt-5 text-[11px] text-ink-3">
            演示数据（浏览器预览模式）
          </div>
        )}
        <HistoryTrend />
      </div>
    </>
  );
}

function FilterEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="surface-stable p-10 flex flex-col items-center justify-center text-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-[rgba(127,141,168,.1)] flex items-center justify-center text-ink-3">
        <FilterX size={22} />
      </div>
      <div>
        <p className="text-ink-1 font-medium">当前筛选下没有账号</p>
        <p className="text-[12.5px] text-ink-3 mt-1">
          没有符合当前筛选条件的账号
        </p>
      </div>
      <Button className="btn btn-outline" onPress={onClear}>
        查看全部
      </Button>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="quota-grid grid gap-4"
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
        <Inbox size={22} />
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
