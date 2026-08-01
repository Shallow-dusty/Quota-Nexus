import { useEffect, useState } from "react";
import type { ThemePreference } from "./quota-types";

const STORAGE_KEY = "qn.theme";

function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function apply(pref: ThemePreference) {
  const resolved = resolveTheme(pref);
  document.documentElement.dataset.theme = resolved;
}

export function useThemePreference(): [
  ThemePreference,
  (next: ThemePreference) => void,
] {
  const [pref, setPref] = useState<ThemePreference>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" || saved === "system"
      ? saved
      : "system";
  });

  useEffect(() => {
    apply(pref);
    window.localStorage.setItem(STORAGE_KEY, pref);
    if (pref !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => apply("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [pref]);

  return [pref, setPref];
}
