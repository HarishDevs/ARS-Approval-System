-- D-208 (owner): a person may be allowed both sign-in methods (Google, or
-- User ID + password + WhatsApp code). Additive: a new enum value; existing
-- users keep their method.
ALTER TABLE users MODIFY sign_in_method ENUM('GOOGLE', 'PASSWORD', 'BOTH') NOT NULL DEFAULT 'GOOGLE';
