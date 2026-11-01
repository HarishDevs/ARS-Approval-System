# Responsive test results (v1.44.0 QA pass)

## Automated

| Run | Sizes | Scope | Result |
|---|---|---|---|
| QA responsive sweep (`tests/qa-e2e/responsive-sweep.spec.ts`, `QA_VIEWPORTS=all`) | 320, 360, 375, 390, 414, 430, 768, 1024, 1366, 1920 | Every main route, every role: no sideways scroll | Pass (after QA-OWN-08) |
| WEB-01/16/20 (`tests/e2e/v1100-web.spec.ts`) | 360, 390, 768, 1366, 1920 | No page scrolls sideways | Pass |
| Mobile layout audit (script) | 360 × 740, 390 × 844 (phone layout), 1440 × 900 | 41 users-area routes per phone size, 32 at desktop, Create task: overflow, overlaps, clipped text | 117 checks, all clean |
| Classic view audit (script) | 390, 1440 | Every users, admin and Super Admin route in Classic | Clean after QA-OWN-04 to 07 |
| v143 mobile e2e | 390 → 1440 | Tabs, hub, decision bar above the tabs, Tasks +, Inbox Mentions, More, switch to desktop when widened | Pass |
| v144 journey e2e | 1440 | Road, van beside the level, activities, at the flag | Pass |

## The journey at each size

- Computer: the whole road usually fits; with many levels it scrolls sideways inside its panel and keeps the van in view.
- Phone: checkpoints closer together (118 px), the road scrolls to the van at once on opening (checked at 390 px: van at the flag after full approval).

## By eye

Contact sheets of every phone page (`docs/mobile/MOBILE_VISUAL_TEST_REPORT.md`) and of
the journey's scenes (sealing, driving, unloading, stamping, reloading, the flag).

## Not covered

Real devices (iOS Safari, Android Chrome), landscape phones, and browser zoom beyond
the existing text-size setting: listed for the owner's UAT.
