import { useState } from "react";
import { AppShell } from "./components/shell/app-shell";
import { AccountsPage } from "./pages/accounts-page";
import { OverviewPage } from "./pages/overview-page";
import { SettingsPage } from "./pages/settings-page";
import type { PageId } from "./lib/quota-types";
import { useThemePreference } from "./lib/theme";

export function App() {
  const [page, setPage] = useState<PageId>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useThemePreference();
  const [transparencyOff, setTransparencyOff] = useState(false);

  function applyTransparency(off: boolean) {
    setTransparencyOff(off);
    document.documentElement.dataset.transparency = off ? "off" : "on";
  }

  return (
    <AppShell
      page={page}
      collapsed={collapsed}
      onPageChange={setPage}
      onToggleCollapsed={() => setCollapsed((c) => !c)}
    >
      {page === "overview" && <OverviewPage onPageChange={setPage} />}
      {page === "accounts" && <AccountsPage />}
      {page === "settings" && (
        <SettingsPage
          theme={theme}
          onThemeChange={setTheme}
          transparencyOff={transparencyOff}
          onTransparencyChange={applyTransparency}
        />
      )}
    </AppShell>
  );
}