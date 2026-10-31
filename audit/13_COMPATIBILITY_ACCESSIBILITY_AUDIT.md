# 13 — Browser, device and accessibility audit

**Method.**
- Hand checks in the in-app browser (Chromium, with phone and tablet emulation).
- Keyboard checks on the sign-in page.
- The automated axe scans and phone checks in the e2e suite (re-run in `20_AUTOMATED_TEST_REPORT.md`): v160-ui RA-03 (axe, light and dark, main pages), v1100-web (phone menu focus trap, phone bar, 404), v1140-tour (the tour on a phone), and zz-site-audit (every page on desktop and a touch phone).

## Browsers and devices

| ID | Target | Method | Status | Evidence |
|---|---|---|---|---|
| CB-01 | Chromium / Chrome (desktop) | In-app browser + e2e (Desktop Chrome) | PASS | B01–B17; e2e |
| CB-02 | Edge | Same engine as Chrome; not run separately | NOT TESTED | — |
| CB-03 | Firefox | No Firefox project in Playwright | NOT TESTED | `playwright.config.ts` (Desktop Chrome only) |
| CB-04 | Safari / iOS | Not available on Windows | BLOCKED | — |
| CB-05 | Android/iPhone sizes (360×800, 390×844), with the touch phone emulated | Emulation | PASS (layout) | B02–B04; 02 §6.7 |
| CB-06 | Tablet (768×1024) | Emulation | PASS (layout) | B05 |

## Accessibility

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| AX-01 | Keyboard order and visible focus on sign-in (User ID → Password → Show password, each with a focus outline) | Browser, Tab key | PASS | B17; `activeElement` outline solid 1.67 px plus a ring |
| AX-02 | People search usable by keyboard (type, Enter picks, Esc closes) | Browser | PASS | B12 |
| AX-03 | Labels: every New request input has a label (Title, Details, Amount, Step name, Kind of step, Who approves…) | Accessibility tree | PASS | `find` results (session log) |
| AX-04 | Error messages tied to fields, with a summary "Check the highlighted fields." | Browser | PASS | Page text (03 FN-01) |
| AX-05 | axe: no serious or critical issues on the main pages, light and dark | e2e v160-ui RA-03 | See 20 | — |
| AX-06 | Phone menu traps focus and returns it; Esc closes | e2e v1100-web | See 20 | — |
| AX-07 | Screen reader (NVDA/JAWS/VoiceOver) | Not available | NOT TESTED | — |
| AX-08 | Zoom to 200% and reflow | Approximated by the 360 px layout (reflow), not tested as zoom | PARTIAL | 02 §6.7 |
| AX-09 | Contrast | axe colour-contrast rule in RA-03 | See 20 | — |

## Defects

None found by hand.
