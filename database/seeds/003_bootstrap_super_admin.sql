-- First account so someone can sign in and create everyone else (D-003,
-- D-041). Signs in with Google; firebase_uid links on the first sign-in.
-- Idempotent. The break-glass account is created separately by the
-- server-side script (P1-36), never by a seed.
INSERT INTO users (login_id, name, email, sign_in_method, active)
VALUES ('itadmin', 'IT Admin (Super Admin)', 'itadmin@arssteels.co.in', 'GOOGLE', TRUE)
ON DUPLICATE KEY UPDATE email = VALUES(email);

INSERT IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u JOIN roles r ON r.code IN ('SUPER_ADMIN', 'IT_ADMIN', 'USER')
WHERE u.email = 'itadmin@arssteels.co.in';
