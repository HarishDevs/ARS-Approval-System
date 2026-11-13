# Google sign-in after the Workspace domain move (v1.54.7, 13 Nov 2026)

The owner confirmed in Google Admin that people were moved from `arsenergy.co.in` to `arssteels.co.in`. The new address is now their primary email, and the old one stays as an alias of the same Google account. For example, Babulal: primary `babulal@arssteels.co.in`, alias `babulal@arsenergy.co.in`, employee ID 7182, active, OU arssteels.co.in.

## 1. Diagnostic values

**No production values were observed.** This investigation had no access to the live database, the live logs or a real sign-in. Any value written here would be invented, so the table says where each value comes from and how to read it. Nothing in production was changed.

| Diagnostic field | Actual value | Where it comes from / how to read it |
|---|---|---|
| Google primary email claim | Not observed. Per Google Admin it should be `babulal@arssteels.co.in` | The Firebase ID token's `email`, verified on the server. After deploy, Sign-in history shows it masked: `ba***@arssteels.co.in` |
| Google email_verified | Not observed. Always true for a Workspace account | The token's `email_verified`. False gives the reason `EMAIL_NOT_VERIFIED` |
| Google sub | Not observed | The token's `firebase.identities["google.com"][0]`. It is stored from now on in `users.google_sub`; logs show only `subRef` (first 10 hex characters of its SHA-256) |
| Google hd | **Not available** | Firebase ID tokens do not carry `hd`. The browser could read it, but that value isn't verified, so it is not used for any decision. The verified email's domain serves the same purpose |
| Existing CMS user ID | Not observed | Run query A below |
| Existing CMS email | Not observed. Most likely the old `babulal@arsenergy.co.in` | Run query A below |
| Existing Google provider ID | Not observed | `users.firebase_uid` (query A). NULL means "never signed in with Google yet" |
| Account lookup result | Before v1.54.7: no match. From v1.54.7: matched by moved-domain email (see §3) | Sign-in history / server log `google sign-in lookup` with `found` = UID, SUB, EMAIL, MOVED_EMAIL or NONE |
| Reason for authentication failure | **Confirmed from the code; to be confirmed per person from Sign-in history** | `UNKNOWN_ACCOUNT ba***@arssteels.co.in` (see §2) |

Query A (read-only; owner or IT runs it in phpMyAdmin; it changes nothing):

```sql
SELECT id, login_id, name, email, sign_in_method, active,
       firebase_uid IS NOT NULL AS google_linked, last_login_at
FROM users
WHERE email LIKE 'babulal@%';
```

## 2. Root cause (confirmed in the code)

Before v1.54.7, `server/auth/google-sign-in.ts` found a person in two ways:
1. by `firebase_uid`, for an account already linked by an earlier Google sign-in;
2. by **exact email**, for a first-time link, and only for an account never linked before.

Google now reports the **new primary** (`@arssteels.co.in`). Anyone whose ARS CMS account was registered with the **old** address and had **never signed in with Google before** matched neither way, so the server refused them with `UNKNOWN_ACCOUNT` (HTTP 403).

Who is affected:
- **People already linked** (they signed in with Google before the move) are not affected. Google's account id (`sub`) and so the Firebase uid don't change when the primary email changes, so the uid lookup still finds them.
- **People never linked, with an old-domain email in ARS CMS** fail. This explains "some users".

Other checks:
- **Hardcoded `arsenergy.co.in`:** the code has no domain restriction. The domain appears only in two SQL files: the bootstrap Super Admin seed and the D-082 migration (`itsupport@arsenergy.co.in`). Neither limits sign-in by domain.
- **`login_hint` / OAuth parameters:** none are sent apart from `prompt=select_account` (`lib/firebase/client.ts`). There is no `hd` and no `login_hint`, so the person can pick any account and nothing pre-fills the old address.
- **Provider account-linking table:** none exists. The link is the `users.firebase_uid` column, which is unique.
- **Successful vs failed attempts:** both return a verified token with `@arssteels.co.in`. The difference is whether the account was already linked (uid match) or not (email match against the old address).

## 3. The fix

How the account is found now, in order:
1. **Firebase uid** (as before).
2. **Google sub** (new). If the same Google account comes back with a new Firebase uid (for example, its Firebase user was recreated), the account holding that `google_sub` is relinked. The move is audited as `GOOGLE_ACCOUNT_RELINKED`.
3. **Exact email**: the token's email and every email Firebase lists for the identity, for an unlinked account only (as before).
4. **The same mailbox on the other side of the domain move** (new): `babulal@arssteels.co.in` ↔ `babulal@arsenergy.co.in`. This also applies only to an unlinked account. The exact email always wins, so two accounts are never merged or duplicated. The link is audited as `GOOGLE_ACCOUNT_LINKED` with `matchedBy: "email domain move"`.

After the account is found:
- **The Google sub is kept** (`users.google_sub`, unique).
- **The email follows Google's primary.** When the same Google account reports a different primary email, `users.email` is updated to it. This is audited as `USER_EMAIL_UPDATED_FROM_GOOGLE` (old and new masked). The update is skipped:
  - if another account already uses that email (the old one is kept and a log line is written);
  - if the new address is on the retired domain (a stale Google profile never moves an account back).
- **Only the email column changes.** The user id, User ID (employee code), roles, module access, approvals, tasks and all history stay as they are.

What did not change:
- **No account is ever created.**
- **No access is granted by domain.** The domain mapping only finds an account IT already created, and `checkSignInAllowed` (active, Google allowed, not locked, break-glass rules) still decides.
- **An account already linked to another Google identity is never taken over.**

The mapping lives in `config/email-domains.ts` (`EMAIL_DOMAIN_MOVES`), so another move can be added there.

**Safe diagnostics:** the server log line `google sign-in lookup` records `found`, the email domain, the masked email, `subRef` and the user id. It never records a token, the full email or the sub. Sign-in history keeps the reason and the masked email as in v1.54.6.

## 4. Database change (owner runs it; additive)

`database/migrations/202611131000_users_google_sub.sql` adds `users.google_sub VARCHAR(64) NULL UNIQUE`.
- **Before it runs,** the app works as before: the sub is simply not kept, and the sub lookup returns nothing.
- **Rollback:** `ALTER TABLE users DROP INDEX uq_users_google_sub, DROP COLUMN google_sub;`
- **Back up first** (the usual cPanel/phpMyAdmin export of `users`).

No production row is edited by hand. The email update happens only when the person signs in, and it is audited.

## 5. Acceptance

Babulal (and every moved employee) signs in with `babulal@arssteels.co.in`. The existing account (same id, employee ID 7182, roles, history) is found through the moved-domain email, linked, and its email becomes `babulal@arssteels.co.in`. Later sign-ins match by Firebase uid and Google sub.

Check after deploy in Super Admin → Sign-in history (success), and in the audit log (`GOOGLE_ACCOUNT_LINKED` with `matchedBy: email domain move`, then `USER_EMAIL_UPDATED_FROM_GOOGLE`).

## 6. Tests

`tests/auth/google-domain-move.test.ts` (10) covers:
- the old-domain account is linked, keeps its id and takes the new email;
- an exact match beats a moved-domain match;
- a linked account signs in and its email is refreshed;
- relinking by sub;
- no move back onto the retired domain;
- an email already taken by another account is left alone;
- the domain alone grants nothing;
- an inactive or password-only account is still refused;
- an account already linked elsewhere is not taken over.

The existing `tests/auth/google-provider.test.ts` still passes.

Nothing in Google Workspace needs to change. Keep the old aliases: they are what makes the old address the same mailbox.
