import { useCallback, useEffect, useState } from "react";
import { AppShell } from "./components/shell/app-shell";
import { ToastProvider } from "./components/ui/toast";
import { AccountsPage } from "./pages/accounts-page";
import { OverviewPage } from "./pages/overview-page";
import { SettingsPage } from "./pages/settings-page";
import type { PageId } from "./lib/quota-types";
import { useThemePreference } from "./lib/theme";
import { quotaClient } from "./lib/quota-client";

export function App() {
  const [page, setPage] = useState<PageId>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useThemePreference();
  const [transparencyOff, setTransparencyOff] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void quotaClient.refreshAll();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let active = true;
    void quotaClient
      .getSettings()
      .then((settings) => {
        if (active) {
          document.documentElement.dataset.privacy = settings.privacyMode ? "on" : "off";
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const applyTransparency = useCallback((off: boolean) => {
    setTransparencyOff(off);
    document.documentElement.dataset.transparency = off ? "off" : "on";
  }, []);

  const applyPrivacy = useCallback((enabled: boolean) => {
    document.documentElement.dataset.privacy = enabled ? "on" : "off";
  }, []);

  return (
    <ToastProvider>
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
            onPrivacyChange={applyPrivacy}
          />
        )}
      </AppShell>
    </ToastProvider>
  );
}
