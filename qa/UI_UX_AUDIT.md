# UI / UX audit (v1.43.0 QA pass)

## Method

1. **Classic view layout audit** (script; every users, admin and Super Admin route at
   1440 × 900 and 390 × 844, Super Admin account): sideways overflow, hit-tested
   overlapping controls and labels, clipped text; a screenshot per page, reviewed as
   contact sheets.
2. **Mobile layout audit** (same checks; users area at 1440, 390 and 360 px, 117 page
   checks; `docs/mobile/MOBILE_VISUAL_TEST_REPORT.md`).
3. **Responsive sweep** (`tests/qa-e2e/responsive-sweep.spec.ts`, `QA_VIEWPORTS=all`):
   every main route for each role at 320, 360, 375, 390, 414, 430, 768, 1024, 1366,
   1920 px; no sideways scroll.
4. **Accessibility:** axe on the main pages in light and dark (`tests/e2e/v160-ui.spec.ts`,
   no serious or critical findings); QA-A11Y-01 (names, one h1, language, alt text) and
   QA-A11Y-02 (visible focus).
5. **Owner's reports** (Classic Create task, the request page sketch, the workflow kind
   box) checked against the screenshots after each fix.

## Findings and fixes

| ID | Where | Finding | Fix |
|---|---|---|---|
| QA-OWN-04 | Classic · Create task | Details and settings drawn over each other | Centred Tally-style window, two columns |
| QA-OWN-05 | Classic · forms | Fields squeezed to a few pixels next to labels | Label : value rows wrap |
| QA-OWN-06 | Analytics on phones | Page bar names clipped | Own row |
| QA-OWN-07 | Sidebar logo | "ARS-CMS" on two lines | One line |
| QA-OWN-08 | Home at 320 px | 2 px sideways scroll | Hidden table wrapped |
| QA-OWN-03 | New request · levels | "Kind of step" cut off; wording said "approvers" for every kind | Short labels, help line, wording by kind |
| — | Request page | Owner's sketch: road beside the title; details then levels left; action grid then attachments right | Built (D-268), e2e geometry test |
| — | Tasks from approvals | Not recognisable among other tasks | Tint and request-number badge everywhere (D-270) |
| QA-MOB-01 to 04 | Phone layout | Top bar squeezed; decision bar under the tabs; Pico Bot on the +; chip scrollbars | Fixed (MOBILE_VISUAL_TEST_REPORT.md) |
| — | Contrast | `--brand-accent` text below 4.5:1 | `--brand-accent-text #0067d6` |

## Result

After the fixes, all layout audits were clean (no overflow, overlap or clipped text),
the responsive sweep passed for every role and width, and axe found no serious issues.

## Not covered

Screen-reader walkthroughs (NVDA, VoiceOver) by a person, real devices, and dark mode
on each new phone screen individually (owner's UAT).
