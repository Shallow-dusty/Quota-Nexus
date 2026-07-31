import {
  Cable,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
} from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Button } from "react-aria-components";
import type { PageId } from "../../lib/quota-types";
import { AppMark } from "./app-mark";
import { ControlGlass } from "../ui/surface";
import { LiquidFilters } from "../ui/liquid-filters";

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
      <LiquidFilters />
      <ControlGlass
        as="nav"
        className={`app-sidebar shrink-0 flex flex-col transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
          collapsed ? "w-16" : "w-56"
        }`}
      >
        <div
          className={`app-brand flex items-center gap-2.5 h-16 shrink-0 ${
            collapsed ? "justify-center px-0" : "px-4"
          }`}
        >
          <AppMark size={32} />
          {!collapsed && (
            <div className="brand-copy leading-tight">
              <div className="text-[13.5px] font-semibold tracking-tight text-ink-1">
                Quota Monitor
              </div>
              <div className="text-[10px] text-ink-3 mt-0.5">
                AI 服务额度
              </div>
            </div>
          )}
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
      </ControlGlass>

      <main className="workspace-stage flex-1 min-w-0 flex flex-col">
        {children}
      </main>
    </div>
  );
}

/** 内容区页头：标题 + 右侧操作槽（§11.2） */
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
