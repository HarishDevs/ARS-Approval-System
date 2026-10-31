# 04 Authentication audit (SEC)

Auditor: SEC (independent security and API auditor) · Target: ARS-CMS v1.39.0, commit `0473f25` · Date: 31 Oct 2026 · Server: http://localhost:3100 (production build) against the throw-away `ars_approvals_test` database.

## 1. Method

- **Code review** of `app/api/auth/*`, `app/(public)/*`, `lib/session/*`, `lib/security/{otp,password,hashing}.ts`, `server/auth/*`, `lib/http/{client-ip,request-context}.ts`, `lib/db/repositories/{sessions,users}.repository.ts` (session and lockout queries) and `middleware.ts`.
- **HTTP probes** with curl. Test sessions came from the lead's `session.mjs` (test-only, same as the e2e suite). Tampered, expired and wrong-user tokens were built by `TEST_EVIDENCE/SEC/forge.mjs`, which reads the test-only secret from `session.mjs` and never prints it.
- **Read-only SQL** to confirm session rows and audit rows after logout and sign-out-everywhere.
- Rate-limit probes used `X-Forwarded-For: 198.51.100.x` (TEST-NET addresses). That gave them their own bucket, so the shared bucket for requests with no IP was left alone.
- **Not done:** no account was locked, no OTP was brute-forced, and no real Google or WhatsApp traffic was sent. WhatsApp and Firebase Admin are not configured on this server.
- **Evidence** (all under `audit/TEST_EVIDENCE/SEC/`):
  - `auth_session_probes.txt`
  - `auth_signin_probes.txt`
  - `auth_timing_enumeration.txt`
  - `headers_cors.txt`

**Environment notes for the lead.**

1. The running build reports `"version":"1.38.0"` on `/api/health`, but `package.json` at HEAD says 1.39.0. `.next/BUILD_ID` (`O6uJvlEnEP9PlkY-_JB_Q`) was written at 22:25, and the v1.39.0 commit is dated 22:43. The lead has since confirmed that the build contains the v1.39.0 code: the version string was read before `package.json` was bumped, and only a doc file changed after the build. This is a cosmetic mismatch, not a defect raised here.
2. Between about 22:52 and 22:55, another run re-seeded `ars_approvals_test`. All `E2E_*` users and every session were removed. Probes made before then used the brief's seeded users. Later probes used users from the new seed (`it-mvwo934e3` = USER, `it-mvwo932k1` = IT Admin, `itadmin` = Super Admin). Each probe file says which users it used.

## 2. Checks

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| AUTH-01 | Signed-in page without a cookie goes to /login with `next` | HTTP | PASS | `GET /users` and `/users/requests/1` return 307 to `/login?next=…` (auth_session_probes A1, A2). All 65 `/admin` and `/superadmin` paths return 307 to /login (rbac_pages_matrix.txt, anon column). |
| AUTH-02 | API without a cookie gives a generic 404 JSON | HTTP | PASS | `/api/me/quick`: 404 `{"code":"NOT_FOUND"}`. `/api/attachments/2`: 404 (A3, A4). middleware.ts:120-125 |
| AUTH-03 | Garbage session cookie is refused | HTTP | PASS | `ars_session=garbage`: `/users` returns 307 to `/signed-out?reason=unknown`. API returns 404. Status shows `signedIn:false` (A7-A9). |
| AUTH-04 | Tampered payload (uid changed to the Super Admin's, old signature kept) is refused | HTTP | PASS | A10: 307 to signed-out. Check is in token.ts:33-35 (HMAC, timingSafeEqual). |
| AUTH-05 | Correctly signed token whose `exp` has passed, live session row | HTTP | PASS | A12: 307 to `/signed-out?reason=unknown`. token.ts:38 |
| AUTH-06 | Correctly signed token for a session id that isn't in the DB | HTTP | PASS | A13: 404. sessions.repository.ts:75-82 (needs a row that is not revoked and not expired) |
| AUTH-07 | Session id bound to its user (STAFF's sid, signed with uid = Super Admin) | HTTP | PASS | A14: 307 to signed-out. The query matches `id = ? AND user_id = ?` (sessions.repository.ts:78). |
| AUTH-08 | Logout revokes the session row, clears the cookie, and the old cookie can't be reused | HTTP + SQL | PASS | A15: 200 with `Set-Cookie: ars_session=; Max-Age=0; Secure; HttpOnly; SameSite=lax`. A16/A17 reuse: 307 to `/signed-out?reason=signed_out`, and API 404. The DB row has `revoke_reason='SIGN_OUT'`, and audit row 735 is `LOGOUT`. |
| AUTH-09 | Several sessions for one person work at the same time | HTTP | PASS | A22/A23: two sessions for the same user, both `signedIn:true`. |
| AUTH-10 | "Sign out everywhere" ends every session of the person | HTTP + SQL | PASS | A24: 200. A25/A26: the second session shows `reason:"revoked"` and `/users` returns 307 to signed-out. DB: 2 rows `USER_SIGN_OUT_EVERYWHERE`, 0 live. Audit row 736 is `SESSIONS_REVOKED`. |
| AUTH-11 | An inactive person's existing session stops working on the next request | HTTP | PASS | Used the pre-existing inactive user `E2E_LEAVER_1793465838378` (active=0). `/users` returns 307 to `/signed-out?reason=deactivated`, API returns 404, status shows `reason:"deactivated"` (A19-A21). session.ts:63-64 |
| AUTH-12 | Inactive person can't sign in with a password | HTTP + code review | PARTIAL | A wrong password gives the generic 401 (S6). The right password for an inactive user could not be tried (no known password). Code: `checkSignInAllowed` refuses INACTIVE with the same generic message (password-sign-in.ts:117-121, sign-in-rules.ts:10). |
| AUTH-13 | Idle sign-out (30 min) and absolute session life (12 h) | HTTP + code review | PARTIAL | Status reports `idleSecondsLeft:1799` on a fresh session (A22). Revocation after idle time is in session.ts:66-71, and the 12 h TTL in constants.ts:5 and complete-sign-in.ts:108. Not waited out. |
| AUTH-14 | Google sign-in with a bad token | HTTP | PASS | A malformed JWT gives 401 `AUTH_INVALID_TOKEN`, and a short token gives 400 (S11, S12). The message is generic and no reason leaks. |
| AUTH-15 | Google sign-in rules: verified email, provider `google.com` only, links only to an unlinked account with that exact email, account must allow Google | Code review | PASS | google-sign-in.ts:57-88 |
| AUTH-16 | Google sign-in end to end | – | BLOCKED | Needs a real Google account and the Firebase popup, and Firebase Admin is not configured on this server. |
| AUTH-17 | Password start: malformed JSON, wrong content type, empty body | HTTP | PASS | Each gives 400 with the generic `AUTH_INVALID_CREDENTIALS` message (S1-S3). No stack trace. |
| AUTH-18 | Same message for unknown user, Google-only user and inactive user | HTTP | PASS | S4-S6: all 401 with the same body. |
| AUTH-19 | Response time doesn't reveal whether a User ID exists | HTTP | FAIL | An unknown ID takes about 54-81 ms. An existing account with no password hash (every Google-only user) takes about 21-41 ms. Seen in two runs of 5 pairs on two datasets. **SEC-01** |
| AUTH-20 | SQL-like User ID | HTTP | PASS | S7: `' OR 1=1 -- ` gives the generic 401. Queries are parameterised. |
| AUTH-21 | WhatsApp OTP sent after the correct password | – | BLOCKED | WhatsApp (CEOITBox) is not configured, and no password-method user with a known password exists. |
| AUTH-22 | OTP verify: unknown or garbage challenge, non-numeric code | HTTP | PASS | Unknown challenge gives 410 `AUTH_CHALLENGE_EXPIRED` (S8). `code:"abc"` gives 400 (S9). |
| AUTH-23 | OTP wrong code, attempt limit, "N tries left", lock after max attempts | Code review | PASS | otp-flow.ts:105-123 claims an attempt atomically before comparing (`reserveChallengeAttempt`) and refuses even a right code after the limit. Codes are stored as HMAC (otp.ts:16-22). Runtime is BLOCKED because no challenge can be issued. |
| AUTH-24 | Expired OTP | Code review | PASS | `loadOpenChallenge` refuses when `secondsUntilExpiry <= 0` (otp-flow.ts:93-99). Default TTL is 300 s (otp.ts:7). Runtime BLOCKED (no challenge). |
| AUTH-25 | Resend OTP: garbage token, cooldown, hourly cap | HTTP + code review | PARTIAL | A garbage token gives 410 (S10). The 30 s cooldown and the 5-per-hour cap are in otp-flow.ts:49-56, and the old challenge is used up on resend (password-sign-in.ts:141-143). Cooldown and cap BLOCKED at runtime. |
| AUTH-26 | Forgot password start answers the same for unknown and Google-only IDs | HTTP | PASS | S13/S14: both 200 with a `challengeToken` and `expiresInSeconds:300`, in 24 ms and 22 ms. The real send is deferred until after the response (set-password.ts:193-208). |
| AUTH-27 | Forgot password complete: wrong or unissued code, weak password | HTTP | PASS | S15: 401 with the single message "That code isn't right or has expired…". S16: 400 `AUTH_PASSWORD_POLICY` "Use at least 10 characters". |
| AUTH-28 | Set-password with an invalid or used link | HTTP | PASS | S17/S18: 410 `AUTH_LINK_INVALID`. S19: the page with a garbage token renders (200) without account details. |
| AUTH-29 | Set or reset password end to end (link, OTP, new password, sign-in) | – | BLOCKED | Needs the WhatsApp OTP. |
| AUTH-30 | A new password ends every other session | Code review | PASS | set-password.ts:51-58 sets the hash, uses up the token, revokes all sessions and writes the audit row in one transaction. |
| AUTH-31 | Account lockout after N wrong passwords; "locked" shown only to someone who knows the password | Code review | PASS | password-sign-in.ts:97-115. The atomic counter and lock are in users.repository.ts:129-143. A Google-only or inactive account never gets a lock counter. HTTP NOT TESTED on purpose: it would lock a shared test account. |
| AUTH-32 | Sign-in rate limit (20 per IP per 15 min; 10 per login per 15 min) | HTTP | PASS | 20 attempts from one IP gave 401, the 21st and 22nd gave 429 `AUTH_RATE_LIMITED` (auth_signin_probes RL1). rate-limit.ts:17-29 |
| AUTH-33 | Client IP used for limits can't be chosen by the caller | HTTP + code review | PARTIAL | Changing `X-Forwarded-For` to another address gives a fresh bucket (RL2: 401 again). Without Cloudflare, the right-most XFF entry is trusted (client-ip.ts:13-18). `CF-Connecting-IP` is trusted from any caller (CF probe: the header alone selected the exhausted bucket and got 429). This is safe only behind Cloudflare with `ORIGIN_SECRET` set (middleware.ts:61-64). With no IP at all, every caller shares one `…:unknown` bucket (rate-limit.ts:36). Risk R-AUTH-1. |
| AUTH-34 | Cross-site POST to the auth API is refused | HTTP | PASS | S20 with `Sec-Fetch-Site: cross-site` gives 403 `FORBIDDEN` (middleware.ts:76-81). |
| AUTH-35 | Session cookie flags | HTTP + code review | PASS | `HttpOnly; Secure; SameSite=lax; Path=/` seen on the clearing cookie (A15). Set with the same flags and `Max-Age=43200` (server/auth/http.ts:11-29). The device cookie is HMAC-signed, so a forged one is ignored (token.ts:91-110). |
| AUTH-36 | New session id at every sign-in (no fixation); roles are not in the token | Code review | PASS | complete-sign-in.ts:100-108 (`randomUUID`). The token carries only `sid, uid, iat, exp` (token.ts:9-14). Roles and active flag are re-read on every request (session.ts:63-100). |
| AUTH-37 | "This wasn't me" link | HTTP + code review | PASS | A garbage token gives 400 `INVALID_LINK` (A29). The confirm page renders on GET (A28) and only the POST acts. The link is single-use (`claimSecurityLink`) and ends every session and locks the account (session.ts:140-176). |
| AUTH-38 | Try-as link and view-only session | HTTP + code review | PARTIAL | A garbage link gives 303 to `/try?reason=EXPIRED` (A27). The rules are in code: refused while signed in, single use, 5-minute link, 1-hour session, and writes refused centrally (try-as.ts:27-62, session.ts:72-80). Creating a real link needs the admin Server Action and was not exercised. |
| AUTH-39 | Keep-alive and status for an anonymous caller | HTTP | PASS | Keep-alive gives 401 `{"signedIn":false}` (A6). Status gives `signedIn:false, reason:null` and nothing about who (A5). |
| AUTH-40 | Break-glass account only inside its window | Code review | PASS | sign-in-rules.ts:15 and session.ts:65 (checked again on every request). |
| AUTH-41 | Passwords hashed with scrypt; OTP and challenge tokens stored keyed-hashed | Code review | PASS | password.ts:24-38 (N=16384, r=8, p=1, 16-byte salt, timingSafeEqual). hashing.ts:8-17 |

**Status counts (41 checks):** PASS 32 (8 of them by code review only, marked "Code review") · FAIL 1 · PARTIAL 5 · BLOCKED 3 · NOT TESTED 0 · NOT APPLICABLE 0. The runtime parts of AUTH-23 and AUTH-24 are BLOCKED and their code review passed. AUTH-31 was deliberately not run over HTTP.

## 3. Risks and recommendations (not defects)

- **R-AUTH-1 (IP trust).** Per-IP limits rely on the deployment.
  - Keep `ORIGIN_SECRET` set in production, so `CF-Connecting-IP` can't be forged by calling the origin directly.
  - Consider trusting `CF-Connecting-IP` only when the `x-ars-origin` check passed.
  - Consider refusing, or keying separately, requests where no IP could be found, so one shared `unknown` bucket can't lock everyone out of sign-in.
- **R-AUTH-2.** The forgot-password flow is allowed for a temporarily locked (wrong-password) account; only the security lock is refused (set-password.ts:69-73). This is reasonable, because WhatsApp ownership is proven. The owner should be aware of it.
- **R-AUTH-3.** `/api/auth/status` tells a holder of a correctly signed cookie why it ended (deactivated or locked). This is acceptable because only the cookie's owner can ask.

## 4. Defects

| Defect ID | Module | Feature | Category | Description | Expected | Actual | Severity | Priority | Reproduction | Evidence | Root cause | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SEC-01 | Authentication | User ID + password sign-in | Security (user enumeration) | `POST /api/auth/password/start` answers faster for an existing account with no password hash (every Google-only user) than for an unknown User ID. Anyone can therefore tell which User IDs exist, which the code explicitly tries to prevent. | The same response time whether or not the User ID exists (comment at password.ts:40-46). | Unknown ID about 54-81 ms. Existing Google-only ID about 21-41 ms. Same 401 body. | Low | P2 | Send 5 pairs of `{"loginId":<unknown>,"password":"Wrong12345"}` and `{"loginId":<a Google-only user>,…}` and compare `time_total`. | `TEST_EVIDENCE/SEC/auth_timing_enumeration.txt` (two runs) | password-sign-in.ts:104 calls `verifyPassword(password, user.passwordHash)`. With a null hash this returns at once (password.ts:31) and runs no scrypt. The unknown-user branch runs `burnPasswordCheck` (scrypt), and so does the locked branch. | When `passwordHash` is null, call `burnPasswordCheck(password)` (or always run one scrypt) before refusing, so every branch costs one scrypt. Add a unit test that every branch calls scrypt exactly once. | Open |
