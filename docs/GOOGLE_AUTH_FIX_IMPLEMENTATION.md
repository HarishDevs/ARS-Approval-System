# Google sign-in: fix implementation (v1.54.6)

| File | Function | Change | Why |
|---|---|---|---|
| `server/auth/errors.ts` | `AuthError`, `GOOGLE_REFUSAL_MESSAGE`, `maskEmail` | `AuthError` takes an optional `reason` code. One message per refusal: UNKNOWN_ACCOUNT, LINKED_ELSEWHERE, INACTIVE, WRONG_METHOD, EMAIL_NOT_VERIFIED, NOT_GOOGLE_PROVIDER. Email masking for logs. | Users and IT can see the cause. |
| `server/auth/google-sign-in.ts` | `googleSignInWithDeps` | Each refusal throws `AUTH_NOT_ALLOWED` (403) with its reason and message. The history row records `<REASON> <masked email>`. A new LINKED_ELSEWHERE check. INVALID_TOKEN (401) gets its own reason. | Who failed and why becomes visible. No rule changed. |
| `lib/db/repositories/users.repository.ts` | `isEmailLinkedToAnotherGoogle` | New read-only lookup. | Tells "already linked elsewhere" apart from "no account". |
| `server/auth/http.ts`, `lib/http/api-response.ts` | `authErrorResponse`, `apiError` | The error body carries `reason`. | The browser can tell cases apart. |
| `app/api/auth/google/route.ts` | `POST` | One structured log line per attempt: `auth.google` with requestId, stage, outcome, status, reason, host, durationMs. Never the token or the email. | Production-safe tracing with a correlation id. |
| `app/api/auth/google/client-event/route.ts` | `POST` (new) | Logs Firebase popup failure codes (`auth/popup-blocked`…), stage BROWSER_POPUP. Pattern-checked, rate-limited, nothing stored. | Popup failures that never reach the server become visible. |
| `features/auth/components/GoogleButton.tsx` | `GoogleButton` | Plain messages for popup failures: blocked, network, unauthorized domain, storage blocked, unsupported browser, too many requests, disabled. Shows the server's message and the request id ("Reference for IT"). Reports popup failures. Ignores a second click while busy. | Users know what to do; IT can find the log line. |
| `middleware.ts` | cross-site check | The 403 now has code `FORBIDDEN_CROSS_SITE`, a clear message and the request id, and is logged (`security.cross_site_refused`). | Distinguishes this 403 from the account 403. |
| `server/auth/rate-limit.ts` | `RATE_RULES.GOOGLE` | 30 → 300 per IP per 15 minutes. | An office behind one IP shared 30 sign-ins (429 at busy times). |
| `tests/security/route-inventory.test.ts` | `PUBLIC` | The new public route is listed with its reason. | The route inventory (SEC-02) stays complete. |

**Not changed:** Firebase config, COOP (already `same-origin-allow-popups`), CSP, cookies, session, RBAC, the password sign-in path, and the popup flow (still right; the popup isn't failing).

## Configuration
No new environment variables. Existing ones (names only):
- Browser: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`. These are public by design.
- Server: the Firebase Admin service-account variables, `SESSION_SECRET`, `APP_BASE_URL`, `ORIGIN_SECRET`, and `LEGACY_HOSTS` (empty).

## Deployment
Publish v1.54.6 as usual. There is no database migration.

## Rollback
Publish v1.54.5. There is no data change to undo; the extra text in `login_logs.failure_reason` is harmless.
