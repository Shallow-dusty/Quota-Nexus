import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Cable,
  LayoutDashboard,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Square,
  X,
} from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Button } from "../ui/button";
import type { PageId } from "../../lib/quota-types";
import { AppMark } from "./app-mark";
import { GlassSurface } from "../ui/glass";

const handleWindowAction = (action: "close" | "minimize" | "maximize") => {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  try {
    const win = getCurrentWindow();
    if (action === "close") void win.close();
    else if (action === "minimize") void win.minimize();
    else void win.toggleMaximize();
  } catch (err) {
    console.warn("window action failed:", action, err);
  }
};

const NAV: Array<{ id: PageId; label: string; icon: typeof LayoutDashboard }> =
  [
    { id: "overview", label: "概览", icon: LayoutDashboard },
    { id: "accounts", label: "账号与连接", icon: Cable },
    { id: "settings", label: "设置", icon: Settings2 },
  ];

interface AppShellProps {
  page: PageId;
  collapsed: boolean;
  onPageChange: (page: PageId) => void;
  onToggleCollapsed: () => void;
  children: ReactNode;
}

export function AppShell({
  page,
  collapsed,
  onPageChange,
  onToggleCollapsed,
  children,
}: AppShellProps) {
  return (
    <div className="app-canvas app-shell h-full flex">
      <GlassSurface
        as="nav"
        radius={24}
        blur={32}
        className={`app-sidebar shrink-0 flex flex-col transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
          collapsed ? "w-16" : "w-56"
        }`}
      >
        <div className="sidebar-top flex flex-col pt-3 px-4 gap-2" data-tauri-drag-region="deep">
          <div
            className={`app-brand flex items-center gap-2.5 h-12 shrink-0 ${
              collapsed ? "justify-center !px-0" : "!px-0"
            }`}
          >
            <AppMark size={32} />
            {!collapsed && (
              <div className="brand-copy leading-tight">
                <div className="text-[13.5px] font-semibold tracking-tight text-ink-1">
                  Quota Nexus
                </div>
                <div className="text-[10px] text-ink-3 mt-0.5">
                  AI 额度
                </div>
              </div>
            )}
          </div>
        </div>

        <ul className="app-nav flex flex-col gap-1.5 px-2.5 py-3 flex-1">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = page === id;
            return (
              <li key={id}>
                <Button
                  onPress={() => onPageChange(id)}
                  className={`btn nav-button w-full ${collapsed ? "!px-0" : "!justify-start"}`}
                  data-active={active}
                >
                  <Icon size={16} className="shrink-0" />
                  {!collapsed && <span className="nav-label">{label}</span>}
                </Button>
              </li>
            );
          })}
        </ul>

        <div className="sidebar-footer p-2">
          <Button
            onPress={onToggleCollapsed}
            className="btn sidebar-collapse w-full !text-ink-3"
          >
            {collapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <>
                <PanelLeftClose size={16} />
                <span>折叠</span>
              </>
            )}
          </Button>
        </div>
      </GlassSurface>

      <main className="workspace-stage flex-1 min-w-0 flex flex-col">
        <div className="window-chrome z-40 flex h-9 shrink-0 items-stretch">
          <div className="flex-1" data-tauri-drag-region="deep" />
          <WindowControls />
        </div>
        {children}
      </main>
    </div>
  );
}

/** Windows 风格窗口控制：右上角标准三键（最小化/最大化/关闭）。 */
function WindowControls() {
  return (
    <div className="window-controls flex h-9 shrink-0 items-stretch select-none">
      <button
        type="button"
        className="window-control"
        onClick={() => handleWindowAction("minimize")}
        aria-label="最小化"
        title="最小化"
      >
        <Minus size={15} />
      </button>
      <button
        type="button"
        className="window-control"
        onClick={() => handleWindowAction("maximize")}
        aria-label="最大化或还原"
        title="最大化/还原"
      >
        <Square size={12} />
      </button>
      <button
        type="button"
        className="window-control window-control-close"
        onClick={() => handleWindowAction("close")}
        aria-label="关闭"
        title="关闭"
      >
        <X size={16} />
      </button>
    </div>
  );
}

/** 内容区页头：标题 + 右侧操作槽（DESIGN §8） */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header h-[72px] shrink-0 flex items-center justify-between gap-4 px-7">
      <div className="min-w-0">
        <h1 className="text-[21px] font-semibold leading-tight text-ink-1 truncate tracking-[-0.025em]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[12px] text-ink-3 truncate mt-1">{subtitle}</p>
        )}
      </div>
      {actions && <div className="page-actions flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

export type { ComponentPropsWithoutRef };
