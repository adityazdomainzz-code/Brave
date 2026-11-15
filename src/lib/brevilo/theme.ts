import type { ThemeName } from "./types";

export const DEFAULT_ACCENT = "#6d4dff";

type Listener = () => void;

let theme: ThemeName = "dark";
let accent = DEFAULT_ACCENT;
const listeners = new Set<Listener>();

function validAccent(value: string | null): value is string {
  return !!value && /^#[0-9a-fA-F]{6}$/.test(value);
}

function loadLocal() {
  if (typeof localStorage === "undefined") return;
  const storedTheme = localStorage.getItem("brevilo-theme");
  if (storedTheme === "light" || storedTheme === "dark") theme = storedTheme;
  const storedAccent = localStorage.getItem("brevilo-accent");
  if (validAccent(storedAccent)) accent = storedAccent;
}

loadLocal();

export function getSnapshot() {
  return `${theme}|${accent}`;
}

export function getServerSnapshot() {
  return `dark|${DEFAULT_ACCENT}`;
}

export function subscribeTheme(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readTheme(): ThemeName {
  return theme;
}

export function readAccent(): string {
  return accent;
}

export function applyTheme(next: { theme?: ThemeName; accent?: string }) {
  if (next.theme) theme = next.theme;
  if (next.accent && validAccent(next.accent)) accent = next.accent;
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty("--color-accent", accent);
  }
  try {
    localStorage.setItem("brevilo-theme", theme);
    localStorage.setItem("brevilo-accent", accent);
  } catch {
    /* ignore private mode */
  }
  listeners.forEach((listener) => listener());
}
