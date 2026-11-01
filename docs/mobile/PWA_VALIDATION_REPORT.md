# PWA validation (v1.43.0, 1 Nov 2026)

Run against the production build (`npm run build`, `next start` on port 3100, test
database) in Chromium. "Owner UAT" items need a real phone and can't be run from the
development machine; they are listed with steps, not marked as passed.

## Checked here

| Check | Result | Evidence |
|---|---|---|
| Manifest served | Pass | `/manifest.webmanifest`: name "ARS-CMS · Central Management System", short name "ARS-CMS", `start_url` /users, `scope` /, `display` standalone |
| Splash colours | Pass | `background_color` #f2f4f7 (mobile page colour), `theme_color` #0053A0 (unchanged, so installed desktop windows look as before) |
| Icons | Pass | 64, 96, 192, 512 (any) and 512 maskable, all 200 image/png |
| Shortcuts | Pass | Approvals `/users/approvals`, Tasks `/users/work/my-tasks`, Inbox `/users/inbox` |
| Service worker | Pass | `/sw.js` 200, `Service-Worker-Allowed: /`, `Cache-Control: no-store`; registered with scope `/`, state activated |
| Nothing private cached | Pass | Cache `ars-static-<build>` holds only `offline.html`, icons, brand images and `/_next/static` files; no `/users` page and no `/api` answer |
| Offline page | Pass | `/offline.html` 200; the worker answers a failed page load with it |
| Offline banner | Pass (existing) | `OfflineBanner` in the shell shows when the browser reports offline |
| Layout on install | Pass | The installed app opens `/users`; a phone gets the mobile layout from its user agent before any cookie exists (`tests/mobile/layout.test.ts`) |
| Session on phones | Pass (existing) | The daily session (till midnight India time) for phones and the app; never for IT or the Super Admin (QA-SEC-03, `tests/auth/daily-privileged.test.ts`) |

## Owner UAT (real devices)

1. **Android, Chrome:** open approval.arssteels.net → Install app → open from the home screen. Expect the splash in light grey with the icon, then Home with the bottom tabs. Long-press the icon: Approvals, Tasks, Inbox.
2. **iPhone, Safari (iOS 16.4+):** Share → Add to Home Screen → open. Expect the same; the top bar clears the notch and the tabs clear the home indicator (safe-area padding).
3. **Notifications:** More → App & devices → Turn on notifications → Send a test; it arrives on the lock screen without amounts.
4. **Offline:** turn on flight mode in the app → open another tab of the app: the red offline line shows; reload: the offline page; turn the network back on: Try again works.
5. **Rotate** a tablet or the phone: below 768 px the phone layout, from 768 px the computer layout, without signing in again.
6. **Decide on a request** from the Approvals tab: Approve, Return (comment required), Reject (asks again).

Push delivery to devices and installed-app behaviour on iOS were not run here.
