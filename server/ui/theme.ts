// UI-02 theme choice. "system" follows the device; the cookie lets the
// server paint the right theme on the first byte (no flash); the account
// setting carries it to other devices.
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "ars_theme";
export const THEME_SETTING = "ui.theme";

export function parseTheme(value: string | null | undefined): Theme {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : "system";
}

// The value for <html data-theme>: none for "system" (the CSS media query decides).
export const themeAttribute = (theme: Theme): "light" | "dark" | undefined => (theme === "system" ? undefined : theme);
