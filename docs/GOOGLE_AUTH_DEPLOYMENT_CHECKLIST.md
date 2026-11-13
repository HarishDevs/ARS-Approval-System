# Google sign-in: deployment checklist (v1.54.6)

## 1. Production environment (GoDaddy → Node.js app → Environment variables)
Check that these are present (do not copy the values anywhere):
- [ ] `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` (`power-bi-dashboard-3b29f.firebaseapp.com`), `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`
- [ ] The Firebase Admin service-account variables used by `lib/firebase/admin.ts`
- [ ] `SESSION_SECRET`
- [ ] `APP_BASE_URL` = `https://approval.arssteels.net` (https, no trailing slash)
- [ ] `LEGACY_HOSTS` empty (D-199)
- [ ] `ORIGIN_SECRET`, matching the Cloudflare Transform Rule header `x-ars-origin`

## 2. Firebase console (project power-bi-dashboard-3b29f → Authentication)
- [ ] Sign-in method: **Google** enabled.
- [ ] Settings → **Authorized domains** include `approval.arssteels.net`. Without it the popup fails with "Google sign-in isn't enabled for this web address".

## 3. Google Cloud console (same project → APIs & Services)
- [ ] OAuth consent screen: **External**, **Published** (Q-024), app name "ARS CMS" (Q-027).
- [ ] The OAuth client's authorized redirect URI includes `https://power-bi-dashboard-3b29f.firebaseapp.com/__/auth/handler` (Firebase's own handler; the app has no redirect URI of its own).
- [ ] Google Workspace accounts: if a Workspace admin restricts third-party apps, its users see Google's "access blocked". Their Workspace admin must allow the app.

## 4. Deploy
- [ ] Publish v1.54.6 (no migration). Rollback: publish v1.54.5.

## 5. After deploying
1. Ask one person who **could** sign in, and one who **couldn't**, to try Continue with Google.
2. Super Admin → **Sign-in history**: the failing attempt shows a reason code and a masked email. Then:

   | Reason | Fix |
   |---|---|
   | `UNKNOWN_ACCOUNT ra***@gmail.com` | The Google account they chose isn't the email in their ARS-CMS record. Either they choose the right Google account, or IT changes their email in Admin → Users to the Google account they use. |
   | `LINKED_ELSEWHERE` | Their account is linked to another Google identity. IT edits the user and saves a corrected email (that unlinks Google), then they sign in again. |
   | `INACTIVE` | IT activates the account if they should have access. |
   | `WRONG_METHOD` | Their sign-in method is "User ID + password". IT sets "Google" or "Both". |
   | `EMAIL_NOT_VERIFIED` / `NOT_GOOGLE_PROVIDER` | They must use a verified Google account. |
3. The person's screen shows the same reason in words, plus "Reference for IT: …". That reference matches the `auth.google` line in the GoDaddy log.
4. Popup problems (blocked pop-ups, unauthorized domain, blocked storage) appear in the log as `auth.google` with stage `BROWSER_POPUP` and the code.
5. Check: logout works, protected pages still need sign-in, admins keep their access.
6. Try Chrome, Edge, Firefox, a phone browser and Incognito once each.
