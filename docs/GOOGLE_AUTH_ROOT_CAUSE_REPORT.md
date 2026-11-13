# Google sign-in: root cause report (v1.54.6, 13 Nov 2026)

## 1. Executive summary
Google sign-in works for some people and fails for others with **HTTP 403 on `/api/auth/google`**. The investigation traced every place a 403 can come from. The 403 is produced by **the application itself, deliberately**: after Google has verified the person, ARS-CMS refuses Google identities that don't match an allowed ARS-CMS account. The Google popup, the COOP header, cookies and the session code work as intended and are **not** the cause.

Until v1.54.6 every such refusal showed the same message ("This Google account can't sign in here. Ask IT to check your account.") and, for the most common case (a Google account that matches no user), **nothing identifying the person was recorded**. So IT could not tell *why* a person failed, or even *who* failed. That made a data or account problem look like an intermittent technical fault.

**Confirmed:**
- The 403 is the app's account rule. The person's Google identity doesn't match an ARS-CMS user that is active and allowed to use Google.
- The diagnosis gap. The cause was invisible to the user and to IT.

**Not yet confirmed (needs production evidence):** *which* of the five account reasons each failing person hits. v1.54.6 now records it (see §7). It is most likely *Google account email ≠ the email IT registered* (§6).

**Contributing factor fixed:** Google sign-in was limited to 30 attempts per IP per 15 minutes. An office behind one public IP shares that limit, so at a busy start of day people can get "Too many attempts" (HTTP 429).

## 2. Existing architecture
- Next.js 15 App Router, custom authentication (no NextAuth/Auth.js).
- Browser: Firebase Auth (`lib/firebase/client.ts`), **popup flow** (`signInWithPopup`, `prompt=select_account`). Redirect flow was rejected earlier because Chrome's bounce-tracking protection wiped redirect state (Power BI site, Sept 2026). The Firebase project `power-bi-dashboard-3b29f` is shared with the Power BI site.
- Server: `POST /api/auth/google` (`app/api/auth/google/route.ts`) receives the Firebase **ID token**. `server/auth/google-sign-in.ts`:
  - verifies the token with Firebase Admin (`lib/firebase/admin.ts`: signature, issuer, audience, expiry);
  - requires a verified email and the `google.com` provider;
  - finds the user by `firebase_uid`, or on first sign-in links the admin-created account with the same email (`firebase_uid IS NULL` only);
  - applies `checkSignInAllowed` (active, sign-in method GOOGLE/BOTH, not locked, break-glass window);
  - creates the session (`server/auth/complete-sign-in.ts`).
- Session: HMAC-signed token in an HttpOnly, Secure (production), SameSite=Lax cookie, path `/`. No OAuth redirect URI or state on our side: Firebase handles the OAuth exchange in its own popup, and we only receive and verify the signed ID token.
- Middleware (`middleware.ts`) runs before every route: Cloudflare origin secret, legacy host redirect, cross-site check for state-changing `/api` calls, HTTPS, CSP nonce, session gate (`/api/auth/*` is public).

## 3. Authentication flow
```
[Login page] --click--> Firebase signInWithPopup (accounts.google.com, firebaseapp.com)
     | (popup: account chosen; Google + Firebase do the OAuth exchange)
     v
 ID token in the page --POST /api/auth/google {idToken}--> middleware
     middleware: origin secret? cross-site (Sec-Fetch-Site)? ---> 403 (FORBIDDEN / "Direct access")
     v
 route: schema --> rate limit (per IP) ---> 429
     v
 googleSignIn: verify token ---> 401 INVALID_TOKEN
              verified email + google.com provider ---> 403
              find by uid / link by email ---> 403 UNKNOWN_ACCOUNT
              active, method GOOGLE/BOTH, not locked ---> 403 / 423
     v
 completeSignIn: session row, Secure HttpOnly cookie, new-login alert (in the background) --> 200 {redirectTo}
     v
 browser goes to redirectTo (/users …)
```

## 4. Observed errors and what they mean
| Evidence | Finding |
|---|---|
| `/api/auth/google` 403 | **The cause of the failures.** The route only accepts POST (a GET would be 405), and Chrome's "Failed to load resource" line doesn't show the method. A 403 on the button's POST comes from (a) the app's account rule (`AUTH_NOT_ALLOWED`) or (b) the middleware cross-site check. The Cloudflare origin check would refuse the whole site, not only sign-in. |
| COOP "would block the window.closed call" | **Not the cause.** Our pages send `Cross-Origin-Opener-Policy: same-origin-allow-popups` (checked on live 13 Nov 2026), which is right for a popup flow. The warning comes from Google's own pages (they send `same-origin`). Firebase falls back to messaging, so the popup still returns the token. A 403 can only happen *after* the token came back, which proves the popup worked. |
| PWA "Banner not shown: beforeinstallprompt" | **Unrelated.** The app keeps the install prompt for its own Install button. No dependency on sign-in. |
| `failed to get redirect response … EACCES 127.0.0.1:20011` | **Unrelated to Google sign-in.** It is Next.js trying to pre-render the target of a Server Action `redirect()` over loopback, which GoDaddy's Passenger refuses. Next then lets the browser navigate itself. Google sign-in uses a `fetch` and a client navigation, not a Server Action redirect. |
| Resend 429 `daily_quota_exceeded` | **Unrelated.** Sign-in sends its new-login alert in the background (`deps.dispatch`, errors logged, never thrown). Email failures can't stop a sign-in. They do mean alerts and notifications are not reaching people: a separate issue (raise the Resend plan, or reduce email volume). |

## 5. Successful vs failed users
No production data was available to this investigation: no access to the live database or logs, and the built-in browser was not signed in. What the code shows:

| Area | Successful user | Failed user (403) |
|---|---|---|
| Browser, OS, device, network, popup, cookies | Popup returns a token | **Same:** the 403 needs a token, so the popup worked |
| Request origin | Same-origin POST | Same-origin POST (a cross-site POST now shows a different message) |
| Google account email | Equals the email IT registered (or the account is already linked) | **Differs** from the registered email (personal Gmail, other Workspace account, alias, typo) → UNKNOWN_ACCOUNT |
| ARS-CMS account | Active, method GOOGLE or BOTH | Inactive → INACTIVE, or method PASSWORD → WRONG_METHOD |
| Link | Not linked yet, or linked to this Google identity | Linked to another Google identity → was UNKNOWN_ACCOUNT, now LINKED_ELSEWHERE |
| API response | 200 | 403 `AUTH_NOT_ALLOWED` |

## 6. Root cause
**Confirmed:** the failing people's Google identities don't satisfy the app's account rules, so the server correctly refuses them. Because the reason was hidden and unknown accounts weren't identifiable, the problem looked intermittent and couldn't be fixed by IT.

**Most likely specific reason (to be confirmed from Super Admin → Sign-in history after v1.54.6):** UNKNOWN_ACCOUNT. People choose a Google account whose email isn't the one in their ARS-CMS record. For example:
- a personal Gmail;
- the company address is not a Google account;
- an email alias such as itadmin@ vs itsupport@ (see D-082);
- a typo in the registered email.

**Why it affects some users and not others:** it depends entirely on each person's account data and which Google account they pick, not on their browser or network.

## 7. Contributing factors
1. One generic message for five different refusals. Users and IT couldn't act.
2. No record of who failed when the Google account matched no user (`user_id` NULL, no email). Fixed: the history now records the reason and a masked email (`ra***@gmail.com`).
3. An account already linked to another Google identity gave the same "unknown" refusal. Fixed: now its own reason, `LINKED_ELSEWHERE`, and IT can reset the link.
4. Rate limit of 30 Google sign-ins per IP per 15 minutes, shared by an office behind one IP. That gives 429, not 403. Fixed: raised to 300.
5. The middleware cross-site 403 had the bare message "Not allowed." Fixed: it now has its own code and message, and is logged.

## 8. Security impact of the changes
- No check was removed or relaxed: token verification, verified email, `google.com` provider, existing-account-only, active, method, lock, break-glass, RBAC, CSRF/cross-site and the session cookie flags are unchanged.
- Specific messages reveal account status only to the person who has just proved to Google that they own that email. That isn't account enumeration.
- Logs and history keep a **masked** email only. No token, cookie or full email is logged.
- The rate limit for Google sign-in is higher. Password sign-in keeps its limits. A Google ID token can't be guessed.
- The new `/api/auth/google/client-event` endpoint:
  - accepts only a code matching `auth/[a-z0-9-]`;
  - stores nothing in the database;
  - is same-site only and rate-limited.

## 9. Corrective actions
See `GOOGLE_AUTH_FIX_IMPLEMENTATION.md`. After deploying, IT reads Super Admin → Sign-in history for the failing people and fixes each account, as listed in `GOOGLE_AUTH_DEPLOYMENT_CHECKLIST.md`.
