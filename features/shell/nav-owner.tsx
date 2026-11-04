"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

// v1.49.5 (owner: "the approval opened from Waiting for me but it highlights
// My pending requests"): a page can name the list it belongs to. A request's
// address is always /users/requests/<id>, so without this the sidebar and the
// Classic tabs lit My pending requests even for an approver. The page renders
// <NavOwner href="/users/queue" />; SideNav and ClassicBar read useNavOwner().
let current: { pathname: string; href: string } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function NavOwner({ href }: { href: string }) {
  const pathname = usePathname();
  // Before paint, so the wrong tab doesn't flash on the way in.
  useLayoutEffect(() => {
    current = { pathname, href };
    emit();
    return () => {
      if (current?.pathname === pathname && current.href === href) {
        current = null;
        emit();
      }
    };
  }, [pathname, href]);
  return null;
}

// The address to highlight for: the owner's list on its page, else the page itself.
export function useNavOwner(pathname: string): string {
  const owner = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  return owner && owner.pathname === pathname ? owner.href : pathname;
}
