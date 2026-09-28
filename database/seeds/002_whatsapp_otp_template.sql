-- Login OTP reuses the Power BI website's Meta-approved Authentication
-- template "wa_login_otp_v1" on the same CEOITBox number (D-036, D-042).
-- It is already approved, so it is seeded ACTIVE/APPROVED. Notification
-- templates are added when the owner supplies them (Q-013).
INSERT INTO whatsapp_templates (template_code, event_type, provider_name, language, version, status, approval_status)
VALUES ('WA_LOGIN_OTP_V1', 'OTP_LOGIN', 'wa_login_otp_v1', 'en', 1, 'ACTIVE', 'APPROVED')
ON DUPLICATE KEY UPDATE provider_name = VALUES(provider_name);

INSERT IGNORE INTO whatsapp_template_variables (template_id, position, variable_key, display_name)
SELECT id, 1, 'otp_code', 'OTP code' FROM whatsapp_templates WHERE template_code = 'WA_LOGIN_OTP_V1';
