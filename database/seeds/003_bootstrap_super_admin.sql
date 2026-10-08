-- First account so someone can sign in and create everyone else (D-003,
-- D-041, D-082). Signs in with Google as itsupport@arsenergy.co.in;
-- firebase_uid links on the first sign-in. Runs on every start, so it only
-- CREATES the account and never changes an existing one (an admin's later
-- edits must survive restarts). The break-glass account is created
-- separately by the server-side script (P1-36), never by a seed.
INSERT INTO users (login_id, name, email, sign_in_method, active)
VALUES ('itadmin', 'IT Admin (Super Admin)', 'itsupport@arsenergy.co.in', 'GOOGLE', TRUE)
ON DUPLICATE KEY UPDATE login_id = login_id;

INSERT IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u JOIN roles r ON r.code IN ('SUPER_ADMIN', 'IT_ADMIN', 'USER')
WHERE u.login_id = 'itadmin';
