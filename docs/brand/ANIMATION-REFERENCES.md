# Animated loader references (IconScout, 1 Nov 2026)

Shortlist for ARS-CMS (owner's request: task completion tick, success, failed and every
animation the app can use). All are **free** Lottie animations on IconScout and can be
recoloured to the brand (ARS Blue #0053A0, Accent #0A84FF). "Attribution" = the licence
asks for a credit line; prefer the ones without. Nothing has been downloaded or added to
the app yet; the app currently uses its own SVG/CSS animations (`features/ui/Loaders.tsx`, D-266).

| Use in ARS-CMS | Pick | Slug | Size | Attribution | Preview |
|---|---|---|---|---|---|
| Task completed (checkbox) | Checkbox Check | `checkbox-check-19287183` | 400² | yes | https://cdnl.iconscout.com/lottie/free/thumb/free-checkbox-check-animation-gif-download-15560468.mp4 |
| Task completed (tick) | Check | `check-17399123` | 500² | no | https://cdnl.iconscout.com/lottie/free/thumb/free-check-animation-gif-download-14177597.mp4 |
| Approved / verified | Verified | `verified-11179721` | 128² | no | https://cdnl.iconscout.com/lottie/free/thumb/free-verified-animation-gif-download-8989640.mp4 |
| Success (submitted, saved) | Success Check | `success-check-16452920` | 500² | no | https://cdnl.iconscout.com/lottie/free/thumb/free-success-check-animation-gif-download-13443380.mp4 |
| Success (big moment, all levels approved) | Successfully Done | `successfully-done-5379517` | 1000² | no | https://cdnl.iconscout.com/lottie/free/thumb/free-successfully-done-animation-gif-download-4503214.mp4 |
| Success (alternative) | Success Checkmark | `success-checkmark-19287185` | 400² | yes | https://cdnl.iconscout.com/lottie/free/thumb/free-success-checkmark-animation-gif-download-15560470.mp4 |
| Failed / error / rejected | Error | `error-17399125` | 500² | no | https://cdnl.iconscout.com/lottie/free/thumb/free-error-animation-gif-download-14177599.mp4 |
| Message not delivered | Failed Mail | `failed-mail-8076804` | 1920² | no | https://cdnl.iconscout.com/lottie/free/thumb/free-failed-mail-animation-gif-download-6462705.mp4 |
| Loading (same set as Check/Error) | Loading | `loading-17399126` | 500² | no | https://cdnl.iconscout.com/lottie/free/thumb/free-loading-animation-gif-download-14177600.mp4 |
| Loading (dots) | Loading | `loading-4828990` | 281×228 | no | https://cdnl.iconscout.com/lottie/free/thumb/free-loading-animation-gif-download-4025793.mp4 |
| Upload | Cloud uploading | `cloud-uploading-5019038` | 1000² | no | https://cdnl.iconscout.com/lottie/free/thumb/free-cloud-uploading-animation-gif-download-4182015.mp4 |
| Download (PDF, exports) | Document Download | `document-download-11279872` | 300² | no | https://cdnl.iconscout.com/lottie/free/thumb/free-document-download-animation-gif-download-9100858.mp4 |
| Searching | Document Search | `document-search-11279877` | 300² | no | https://cdnl.iconscout.com/lottie/free/thumb/free-document-search-animation-gif-download-9100863.mp4 |
| Checklist / My Tasks empty | Document Checklist | `document-checklist-11279869` | 300² | no | https://cdnl.iconscout.com/lottie/free/thumb/free-document-checklist-animation-gif-download-9100870.mp4 |
| Sign-off / approval step | Signature Hand Pinch | `signature-hand-pinch-19384493` | 430² | yes | https://cdnl.iconscout.com/lottie/free/thumb/free-signature-hand-pinch-animation-gif-download-15645234.mp4 |
| Maintenance / empty state | Website Maintenance | `website-maintenance-7295440` | 1200² | no | https://cdnl.iconscout.com/lottie/free/thumb/free-website-maintenance-animation-gif-download-5967184.mp4 |
| Cloud sync done | Cloud Done | `cloud-done-3655481` | 192² | no | https://cdnl.iconscout.com/lottie/free/thumb/free-cloud-done-animation-gif-download-3056299.mp4 |

A consistent family: **Check / Error / Loading** by the same author (Guilherme Lottie, pack 399360)
and **Document Checklist / Document Download / Document Search** (Posse Studio, pack 257814)
would give the app one look.

## In the app (1 Nov 2026, owner: "download the recommended set and wire it in")
Downloaded (free, commercial use, no attribution required), recoloured to the ARS palette by a
script and saved in `public/animations/`. Played with `lottie-web` 5.12.2 (light build, loaded
only when an animation shows) by `features/ui/BrandAnimation.tsx`; the app's own SVG version
shows until it loads, if it fails, and always when "reduce motion" is on.

| File | IconScout asset | Colour | Where it shows |
|---|---|---|---|
| `task-done.json` | Check (`check-17399123`) | ARS green #16A34A | every success toast (a task completed, saved, moved…) |
| `failed.json` | Error (`error-17399125`) | red #DC2626 | every error toast; every form's error message |
| `success.json` | Success Check (`success-check-16452920`) | green | every form's success message; "Submitted as …" |
| `approved.json` | Verified (`verified-11179721`) | ARS Blue #0053A0 | "Your decision is recorded" |
| `celebrate.json` | Successfully Done (`successfully-done-5379517`) | green | "Your decision is recorded" when that decision finished the request (approved) |
| `loading.json` | Loading (`loading-17399126`) | Accent Blue #0A84FF | the "Loading data…" state |

Still to fetch (IconScout's free daily download limit was reached): Cloud uploading,
Document Search, Document Checklist, Document Download.

## Original plan
- Download the `.json` (Lottie) files into `public/animations/`, recoloured to the brand palette.
- Add a small Lottie player (for example `lottie-web` light build, about 60 KB gzipped) loaded only where an animation shows; keep the current SVG/CSS ones as the fallback and for "reduce motion".
- Record the licence and any attribution lines in this file and on the Terms page if required.
