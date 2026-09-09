import { useCallback, useSyncExternalStore } from "react";

/**
 * Light, dark, or whatever the operating system says.
 *
 * The resolved value is written to `data-theme` on <html>, which is what the
 * stylesheet's dark variant keys off - one source of truth rather than a media
 * query and a class disagreeing. The choice is remembered per browser; "system"
 * keeps tracking, including a change made while the app is open.
 *
 * The state lives in a module-level store rather than in `useState`, because
 * more than one component reads it - the menu that sets it, and the toaster
 * that has to match it. Per-component state would leave them disagreeing.
 */

export type ThemeT = "light" | "dark" | "system";

const STORAGE_KEY = "mailhub-theme";

const stored = (): ThemeT => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    // Private windows and blocked site data both land here; "system" is a
    // perfectly good answer, so this is not worth reporting.
    return "system";
  }
};

const systemPrefersDark = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;

type StateT = { theme: ThemeT; resolved: "light" | "dark" };

let state: StateT = { theme: "system", resolved: "light" };
const listeners = new Set<() => void>();

const publish = (theme: ThemeT): void => {
  const resolved = theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
  if (state.theme === theme && state.resolved === resolved) return;

  state = { theme, resolved };
  if (typeof document !== "undefined") document.documentElement.dataset.theme = resolved;
  for (const listener of listeners) listener();
};

if (typeof window !== "undefined") {
  publish(stored());
  // Keep following the system for as long as that is the choice.
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => state.theme === "system" && publish("system"));
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useTheme = () => {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );

  const setTheme = useCallback((next: ThemeT) => {
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not being able to remember it is no reason to refuse the change.
    }
    publish(next);
  }, []);

  return { theme: current.theme, resolved: current.resolved, setTheme };
};
