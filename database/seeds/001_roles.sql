-- System roles (D-024, D-039). Idempotent.
INSERT INTO roles (code, name, description, is_system) VALUES
  ('SUPER_ADMIN', 'Super Admin', 'Everything, including /superadmin: providers, security, integrations, health, audit export.', TRUE),
  ('IT_ADMIN', 'IT Admin', '/admin: predefined approvals, forms, workflows, DoA, users and roles as granted.', TRUE),
  ('USER', 'User', '/users: requests, custom approvals, own approval queue.', TRUE),
  ('EXPORTER', 'Can export', 'v1.7.0 (A9): may download reports when downloads are limited to this role.', TRUE)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), is_system = TRUE;
