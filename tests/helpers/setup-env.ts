// Test-only values. Never real secrets.
process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3307";
process.env.DB_NAME ??= "ars_approvals_test";
process.env.DB_USER ??= "test";
process.env.DB_PASSWORD ??= "test";
process.env.SESSION_SECRET ??= "test-session-secret-that-is-at-least-32-characters-long";
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
