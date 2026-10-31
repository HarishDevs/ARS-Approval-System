/* ARS-CMS service worker (v1.41.0, D-251, D-252).
 *
 * What it does:
 *   - keeps the app's own static files (scripts, styles, fonts, icons) so the
 *     installed app opens quickly; a new build gets a new cache and the old
 *     one is deleted;
 *   - shows a simple "You're offline" page when a page can't be reached;
 *   - shows push notifications and opens the right page when one is clicked.
 * What it never does: keep pages, API answers, files or anything personal.
 * Approvals, tasks and records always come fresh from the server.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `ars-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/brand/ars-mark.svg", "/brand/ars-mark-white.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("ars-static-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Only these are cached: build files (their names change with each build)
// and the public brand assets.
const STATIC = /^\/(_next\/static\/|icons\/|brand\/|favicon\.ico$)/;

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (STATIC.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok && response.type === "basic") cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  // A page: always the network (never a stored copy of a private page); the
  // offline page only when the network fails.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL).then((page) => page || Response.error())));
  }
  // Everything else (API calls, files, RSC requests) goes straight to the server.
});

// ---- push notifications --------------------------------------------------

const safePath = (value) => (typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/users/inbox");

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ARS-CMS", body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "ARS-CMS";
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: typeof data.tag === "string" ? data.tag : undefined,
    renotify: Boolean(data.tag),
    timestamp: typeof data.timestamp === "number" ? data.timestamp : Date.now(),
    requireInteraction: data.priority === "HIGH",
    data: { url: safePath(data.url), category: data.category || null },
    actions: [{ action: "open", title: "Open" }],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Open the page in a window of the app if one is open (it keeps its session),
// else a new one. A page that needs sign-in sends the person through sign-in
// and back to it; the server checks they may see it.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ("navigate" in client) return client.navigate(target);
        return undefined;
      }
      return self.clients.openWindow(target);
    }),
  );
});

// The browser replaced the subscription (keys rotated or it expired): send
// the new one, proven by the old endpoint. Works while signed out.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      let fresh = event.newSubscription;
      if (!fresh && old && old.options) fresh = await self.registration.pushManager.subscribe(old.options);
      if (!old || !fresh) return;
      await fetch("/api/push/resubscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldEndpoint: old.endpoint, subscription: fresh.toJSON() }),
      });
    })(),
  );
});
