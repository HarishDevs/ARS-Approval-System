-- v1.50.1 (owner): task priorities are Critical, Most Important, Important and
-- Normal. The stored codes stay (URGENT = Critical, HIGH = Most Important,
-- NORMAL = Normal) and IMPORTANT is added between NORMAL and HIGH. LOW stays
-- for older tasks. Additive: no row changes, and older code never writes IMPORTANT.
-- Rollback (after rolling the code back):
--   UPDATE tasks SET priority = 'NORMAL' WHERE priority = 'IMPORTANT';
--   ALTER TABLE tasks MODIFY priority ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL';
ALTER TABLE tasks
  MODIFY priority ENUM('LOW', 'NORMAL', 'IMPORTANT', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL';
