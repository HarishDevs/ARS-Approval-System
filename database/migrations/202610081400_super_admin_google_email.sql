-- D-082: the Super Admin signs in with Google as itsupport@arsenergy.co.in.
-- itadmin@arssteels.co.in is only an alias (of arunram@arssteels.co.in), and
-- Google reports the primary address, so it could never match. Changes the
-- bootstrap account once, only if it was never linked to a Google account.
UPDATE users
SET email = 'itsupport@arsenergy.co.in'
WHERE login_id = 'itadmin' AND email = 'itadmin@arssteels.co.in' AND firebase_uid IS NULL
  AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM users WHERE LOWER(email) = 'itsupport@arsenergy.co.in') AS taken);
