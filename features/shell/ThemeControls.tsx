"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { saveThemeAction } from "@/app/users/theme-actions";
import { RadioGroup } from "@/features/ui/Field";
import { useToast } from "@/features/ui/Toast";
import { actionErrorMessage } from "@/features/ui/form";
import { THEME_COOKIE, themeAttribute, type Theme } from "@/server/ui/theme";

function apply(theme: Theme) {
  const value = themeAttribute(theme);
  if (value) document.documentElement.dataset.theme = value;
  else delete document.documentElement.dataset.theme;
}

// UI-02 in Profile: applies at once, saves on the account and the cookie.
export function ThemeChoice({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const toast = useToast();
  const choose = async (next: Theme) => {
    const previous = theme;
    setTheme(next);
    apply(next);
    const formData = new FormData();
    formData.set("theme", next);
    const result = await saveThemeAction(null, formData).catch((error: unknown) => ({ ok: false as const, message: actionErrorMessage(error) ?? "Couldn't reach the server." }));
    if (!result.ok) {
      setTheme(previous);
      apply(previous);
      toast({ tone: "error", title: "Theme not saved", body: result.message });
    } else {
      toast({ tone: "success", title: "Theme saved", body: next === "system" ? "It follows your device setting." : `${next === "dark" ? "Dark" : "Light"} on every device you use.` });
    }
  };
  return (
    <RadioGroup<Theme>
      legend="Theme"
      name="theme"
      hint="How the app looks. System follows your phone or computer setting."
      value={theme}
      onChange={choose}
      options={[
        { value: "system", label: "System", icon: <Monitor aria-hidden="true" className="h-4 w-4" /> },
        { value: "light", label: "Light", icon: <Sun aria-hidden="true" className="h-4 w-4" /> },
        { value: "dark", label: "Dark", icon: <Moon aria-hidden="true" className="h-4 w-4" /> },
      ]}
    />
  );
}

// On a device whose cookie doesn't match the account setting (a new phone),
// apply the account's theme and remember it there.
export function ThemeSync({ theme }: { theme: Theme }) {
  useEffect(() => {
    const cookie = document.cookie.split("; ").find((part) => part.startsWith(`${THEME_COOKIE}=`))?.split("=")[1];
    if (cookie === theme) return;
    apply(theme);
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  }, [theme]);
  return null;
}
