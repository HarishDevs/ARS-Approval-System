"use client";

// D-251, D-252: what this browser can do (install, push) and the calls that
// do it. Browser-only; every call is guarded so an old or locked-down
// browser simply sees "not available here".

export type Platform = "ios" | "android" | "desktop";

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// iPadOS Safari says it is a Mac; a Mac with a touch screen is an iPad.
export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

export function platform(): Platform {
  if (isAppleMobile()) return "ios";
  if (typeof navigator !== "undefined" && /Android/.test(navigator.userAgent)) return "android";
  return "desktop";
}

export function isTouchDevice(): boolean {
  return typeof window !== "undefined" && (isAppleMobile() || (window.matchMedia?.("(pointer: coarse)").matches && navigator.maxTouchPoints > 0));
}

export function isDesktopSafari(): boolean {
  if (typeof navigator === "undefined" || isAppleMobile()) return false;
  const ua = navigator.userAgent;
  return /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\/|OPR\//.test(ua);
}

// ---- install --------------------------------------------------------------

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function captureInstallEvents(): () => void {
  const onPrompt = (event: Event) => {
    event.preventDefault(); // we show our own invitation, then the browser's
    deferred = event as BeforeInstallPromptEvent;
    emit();
  };
  const onInstalled = () => {
    installed = true;
    deferred = null;
    rememberInvite("installed");
    emit();
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const canPromptInstall = () => deferred !== null;
export const justInstalled = () => installed;

// The browser's own install dialog. "accepted" when the person installed.
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferred;
  if (!event) return "unavailable";
  deferred = null;
  emit();
  await event.prompt();
  const choice = await event.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  return choice.outcome;
}

// "Maybe later" / installed, remembered on this device (and, signed in, on
// the account: see InstallInvite).
const INVITE_KEY = "ars.installInvite";
export function inviteState(): string | null {
  try {
    return window.localStorage.getItem(INVITE_KEY);
  } catch {
    return "unavailable"; // storage blocked: don't keep asking
  }
}
export function rememberInvite(state: "dismissed" | "installed"): void {
  try {
    window.localStorage.setItem(INVITE_KEY, state);
  } catch {
    // private mode: the account flag still remembers it
  }
}

// ---- push -----------------------------------------------------------------

export type PushSupport = "supported" | "needs-install" | "unsupported";

// iPhone and iPad allow notifications only from the app on the Home Screen
// (iOS 16.4 or later).
export function pushSupport(): PushSupport {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return "unsupported";
  if (isAppleMobile() && !isStandalone()) return "needs-install";
  if (!("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return "supported";
}

export const notificationPermission = (): NotificationPermission | "unsupported" => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64url}${"=".repeat((4 - (base64url.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

async function serverKey(): Promise<string | null> {
  const response = await fetch("/api/push/key", { cache: "no-store" });
  if (!response.ok) return null;
  const body = (await response.json()) as { enabled?: boolean; publicKey?: string | null };
  return body.enabled && body.publicKey ? body.publicKey : null;
}

async function register(subscription: PushSubscription): Promise<boolean> {
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON(), installed: isStandalone(), permission: notificationPermission(), touch: isTouchDevice() }),
  });
  return response.ok;
}

const sameKey = (subscription: PushSubscription, key: string) => {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true;
  const wanted = keyBytes(key);
  const have = new Uint8Array(current);
  return have.length === wanted.length && have.every((byte, index) => byte === wanted[index]);
};

// Asks the browser once (only after the person pressed the button) and
// registers this device. Never asks again once the person said no.
export async function enablePush(): Promise<{ ok: boolean; message: string }> {
  const support = pushSupport();
  if (support === "needs-install") return { ok: false, message: "On iPhone and iPad, notifications work in the installed app: add ARS CMS to your Home Screen first, then open it from there." };
  if (support === "unsupported") return { ok: false, message: "This browser can't show notifications from websites." };
  if (Notification.permission === "denied") return { ok: false, message: "Notifications are blocked for ARS CMS in this browser. Allow them in the browser's site settings (see the steps below)." };
  const key = await serverKey().catch(() => null);
  if (!key) return { ok: false, message: "Phone and desktop notifications aren't switched on yet. Ask IT." };
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, message: permission === "denied" ? "You chose Block. Notifications stay in your Inbox; you can allow them later in the browser's site settings." : "Nothing changed. Press the button again when you're ready." };
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameKey(subscription, key)) {
    await subscription.unsubscribe().catch(() => undefined);
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  return (await register(subscription)) ? { ok: true, message: "Notifications are on for this device." } : { ok: false, message: "Couldn't register this device. Please try again." };
}

// Turn off on this device: the browser's subscription is dropped and the
// device removed from the account.
export async function disablePushHere(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const status = await fetch("/api/push/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) })
    .then((response) => (response.ok ? (response.json() as Promise<{ id: number | null }>) : { id: null }))
    .catch(() => ({ id: null }));
  if (status.id) await fetch(`/api/push/subscriptions/${status.id}`, { method: "DELETE" }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}

// This browser's endpoint (to mark "This device" in the list).
export async function currentEndpoint(): Promise<string | null> {
  if (pushSupport() !== "supported") return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription())?.endpoint ?? null;
}

// Signed in and already allowed: keep this device registered (after keys
// changed, the push service dropped it, or it was registered by someone
// else before). At most once a day unless something changed.
const KEEP_KEY = "ars.pushKeep";
export async function keepPushRegistered(userId: number): Promise<void> {
  if (pushSupport() !== "supported" || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.ready;
  const key = await serverKey().catch(() => null);
  if (!key) return;
  let subscription = await registration.pushManager.getSubscription();
  let stamp: string | null = null;
  try {
    stamp = window.localStorage.getItem(KEEP_KEY);
  } catch {
    stamp = null;
  }
  const today = `${userId}:${new Date().toISOString().slice(0, 10)}:${subscription?.endpoint.slice(-24) ?? ""}`;
  if (subscription && sameKey(subscription, key) && stamp === today) return;
  if (subscription && !sameKey(subscription, key)) {
    await subscription.unsubscribe().catch(() => undefined);
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  if (await register(subscription)) {
    try {
      window.localStorage.setItem(KEEP_KEY, `${userId}:${new Date().toISOString().slice(0, 10)}:${subscription.endpoint.slice(-24)}`);
    } catch {
      // fine: it checks again next time
    }
  }
}
