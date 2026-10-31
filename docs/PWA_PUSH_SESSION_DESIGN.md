# Installable app, Web Push, daily session and the approval road (v1.41.0)

Decisions: D-250 (daily session), D-251 (installable app), D-252 (Web Push and IT notifications), D-253 (road tracker). Flows: F-187 to F-191.

## 1. What the existing application already had (audit, 1 Nov 2026)

| Area | Found | Used as |
|---|---|---|
| Front end | Next.js 15.5 App Router, React 19, TypeScript, Tailwind with theme tokens (light, dark, system), Compact and Classic views | unchanged; new screens use the same tokens |
| Back end | Next.js route handlers and server actions on Node 20+ (GoDaddy Node.js hosting behind Cloudflare) | new routes under `/api/push/*`, `/api/requests/{id}/progress` |
| Auth | HMAC-signed `ars_session` cookie (HttpOnly, Secure, SameSite=Lax) pointing at a `user_sessions` row; the row and the user are re-read on every request; idle limit (setting) and 12-hour expiry | the daily session is a policy on the same row (`session_policy`), so nothing about cookies or checks is weakened |
| Database | MySQL 8, `mysql2`, migrations applied on start | one additive migration |
| People | `users` (department, designation, reporting manager), `roles`/`user_roles`, `departments.hod_user_id` | the targeting engine reads these; no new user table |
| Notifications | `notify()`: Inbox row plus email/WhatsApp deliveries in `notification_deliveries`; preferences per group and channel; Do not disturb; `notification_outbox` (claimed, retried queue) drained after each action and by the job runner | push is a third delivery channel on the same tables; IT broadcasts go through the outbox |
| Jobs | one cPanel cron call every 5 minutes runs `runAutomations()` | new automation `push` |
| PWA | `app/manifest.ts` (standalone, icons, theme colour); no service worker | kept; service worker added |
| Live updates | polling only (bell, session check); no WebSocket or SSE on this hosting | the road polls every 20 s while visible |

Not present, so not offered: floor/location data (targeting by floor), scheduled sending of IT notices (no scheduling infrastructure for them; the notice goes at once).

## 2. Architecture

```
browser ──(service worker /sw.js: static cache, push, click)──┐
   │ subscribe (endpoint + keys, owner = session person)       │ push message (encrypted, RFC 8291)
   ▼                                                            │
/api/push/*  ─► push_subscriptions (keys encrypted)             │
                                                                │
action ─► notify() ─► notifications (Inbox) ─► notification_deliveries (PUSH, QUEUED, one per device)
                                   │                     │
                                   │      drain right after (in process) + job runner every 5 min
                                   │                     ▼
                                   │      web-push (VAPID JWT + aes128gcm) ─► push service ─────┘
                                   │      201 = SENT (accepted), 404/410 = device EXPIRED, 429/5xx = retry
Admin → Notifications ─► admin_broadcasts + notification_outbox (one per person) ─► notify()
```

- The session and push are separate. Signing out, the midnight end or a lock never touches `push_subscriptions`. Deactivating a person stops their notifications, because `notify()` skips people who aren't active. Another person signing in on the same browser takes over its row, so the first person's notices stop arriving there.
- The queue is the existing `notification_deliveries` table. The job runner leases each due row before sending it (two senders never send the same row), up to 5 tries with backoff. A device the push service reports gone is marked expired and re-registered on its next visit.
- SENT means the push service accepted the message. It is never reported as "seen".

## 3. Daily session (D-250)
- At sign-in, the server decides:
  - **DAILY**: when the Super Admin's scope allows it and the device is a phone, a tablet or the installed app (from the user agent, or the app's own `ars_client` hint for iPadOS and the installed app). The session row and the token expire at the next 00:00 IST, computed from the server clock (18:30 UTC).
  - **IDLE** otherwise: the idle limit and 12 hours, as before.
- Every protected request re-checks the row, so midnight is enforced by the server, never by a browser timer.
- The cookie outlives the session by 12 hours, so the app can say "Your daily session has expired". The token itself is refused after midnight.
- After sign-in the person returns to the exact page they asked for; the server checks access to it again.
- A deactivation, a lock, Sign out everywhere or a break-glass expiry still end the session at once.

## 4. Security notes
- **Ownership:** a device's owner is always the session's person, never a request value. List, remove and status only see the caller's rows.
- **Endpoints:** only Google, Mozilla, Microsoft and Apple push services are accepted, so the server never posts to an address a caller chose (SSRF).
- **Secrets:** the VAPID private key and the subscription keys are encrypted at rest (AES-256-GCM). The endpoint is never returned to a browser or shown to IT, only the push service's host.
- **Lock screen:** by default a notification shows its title and a plain line (no amounts or field values). IT's own notices show their text.
- **Service worker:** caches build files and brand images only; never pages, API answers or files. Navigation falls back to an offline page.
- **Writes:** cross-site writes are refused by the middleware, as for every API; IT broadcasts are rate-limited and audited.

## 5. Platform limits (stated, not worked around)
- iPhone/iPad: web push only from the app on the Home Screen, iOS/iPadOS 16.4+; no install prompt (the Share → Add to Home Screen steps are shown).
- Firefox (computer): no app install. Push works in the browser.
- Push services may drop messages for devices offline for a long time. The message is always in the Inbox.
- Real-device checks: the automated tests run in Chromium. Installing and receiving pushes on actual Android and iOS devices must be confirmed on the owner's phones after publishing (DEPLOYMENT Part V, step 3).
