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
    <div className="app-canvas h-full flex">
      <ControlGlass
        as="nav"
        className={`shrink-0 flex flex-col transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
          collapsed ? "w-16" : "w-56"
        }`}
        style={{ borderRight: "1px solid var(--line)" }}
      >
        <div
          className={`flex items-center gap-2.5 h-14 shrink-0 ${
            collapsed ? "justify-center px-0" : "px-4"
          }`}
        >
          <AppMark size={26} />
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-[13px] font-semibold tracking-tight text-ink-1">
                AI 额度中心
              </div>
              <div className="text-[10.5px] text-ink-3 tracking-wider">QUOTA MONITOR</div>
            </div>
          )}
        </div>

        <ul className="flex flex-col gap-1 px-2 py-2 flex-1">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = page === id;
            return (
              <li key={id}>
                <Button
                  onPress={() => onPageChange(id)}
                  className={`btn w-full ${collapsed ? "!px-0" : "!justify-start"}`}
                  data-active={active}
                  style={
                    active
                      ? {
                          background: "var(--accent-soft)",
                          color: "var(--accent)",
                          fontWeight: 600,
                        }
                      : undefined
                  }
                >
                  <Icon size={16} className="shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </Button>
              </li>
            );
          })}
        </ul>

        <div className="p-2 border-t border-[var(--line)]">
          <Button
            onPress={onToggleCollapsed}
            className="btn w-full !text-ink-3"
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

      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
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
    <header className="h-14 shrink-0 flex items-center justify-between gap-4 px-6 border-b border-[var(--line)]">
      <div className="min-w-0">
        <h1 className="text-[19px] font-semibold leading-tight text-ink-1 truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[12px] text-ink-3 truncate mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

export type { ComponentPropsWithoutRef };