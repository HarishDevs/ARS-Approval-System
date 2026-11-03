import type { Config } from "tailwindcss";

// ARS brand tokens from D:\Omniroute\assets\tokens (D-022). Colours are CSS
// variables defined in styles/globals.css so a dark theme can override them.

// v1.49.3 (owner: "it overlaps; clear this kind of issue in all the
// dropdowns"): Tailwind can't fade a CSS-variable colour by itself, so
// classes like bg-surface/95 or border-warning-600/30 made no CSS at all (a
// see-through bar or panel). Each token is a function: plain, it is the
// variable; with an opacity modifier it is mixed with transparent.
type ColorFn = (options: { opacityValue?: string }) => string;
// (Tailwind accepts a function colour; its types only list strings.)
const token = (name: string): string => {
  const color: ColorFn = ({ opacityValue }) =>
    opacityValue === undefined || opacityValue.startsWith("var(") || opacityValue === "1" ? `var(${name})` : `color-mix(in srgb, var(${name}) calc(${opacityValue} * 100%), transparent)`;
  return color as unknown as string;
};
const config: Config = {
  // Relative to this file, not the working directory (cPanel may start the
  // app from elsewhere).
  content: { relative: true, files: ["./app/**/*.{ts,tsx}", "./features/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"] },
  theme: {
    extend: {
      colors: {
        primary: {
          50: token("--color-primary-50"),
          100: token("--color-primary-100"),
          600: token("--color-primary-600"),
          700: token("--color-primary-700"),
          solid: token("--color-primary-solid"),
          "solid-hover": token("--color-primary-solid-hover"),
          "solid-disabled": token("--color-primary-solid-disabled"),
        },
        "accent-red": token("--color-accent-red"),
        ink: token("--color-text-primary"),
        "ink-muted": token("--color-text-secondary"),
        "ink-faint": token("--color-text-placeholder"),
        "on-solid": token("--color-text-on-solid"),
        line: token("--color-border-default"),
        "line-strong": token("--color-border-strong"),
        raised: token("--color-surface-raised"),
        overlay: token("--color-overlay"),
        surface: token("--color-surface-white"),
        "surface-muted": token("--color-surface-muted"),
        page: token("--color-surface-page"),
        success: { 50: token("--color-success-50"), 600: token("--color-success-600"), solid: token("--color-success-solid") },
        warning: { 50: token("--color-warning-50"), 600: token("--color-warning-600"), solid: token("--color-warning-solid") },
        danger: { 50: token("--color-error-50"), 200: token("--color-error-200"), 600: token("--color-error-600"), solid: token("--color-error-solid"), "solid-hover": token("--color-error-solid-hover") },
        info: { 50: token("--color-info-50"), 600: token("--color-info-600") },
        focus: token("--color-focus"),
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
