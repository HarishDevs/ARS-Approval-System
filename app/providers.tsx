"use client";

import { ToastProvider } from "@/features/ui/Toast";

// Client-side providers for the whole app (toasts).
export function Providers({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
