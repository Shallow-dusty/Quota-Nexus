import { Download, FilterX, Inbox, Plus, RefreshCw } from "lucide-react";
import { Button } from "react-aria-components";
import { useEffect, useMemo, useState } from "react";
import { commandErrorMessage, quotaClient } from "../lib/quota-client";
import { useToast } from "../components/ui/toast";
import { sortAccounts, type AccountSortMode } from "../lib/quota-logic";
import { useLocalPref } from "../lib/use-local-pref";
import type { PageId, ServiceQuotaView } from "../lib/quota-types";
import { PageHeader } from "../components/shell/app-shell";
import { SegmentedControl } from "../components/ui/segmented";
import { GlassSelect } from "../components/ui/select";
import { SkeletonCard } from "../components/ui/skeleton";
import { AccountDetailDrawer } from "../components/quota/account-detail-drawer";
import { ServiceQuotaCard } from "../components/quota/service-quota-card";
import { ServiceQuotaRow } from "../components/quota/service-quota-row";
import { GlassSurface } from "../components/ui/glass";
import { formatTime } from "../lib/format";

type Filter = "all" | "attention";

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
  const [sort, setSort] = useLocalPref<AccountSortMode>(
    "qn.overview-sort",
    ["risk", "name", "provider"] as const,
    "risk",
  );
  const [view, setView] = useLocalPref<"grid" | "list">(
    "qn.overview-view",
    ["grid", "list"] as const,
    "grid",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
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
      return true;
    });
    return sortAccounts(filtered, sort);
  }, [accounts, filter, sort]);

  const needsAttentionCount = useMemo(
    () =>
      (accounts ?? []).filter(
        (a) =>
          a.state === "stale-with-error" ||
          a.windows.some((w) => w.tone !== "normal"),
      ).length,
    [accounts],
  );

  async function reload() {
    try {
      const data = await quotaClient.getOverview();
      setAccounts(data.accounts);
      setRefreshedAt(data.refreshedAt);
      setSource(data.source);
    } catch (reason) {
      setLoadError(commandErrorMessage(reason));
    }
  }

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
          <GlassSurface radius={16} className="mb-4 px-4 py-3">
            <p className="text-[12.5px] text-ink-2">额度数据读取失败</p>
            <p className="mt-0.5 text-[11px] text-ink-3">{loadError}</p>
          </GlassSurface>
        )}
        {accounts && accounts.length > 0 && (
          <div className="overview-toolbar mb-3 flex items-center gap-2">
            <SegmentedControl
              value={filter}
              onChange={setFilter}
              options={[
                { id: "all", label: "全部" },
                {
                  id: "attention",
                  label:
                    needsAttentionCount > 0
                      ? `需处理 ${needsAttentionCount}`
                      : "需处理",
                },
              ]}
            />
            <div className="ml-auto flex items-center gap-2">
              <span className="tnum text-[11px] text-ink-3">
                上次刷新 {formatTime(refreshedAt)}
              </span>
              <GlassSelect
                ariaLabel="排序方式"
                value={sort}
                onChange={setSort}
                options={[
                  { id: "risk", label: "风险优先" },
                  { id: "name", label: "名称" },
                  { id: "provider", label: "供应商" },
                ]}
              />
              <SegmentedControl
                value={view}
                onChange={setView}
                options={[
                  { id: "grid", label: "网格" },
                  { id: "list", label: "列表" },
                ]}
              />
            </div>
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
        ) : accounts && view === "list" ? (
          <div className="quota-list flex flex-col gap-2.5">
            {visible.map((account) => (
              <ServiceQuotaRow
                key={account.id}
                account={account}
                refreshing={cardRefreshing === account.id}
                onRefresh={refreshAccount}
                onOpen={setDetailId}
              />
            ))}
          </div>
        ) : accounts ? (
          <Grid>
            {visible.map((account) => (
              <ServiceQuotaCard
                key={account.id}
                account={account}
                refreshing={cardRefreshing === account.id}
                onRefresh={refreshAccount}
                onOpen={setDetailId}
              />
            ))}
          </Grid>
        ) : null}

        {source === "phase0-fixture" && (
          <div className="data-provenance mt-5 text-[11px] text-ink-3">
            演示数据（浏览器预览模式）
          </div>
        )}
      </div>

      <AccountDetailDrawer
        accountId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={() => void reload()}
      />
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
