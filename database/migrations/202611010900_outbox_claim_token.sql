-- D-243 (audit DB-014): no duplicate sends from the notification outbox.
-- A sender claims a row with its own token before it calls the providers.
-- A claimed, unsent row means "sending, or stopped mid-send": it is never
-- taken again by itself (it may already have been delivered); IT checks it
-- under Messages not sent and uses Resend. A sender that knows nothing went
-- out (e.g. the database was busy) gives its claim back with the token.
-- Additive: existing rows get NULL, and older code never reads the column.
-- Rollback: ALTER TABLE notification_outbox DROP COLUMN claim_token;
ALTER TABLE notification_outbox
  ADD COLUMN claim_token CHAR(36) NULL COMMENT 'the current sender''s claim (D-243)' AFTER claimed_at;
