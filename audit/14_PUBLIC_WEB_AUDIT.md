# 14. Public web audit (OPS)

| | |
|---|---|
| Target | ARS-CMS v1.39.0, commit `0473f2560398844f875a3bec49206e13078d06d7` |
| Server | `http://localhost:3100`. **Note O-1** (see 16): `/api/health` on this server reports `version 1.38.0`. Its `.next` build predates the v1.39.0 commit. |
| Scope | Public pages only: `app/page.tsx`, `app/(public)/*` (login, privacy, terms, forgot-password, set-password, signed-out, security/not-me), `/try`, `app/manifest.ts`, robots, sitemap, favicon, 404 and redirects |
| Date | 31 Oct 2026 |
| Evidence | `audit/TEST_EVIDENCE/OPS/public-web-curl.txt`, `public-web-404.txt`, `public-web-signed-in.txt`, `curl-health-jobs.txt`, `curl-prod-login-headers.txt` |

## 1. Method

- **Code review:**
  - `app/layout.tsx` (root metadata);
  - `app/page.tsx`, each `app/(public)/**/page.tsx` metadata block, `app/manifest.ts`, `app/not-found.tsx`;
  - `middleware.ts` (public prefixes, the redirect for visitors without a session, static files).
- **`curl` against localhost**, extracting the status, redirect target, `<title>`, `meta name="description"`, `meta name="robots"`, the `X-Robots-Tag` header, `link rel="canonical"` and `og:*` tags:
  1. 19 paths with no cookie;
  2. 4 paths with a deliberately **invalid** cookie `ars_session=invalid.invalid`, to reach the not-found rendering past the middleware (the middleware only checks that the cookie is present).
- **Signed-in redirects** were planned with the audit session helper. It failed on every attempt: "no test user E2E_REQ" (and the same for E2E_SUPER, ADMIN, MGR and STAFF). The seeded users were not in `ars_approvals_test` at the time. Those checks are NOT TESTED.
- **Production:** only the single HEAD to `/login` allowed by the brief.

## 2. Results

| Path (no cookie) | Status | `<title>` | robots meta | Canonical | OG tags |
|---|---|---|---|---|---|
| `/` | 200 | `ARS-CMS \| ARS Steels` | `index, follow` | none | 0 |
| `/login` | 200 | `Sign in · ARS-CMS` | `noindex, nofollow` | none | 0 |
| `/privacy` | 200 | `Privacy policy · ARS-CMS` | `index, follow` | none | 0 |
| `/terms` | 200 | `Terms of use · ARS-CMS` | `index, follow` | none | 0 |
| `/forgot-password` | 200 | `Forgot password · ARS-CMS` | `noindex, nofollow` | none | 0 |
| `/set-password` | 200 | `Set your password · ARS-CMS` (`referrer: no-referrer`) | `noindex, nofollow` | none | 0 |
| `/signed-out` | 200 | `Signed out · ARS-CMS` | `noindex, nofollow` | none | 0 |
| `/security/not-me` | 200 | `Secure your account · ARS-CMS` | `noindex, nofollow` | none | 0 |
| `/try` | 200 | `Try as · ARS-CMS` | `noindex, nofollow` | none | 0 |
| `/manifest.webmanifest` | 200 (553 bytes) | — | — | — | — |
| `/favicon.ico` | 200 (2739 bytes) | — | — | — | — |
| `/robots.txt` | **307 → `/login?next=%2Frobots.txt`** | — | — | — | — |
| `/sitemap.xml` | 307 → `/login?next=%2Fsitemap.xml` | — | — | — | — |
| `/this-page-does-not-exist` | 307 → `/login?next=…` | — | — | — | — |
| `/users`, `/admin`, `/superadmin`, `/users/requests` | 307 → `/login?next=…` | — | — | — | — |
| `/api/does-not-exist` | 404 JSON (69 bytes) | — | — | — | — |

**Meta descriptions:**
- `/`, `/privacy` and `/terms` have page-specific descriptions (`app/page.tsx:9`, `privacy/page.tsx:8`, `terms/page.tsx:8`).
- The other public pages inherit the root description (`app/layout.tsx:18`), which is acceptable for noindex pages.

**Indexing policy:**
- The root layout sets `robots: { index: false, follow: false }` (`app/layout.tsx:19`), so every page is noindex unless it opts in.
- Only `/`, `/privacy` and `/terms` opt in. These are needed for the Google OAuth verification described in `docs/DOMAIN-MIGRATION.md`.
- Private pages are never served to visitors without a session (`middleware.ts:108-114`).

**404 handling** (`public-web-404.txt`, with the invalid cookie):
- `/this-page-does-not-exist`, `/users/zzz` and `/robots.txt` return **404** with `<meta name="robots" content="noindex">` and the heading "This page isn't available" (`app/not-found.tsx`).
- `/admin` and `/superadmin` instead return **307 → `/signed-out?reason=unknown&next=/admin`**. The streamed redirect body (9,685 bytes for `/superadmin`) still contains `<title>Super Admin · ARS-CMS</title>` (and `Admin overview · ARS-CMS` for `/admin`).
- So someone holding any cookie value can tell the private areas from non-existent paths. This contradicts the intent stated in `app/not-found.tsx:3-4` ("so those areas don't confirm they exist", D-016).

**Manifest** (`app/manifest.ts`):
- name `ARS-CMS · Central Management System`, `start_url /users`, `display standalone`;
- three PNG icons (192, 512, maskable 512) and theme colour `#003B6E`.

**Security headers on public pages** (local and production):
- CSP with a nonce, `frame-ancestors 'none'`, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`;
- `Cache-Control: private, no-store` on pages (`curl-health-jobs.txt`, `curl-prod-login-headers.txt`).

**Redirects:**
- `/` with a valid session → `/users` (`app/page.tsx:20`), and `/login` with a session → `next` (`login/page.tsx:13`). Both are code review only: there was no valid session (see Method).
- Anonymous private paths → `/login?next=<path>` (`middleware.ts:112-114`), and `next` is sanitised by `safeNextPath` (`lib/http/safe-next.ts`).

## 3. Checks

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| PW-01 | Landing page title, description, indexable | curl `/` | PASS | `public-web-curl.txt`: 200, `ARS-CMS \| ARS Steels`, page description, `index, follow` |
| PW-02 | `/login` title, noindex | curl | PASS | 200, `Sign in · ARS-CMS`, `noindex, nofollow` |
| PW-03 | `/privacy` present, titled, described, indexable | curl | PASS | 200, `Privacy policy · ARS-CMS`, its own description |
| PW-04 | `/terms` present, titled, described, indexable | curl | PASS | 200, `Terms of use · ARS-CMS`, its own description |
| PW-05 | Auth helper pages noindex | curl the 5 pages | PASS | forgot-password, set-password, signed-out, security/not-me and try: all `noindex, nofollow` |
| PW-06 | Private routes not indexable | code review and curl | PASS | Root `robots: noindex` (`app/layout.tsx:19`); anonymous visitors are redirected to `/login` (`middleware.ts:108-114`); the 404 page is `noindex` |
| PW-07 | Canonical URL on indexable pages | curl | FAIL | No `link rel="canonical"` on `/`, `/privacy`, `/terms`; no `metadataBase` → OPS-19 |
| PW-08 | Open Graph and social meta | curl | FAIL | 0 `og:*` tags on any public page → OPS-19 |
| PW-09 | `robots.txt` served | curl `/robots.txt` | FAIL | 307 → `/login?next=%2Frobots.txt` → OPS-18 |
| PW-10 | `sitemap.xml` | curl | NOT APPLICABLE | No sitemap. With 3 indexable pages for an internal app a sitemap is optional (it currently redirects to `/login`, as part of OPS-18). |
| PW-11 | Web app manifest | curl and code review | PASS | 200, 553 bytes; `app/manifest.ts` |
| PW-12 | Favicon and icons | curl | PASS | `/favicon.ico` 200; icons declared in `app/layout.tsx:22-30` |
| PW-13 | 404 page for unknown paths | curl with any cookie | PASS | 404, `noindex`, "This page isn't available" (`public-web-404.txt`). Anonymous visitors are sent to `/login` by design. |
| PW-14 | Anonymous redirects preserve the target safely | curl and code review | PASS | 307 `/login?next=%2Fusers%2Frequests`; `safeNextPath` |
| PW-15 | Signed-in redirects (`/` → `/users`, `/login` → next, wrong role → 404) | session helper | NOT TESTED | The helper failed: "no test user E2E_REQ" (`public-web-signed-in.txt`); code review only: `app/page.tsx:20`, `login/page.tsx:13` |
| PW-16 | Private areas indistinguishable from missing pages (D-016) | curl with an invalid cookie | FAIL | `/superadmin` returns 307 with `<title>Super Admin · ARS-CMS</title>` in the body; unknown paths return 404 → OPS-20 |
| PW-17 | Security headers on public pages | curl `-i` | PASS | CSP, HSTS, XFO DENY, nosniff, Referrer-Policy, Permissions-Policy (`curl-health-jobs.txt`) |
| PW-18 | Production `/login` served over valid TLS with headers | one `curl -sI` | PASS | 200 via Cloudflare; the same header set (`curl-prod-login-headers.txt`) |

**Totals:** 18 checks: 12 PASS, 0 PARTIAL, 4 FAIL, 1 NOT TESTED, 0 BLOCKED, 1 NOT APPLICABLE.

## 4. Recommendations (not defects)

- **R-PW-1, page-specific descriptions for noindex pages.** Optional: these pages are not indexed.
- **R-PW-2, retest PW-15 once the seeded users exist again.** In particular, check that a plain user gets 404 at `/admin` (DEPLOYMENT Part L).

## 5. Defects

| Defect ID | Module | Feature | Category | Description | Expected | Actual | Severity | Priority | Reproduction | Evidence | Root cause | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| OPS-18 | Public web | robots.txt | SEO / crawler hygiene | `/robots.txt` is not served; crawlers are redirected to the sign-in page. | `200 text/plain` with rules (e.g. allow `/`, `/privacy`, `/terms`; disallow `/users`, `/admin`, `/superadmin`, `/api`). | `GET /robots.txt` → `307 Location: /login?next=%2Frobots.txt`. `middleware.ts:29` lists `/robots.txt` as a static file, but no `app/robots.ts` or `public/robots.txt` exists, and the session check (`middleware.ts:108`) does not exempt it. `/sitemap.xml` behaves the same. | Low | P3 | `curl -i http://localhost:3100/robots.txt` | `audit/TEST_EVIDENCE/OPS/public-web-curl.txt` | No robots file was created; `STATIC_FILES` only affects caching, not the public-path check | Add `app/robots.ts` and include `/robots.txt` (and `/sitemap.xml` if added) in `PUBLIC_PREFIXES`. | Open |
| OPS-19 | Public web | Landing, privacy, terms | SEO / sharing metadata | Indexable pages have no canonical URL and no Open Graph tags. | `link rel="canonical"` (with `metadataBase` = APP_BASE_URL) and basic `og:title`, `og:description`, `og:url`, `og:image` on `/`, `/privacy` and `/terms`. | None on any public page. Links shared on WhatsApp or email show no preview, and `approval.arssteels.net` vs any legacy host has no canonical. | Low | P3 | `curl -s http://localhost:3100/ \| grep -E 'canonical\|og:'` (no output) | `audit/TEST_EVIDENCE/OPS/public-web-curl.txt` | Not configured in `app/layout.tsx` metadata | Set `metadataBase`, `alternates.canonical` and `openGraph` in `app/layout.tsx` and the three pages. | Open |
| OPS-20 | Public web / access control | 404 for private areas | Information disclosure | With any session cookie (even an invalid one), `/admin` and `/superadmin` reveal that they exist, while unknown paths give 404. | The same 404 response for "no access" as for "does not exist" (D-016, `app/not-found.tsx:3-4`). | `curl -H "Cookie: ars_session=invalid.invalid" /superadmin` → `307 /signed-out?reason=unknown&next=/superadmin`, body contains `<title>Super Admin · ARS-CMS</title>`. `/this-page-does-not-exist` → 404. | Low | P3 | As shown, against `http://localhost:3100` | `audit/TEST_EVIDENCE/OPS/public-web-404.txt` | The area layout's metadata is streamed before its session check redirects | Treat an invalid session at area level as not-found (or redirect in middleware before rendering), and avoid area-specific titles in the redirect stream. Hand this to the security auditor for a cross-check. | Open |
