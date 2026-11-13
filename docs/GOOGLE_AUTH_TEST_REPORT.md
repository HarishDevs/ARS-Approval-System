# Google sign-in: test report (v1.54.6, 13 Nov 2026)

## Automated tests (run locally, all passing)

| Test | Covers | Result |
|---|---|---|
| `tests/auth/google-provider.test.ts` | Non-Google provider refused before lookup; google.com goes on; email masking; UNKNOWN_ACCOUNT (message names the email, history has the masked email); LINKED_ELSEWHERE; INACTIVE; WRONG_METHOD; EMAIL_NOT_VERIFIED; invalid token is 401 INVALID_TOKEN with nothing linked; a known active account links and signs in; the Google rate limit (300) vs password (20) | Pass |
| `tests/auth/*` (rules, password sign-in, set password, try-as, daily privileged) | Regression: password sign-in, locks, break-glass, sessions | Pass (64 in `tests/auth`) |
| `tests/security/route-inventory.test.ts` | Every API route guarded or deliberately public (new route listed) | Pass |
| `tests/e2e/v1546-google-auth.spec.ts` | Live app: an invalid token gives 401 with reason and request id; a cross-site POST gives 403 `FORBIDDEN_CROSS_SITE` with its own message; popup-failure report gives 204 (unknown codes reduced to "unknown"); login page shows Continue with Google | Pass |
| `tests/e2e/v140-api.spec.ts`, `tests/e2e/profile.spec.ts` | Regression: cross-site refusals on other routes, logout, profile | Pass |
| Full unit suite, lint, type check | Everything else | Pass |

## Not verified (honestly)
- **The real Google popup** can't run in automated tests: Google refuses automated sign-in. The account rules behind it are unit-tested with the same function the route calls.
- **Browser matrix** (Chrome, Edge, Firefox, Safari, mobile), **Incognito**, **third-party cookies blocked**, **popup blocked**: not run here. The messages for these are in place. Please try them on live with real accounts after deploying (checklist).
- **Successful vs failing production users**: no access to production data. The first failing attempt after deploying shows the exact reason in Super Admin → Sign-in history.

## Outstanding
- Confirm each failing person's reason from the history, and fix their account (checklist §5).
- Resend daily quota (429): separate from sign-in, but notifications aren't being delivered.
