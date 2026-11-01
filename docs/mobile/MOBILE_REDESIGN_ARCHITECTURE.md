# ARS-CMS mobile redesign: architecture (v1.43.x)

Owner's brief (2 Nov 2026): a complete mobile PWA redesign from the reference sheets
(bottom navigation Home · Approvals · Tasks · Inbox · More, a personal Home, approval
and task cards, a standard record page with a sticky action bar, the TMT van road,
branded states), **with the desktop application left exactly as it is**.

## What the code is (audit, 1 Nov 2026)

| Item | Finding |
|---|---|
| Framework | Next.js 15.5 App Router, React 19, TypeScript, Tailwind with CSS-variable tokens |
| Rendering | Server components fetch data; client components for interaction; Server Actions for writes |
| Shell | `features/shell/AppShell.tsx` (server): sidebar (`SidebarFrame`, md and up), top bar, `MobileNav` hamburger and `BottomNav` (below md), Classic view variant |
| Existing breakpoints | Tailwind defaults; **md = 768 px** is today's phone / desktop split (sidebar from md; bottom bar below md); lg 1024, xl 1280 used inside pages |
| Data and rules | Repositories in `lib/db/repositories`, services in `server/**`; every page and action checks access on the server |
| PWA | `app/manifest.ts`, `public/sw.js` (push, notification click, offline page), install invite, Web Push (VAPID), daily session (D-250) |
| Pages | 131 pages, 48 API routes, 173 server actions (qa/APPLICATION_ROUTE_INVENTORY.md) |

## Decision: one layout per request, chosen on the server

Two ways were weighed:

1. **Both layouts in the page, one hidden by CSS.** Simple, but every page would carry
   two copies of its HTML, and the hidden copy still counts for tests, screen readers'
   find, IDs and duplicate texts (hundreds of desktop tests would need changing to stay
   unambiguous).
2. **The server renders one layout** (chosen). `server/ui/layout-mode.ts` decides
   *mobile* or *desktop* per request:
   - a cookie `ars_layout` (`mobile` / `desktop`) set by the browser from its window
     width (`features/mobile/LayoutSync.tsx`: below 768 px = mobile); resizing or
     turning a device across 768 px updates the cookie and refreshes the data (no full
     reload);
   - without the cookie (first visit), a phone's user agent (Android Mobile, iPhone,
     iPod) means mobile; anything else means desktop.

   A desktop browser wider than 767 px **never** reaches the mobile code: its pages run
   exactly the code they run today. That is the desktop guarantee.

Breakpoints: **phone 0–767 px = mobile layout**; tablet 768–1023 px and desktop 1024+ =
today's layout (tablets already get the sidebar layout, which is kept, so tablets are
unchanged too).

## How a page gets its mobile form

- The shell (top bar, five-tab bottom bar, More) is mobile when the layout is mobile, in
  the users area (Admin and Super Admin keep today's responsive layout: setup work).
- A page with a dedicated mobile presentation checks `isMobileLayout()` and renders its
  mobile component **from the same data it already loads** (no new APIs, no second
  query set). Pages without one render their existing (already responsive) content
  inside the mobile shell.
- Writes keep using the same Server Actions; permissions are the same server checks.
- Mobile styles are classes inside mobile components (prefix `mob-`, never `m-`: see MOBILE_DESIGN_SYSTEM.md) and `[data-layout="mobile"]`
  scoped CSS; no global style changes.

## Design tokens (mobile only)

Scoped under `[data-layout="mobile"]`: ARS Navy `#173B63` (top hero cards and headings
accents), ARS Red `#D92D20` (accent, critical), the existing ARS Blue `#0053A0` and
Accent `#0A84FF` for actions, background `#F2F4F7`, surfaces white, success `#16A34A`
fills, warning `#F79009` fills. Text colours keep their tested 4.5:1 values. Dark theme:
the existing dark tokens. Type: Inter; screen title 22 px, section 17 px, card title
15 px, body 14 px, support 12–13 px; 16 px side padding, cards 14 px radius, 48 px
buttons, 44 px minimum targets, bottom bar 64 px + safe area.

## Phases and gates

Each phase ends with: unit + e2e (desktop suites unchanged and passing), the desktop
screenshot comparison (DESKTOP_REGRESSION_REPORT.md), the mobile sweep at the brief's
sizes, a commit and CI.

1. Audit, inventory, desktop baseline screenshots (this file, MOBILE_REDESIGN_SCREEN_INVENTORY.md, DESKTOP_BASELINE_SCREENSHOTS.md).
2. Layout mode, mobile shell, bottom bar, More, design tokens.
3. Home (mobile).
4. Approvals hub (tabs, cards), request page (record layout, road, sticky decisions).
5. Tasks (tabs, cards, FAB), task page, projects.
6. Inbox (tabs, feed), Information.
7. AI Assistant, Calendar, Analytics, Search, Profile and settings.
8. States (skeletons, empty, error, offline), forms (single column, bottom sheets), attachments.
9. PWA and session validation; full testing; release.

## Known limits (stated, not faked)

- Biometric sign-in: the app has no WebAuthn sign-in; not offered.
- Real-device testing (iOS Safari, Android Chrome as installed apps) and push delivery
  to devices can't be run from the development machine; they are listed for the owner's
  UAT with exact steps.
