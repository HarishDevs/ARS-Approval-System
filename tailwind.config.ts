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
        },
        "accent-red": "var(--color-accent-red)",
        ink: "var(--color-text-primary)",
        "ink-muted": "var(--color-text-secondary)",
        "ink-faint": "var(--color-text-placeholder)",
        line: "var(--color-border-default)",
        surface: "var(--color-surface-white)",
        "surface-muted": "var(--color-surface-muted)",
        page: "var(--color-surface-page)",
        success: { 50: "var(--color-success-50)", 600: "var(--color-success-600)" },
        warning: { 50: "var(--color-warning-50)", 600: "var(--color-warning-600)" },
        danger: { 50: "var(--color-error-50)", 200: "var(--color-error-200)", 600: "var(--color-error-600)" },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      fontSize: {
        caption: ["12px", "16px"],
        label: ["13px", "18px"],
        body: ["14px", "20px"],
        title: ["20px", "28px"],
        "card-title": ["22px", "30px"],
        display: ["32px", "40px"],
      },
      borderRadius: { sm: "4px", md: "8px", lg: "12px", xl: "16px" },
      boxShadow: {
        card: "0 8px 24px rgba(15, 23, 42, 0.08)",
        button: "0 4px 12px rgba(0, 83, 152, 0.22)",
      },
      spacing: { sidebar: "220px", topbar: "64px" },
    },
  },
  plugins: [],
};

export default config;
