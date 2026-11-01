# Desktop regression report (v1.43.0 phone layout)

The brief: the desktop must stay visually and functionally the same.

## Evidence

1. **Code path.** Mobile rendering is chosen per request (`layoutMode()`); with the
   desktop layout the shell renders what it did in v1.42.x, plus `LayoutSync`
   (renders nothing). Mobile CSS lives only under `[data-layout="mobile"]`, with
   `mob-` classes. Pages with a phone screen return early only when mobile.
2. **Full desktop e2e suite on the v1.43.0 build: 229 / 229**, at 1280–1440 px,
   every role and flow, axe in light and dark, the Classic view, the site audit.
   Also on the final v1.44.0 build (REGRESSION_TEST_RESULTS.md).
3. **Desktop layout audit (1440 px):** 32 users-area pages plus Create task, no
   overflow, overlap or clipped text; screenshots in `docs/mobile/screens/desk-*`.
4. **Responsive sweep** at 1024, 1366 and 1920 px for every role: pass.

## What a computer user does see change (on purpose)

- v1.43.0 itself: nothing in the desktop layout. Help and the User Guide gained the
  "On your phone" section; the request drawer's "Return" label shows on phones only.
- v1.44.0 (a separate, requested change): the request page's road became the
  approval journey (full width under the title), and New request's Work task level
  gained "The request waits until it's done".

## Not done

Pixel comparison against screenshots taken *before* the change (none were taken;
DESKTOP_BASELINE_SCREENSHOTS.md says so).
