-- v1.54.7 (owner: Google Workspace moved people from arsenergy.co.in to
-- arssteels.co.in; the old address stays as an alias). Google's "sub" is the
-- Google account's permanent id: it does not change when the primary email
-- changes. It is kept with the account at Google sign-in so the same Google
-- account is always recognised, even if its Firebase link has to be redone.
-- Additive. The app works before this runs (the sub is then simply not kept).
-- Rollback (after rolling the code back): ALTER TABLE users DROP INDEX uq_users_google_sub, DROP COLUMN google_sub;
ALTER TABLE users
  ADD COLUMN google_sub VARCHAR(64) NULL COMMENT 'Google account id (sub); kept at Google sign-in' AFTER firebase_uid,
  ADD CONSTRAINT uq_users_google_sub UNIQUE (google_sub);
