import type { Config } from "tailwindcss";

// ARS brand tokens from D:\Omniroute\assets\tokens (D-022). Colours are CSS
// variables defined in styles/globals.css so a dark theme can override them.
const config: Config = {
  // Relative to this file, not the working directory (cPanel may start the
  // app from elsewhere).
  content: { relative: true, files: ["./app/**/*.{ts,tsx}", "./features/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"] },
  theme: {
    extend: {
      colors: {
        primary: {
          50: "var(--color-primary-50)",
          100: "var(--color-primary-100)",
          600: "var(--color-primary-600)",
          700: "var(--color-primary-700)",
          solid: "var(--color-primary-solid)",
          "solid-hover": "var(--color-primary-solid-hover)",
          "solid-disabled": "var(--color-primary-solid-disabled)",
        },
        "accent-red": "var(--color-accent-red)",
        ink: "var(--color-text-primary)",
        "ink-muted": "var(--color-text-secondary)",
        "ink-faint": "var(--color-text-placeholder)",
        "on-solid": "var(--color-text-on-solid)",
        line: "var(--color-border-default)",
        "line-strong": "var(--color-border-strong)",
        raised: "var(--color-surface-raised)",
        overlay: "var(--color-overlay)",
        surface: "var(--color-surface-white)",
        "surface-muted": "var(--color-surface-muted)",
        page: "var(--color-surface-page)",
        success: { 50: "var(--color-success-50)", 600: "var(--color-success-600)", solid: "var(--color-success-solid)" },
        warning: { 50: "var(--color-warning-50)", 600: "var(--color-warning-600)", solid: "var(--color-warning-solid)" },
        danger: { 50: "var(--color-error-50)", 200: "var(--color-error-200)", 600: "var(--color-error-600)", solid: "var(--color-error-solid)", "solid-hover": "var(--color-error-solid-hover)" },
        info: { 50: "var(--color-info-50)", 600: "var(--color-info-600)" },
        focus: "var(--color-focus)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      fontSize: {
        caption: ["calc(12px * var(--text-scale, 1))", "calc(16px * var(--text-scale, 1))"],
        label: ["calc(13px * var(--text-scale, 1))", "calc(18px * var(--text-scale, 1))"],
        body: ["calc(14px * var(--text-scale, 1))", "calc(20px * var(--text-scale, 1))"],
        title: ["calc(20px * var(--text-scale, 1))", "calc(28px * var(--text-scale, 1))"],
        "card-title": ["calc(22px * var(--text-scale, 1))", "calc(30px * var(--text-scale, 1))"],
        display: ["calc(32px * var(--text-scale, 1))", "calc(40px * var(--text-scale, 1))"],
      },
      borderRadius: { sm: "4px", md: "8px", lg: "12px", xl: "16px" },
      boxShadow: {
        card: "var(--shadow-card)",
        button: "var(--shadow-button)",
        overlay: "var(--shadow-overlay)",
      },
      transitionDuration: { fast: "var(--motion-fast)", base: "var(--motion-base)", slow: "var(--motion-slow)" },
      transitionTimingFunction: { standard: "var(--ease-standard)" },
      zIndex: { header: "var(--z-header)", sticky: "var(--z-sticky)", drawer: "var(--z-drawer)", dialog: "var(--z-dialog)", toast: "var(--z-toast)", palette: "var(--z-palette)" },
      spacing: { sidebar: "220px", topbar: "64px" },
    },
  },
  // dark: variants follow the chosen theme (rarely needed: tokens switch by themselves).
  darkMode: ["selector", '[data-theme="dark"]'],
  plugins: [],
};

export default config;
