"use client";

import { useEffect } from "react";
import { keepPushRegistered } from "@/features/pwa/browser";

// D-252: signed in, with notifications already allowed on this device: keep
// the device registered to this person (the browser may have renewed its
// subscription, IT may have new keys, or someone else used this browser).
// Never asks for permission by itself.
export function PushKeeper({ userId }: { userId: number }) {
  useEffect(() => {
    const timer = window.setTimeout(() => void keepPushRegistered(userId).catch(() => undefined), 3000);
    return () => window.clearTimeout(timer);
  }, [userId]);
  return null;
}
