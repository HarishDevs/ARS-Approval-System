# Mobile design system (v1.43.0)

Applies only inside `[data-layout="mobile"]` (the users area on screens below 768 px).
The desktop layout never carries it.

## Tokens (`styles/globals.css`, mobile block)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--m-navy` | `#173B63` | `#1D4A7C` | Hero card, active tab chip, primary mobile buttons |
| `--m-navy-text` | `#173B63` | `#9FC6EE` | Links and active tab text on surfaces (4.5:1 on both themes) |
| `--m-red` | `#D92D20` | `#D92D20` | Tab indicator, badges, Overdue, the Tasks + button |
| `--m-bg` | `#F2F4F7` | page surface | Screen background |

Everything else uses the app's tested tokens (surfaces, lines, text, primary, success,
warning, danger), so contrast and dark mode follow the existing checks.

## Classes

`mob-card` (14 px radius, line border, raised surface), `mob-screen-title` (22 px / 800),
`mob-section-title` (17 px / 700), `mob-chips` (sideways chip row without a scrollbar),
`mob-topbar`, `mob-tabbar`, `mob-main`, `mob-decision-bar`.

**Naming rule:** mobile classes start with `mob-`, never `m-`. Tailwind reads `m-<key>`
as a margin utility when `<key>` is a spacing token (`m-topbar` became `margin: 64px`
in the first build); `mob-` can't collide.

## Type and spacing

Inter (the app font). Screen title 22 px, section 17 px, card title 16 px, body 14–15 px,
support 12–13 px, overline labels 11 px uppercase. Side padding 16 px (`px-4`), gaps
12 px between cards, cards 16 px inside.

## Touch

Minimum target 44 px (`min-h-11`, top bar 44 × 44); decision buttons 48 px; tab bar
64 px plus the safe area; chips 44 px tall. The + button is 56 px, 16 px from the edge,
above the tab bar; the Pico Bot launcher moves above it and above the decision bar.

## Components

| Component | File | Notes |
|---|---|---|
| Bottom tabs | `features/mobile/MobileTabBar.tsx` | 5 tabs; `aria-current="page"`; badges with screen-reader words |
| Approval card | `features/mobile/ApprovalCard.tsx` | Whole card is one link; no actions on cards |
| Task card | `features/mobile/MobileTasks.tsx` | Approval tasks show the request number and a navy edge |
| Task + | `features/mobile/NewTaskButton.tsx` | Opens the app's one Create task window |
| Decision bar | `features/requests/ActionPanel.tsx` | Approve, Return, Hold, Reject; each opens a drawer with the comment box |
| Sign out | `features/mobile/MoreSignOut.tsx` | Confirm dialog first |
| Layout switch | `features/mobile/LayoutSync.tsx` | Sets `ars_layout`; refreshes when the window crosses 768 px |

## States

Empty: `EmptyState` per tab with what will appear. Loading: the existing navigation
progress bar. Offline: the existing offline banner and `offline.html`. Errors: the
existing error boundary and `ErrorState`.
