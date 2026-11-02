-- Owner decision, 2 Nov 2026 (PLAN-CHECKLIST "Shared condition builder"):
-- one condition editor and ONE saved rule shape everywhere. A form field's
-- "show only when" / "required when" (form_json[*].showIf / .requiredIf) moves
-- from the form designer's older shape { field, op, value } to the workflow
-- builder's shape (server/conditions/rule.ts):
--   FILLED -> { field, operator: "IS_NOT_EMPTY" }
--   EMPTY  -> { field, operator: "IS_EMPTY" }
--   NEQ    -> { match: "ALL", conditions: [ IS_NOT_EMPTY, NEQ value ] }
--             (the older "is not" was false while the field was blank)
--   EQ/GT/GTE/LT/LTE -> { field, operator, value }
--   value: a number once commas, spaces and the rupee sign are removed
--   (plain JSON number pattern) is stored as a number, otherwise as the text.
-- This is the same conversion as convertLegacyRule() (unit-tested in
-- tests/workflows/condition-rules.test.ts). The app also converts older rules
-- on every read, so the order of deploy and migration does not matter.
--
-- Idempotent: only rows whose form still holds an older rule ($[*].showIf.op
-- or $[*].requiredIf.op; the new shape never has "op") are touched, and inside
-- them only the older rules change. A re-run finds nothing to do. Field
-- order is kept (rebuilt by ordinality). updated_at is kept as it was.
--
-- Backup: before converting, each affected row's form_json is copied once to
-- condition_rules_backup (INSERT IGNORE on table + row id).
-- Rollback (only together with going back to v1.45.x or older code, which cannot read
-- the new shape: its custom-approval and task-type loaders would fall back to
-- the default/empty form). Rules saved after this migration are lost by it:
--   UPDATE workflow_versions w JOIN condition_rules_backup b ON b.table_name = 'workflow_versions' AND b.row_id = w.id SET w.form_json = b.form_json;
--   UPDATE module_type_versions m JOIN condition_rules_backup b ON b.table_name = 'module_type_versions' AND b.row_id = m.id SET m.form_json = b.form_json, m.updated_at = m.updated_at;
--   UPDATE custom_approval_settings c JOIN condition_rules_backup b ON b.table_name = 'custom_approval_settings' AND b.row_id = c.id SET c.form_json = b.form_json, c.updated_at = c.updated_at;
--   DELETE FROM schema_migrations WHERE filename = '202611021000_unify_condition_rules.sql';
-- The backup table can be dropped once the release is settled.

CREATE TABLE IF NOT EXISTS condition_rules_backup (
  table_name  VARCHAR(64)     NOT NULL,
  row_id      BIGINT UNSIGNED NOT NULL,
  form_json   JSON            NOT NULL,
  backed_up_at DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (table_name, row_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO condition_rules_backup (table_name, row_id, form_json)
SELECT 'workflow_versions', id, form_json FROM workflow_versions
WHERE JSON_CONTAINS_PATH(form_json, 'one', '$[*].showIf.op', '$[*].requiredIf.op');

INSERT IGNORE INTO condition_rules_backup (table_name, row_id, form_json)
SELECT 'module_type_versions', id, form_json FROM module_type_versions
WHERE JSON_CONTAINS_PATH(form_json, 'one', '$[*].showIf.op', '$[*].requiredIf.op');

INSERT IGNORE INTO condition_rules_backup (table_name, row_id, form_json)
SELECT 'custom_approval_settings', id, form_json FROM custom_approval_settings
WHERE JSON_CONTAINS_PATH(form_json, 'one', '$[*].showIf.op', '$[*].requiredIf.op');

-- workflow_versions: showIf
UPDATE /*+ SET_VAR(group_concat_max_len = 67108864) */ workflow_versions t
JOIN (
  SELECT x.id,
    CAST(CONCAT('[', GROUP_CONCAT(CAST(
      IF(j.r_op IN ('EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'FILLED', 'EMPTY') AND JSON_TYPE(JSON_EXTRACT(j.elem, '$.showIf.op')) = 'STRING' AND JSON_TYPE(JSON_EXTRACT(j.elem, '$.showIf.field')) = 'STRING' AND j.r_has_operator = 0 AND j.r_has_match = 0,
        JSON_SET(j.elem, '$.showIf', CAST((CASE j.r_op
          WHEN 'FILLED' THEN JSON_OBJECT('field', j.r_field, 'operator', 'IS_NOT_EMPTY')
          WHEN 'EMPTY' THEN JSON_OBJECT('field', j.r_field, 'operator', 'IS_EMPTY')
          WHEN 'NEQ' THEN JSON_OBJECT('match', 'ALL', 'conditions', JSON_ARRAY(
            JSON_OBJECT('field', j.r_field, 'operator', 'IS_NOT_EMPTY'),
            JSON_OBJECT('field', j.r_field, 'operator', 'NEQ', 'value', CAST(IF(REGEXP_LIKE(REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), '^-?(0|[1-9][0-9]*)([.][0-9]+)?$'), REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), JSON_QUOTE(COALESCE(j.r_value, ''))) AS JSON))))
          ELSE JSON_OBJECT('field', j.r_field, 'operator', j.r_op, 'value', CAST(IF(REGEXP_LIKE(REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), '^-?(0|[1-9][0-9]*)([.][0-9]+)?$'), REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), JSON_QUOTE(COALESCE(j.r_value, ''))) AS JSON))
        END) AS JSON)),
        j.elem) AS CHAR) ORDER BY j.idx SEPARATOR ','), ']') AS JSON) AS fixed
  FROM workflow_versions x,
  JSON_TABLE(x.form_json, '$[*]' COLUMNS (
    idx FOR ORDINALITY,
    elem JSON PATH '$',
    r_field VARCHAR(255) PATH '$.showIf.field',
    r_op VARCHAR(32) PATH '$.showIf.op',
    r_value VARCHAR(1000) PATH '$.showIf.value',
    r_has_operator INT EXISTS PATH '$.showIf.operator',
    r_has_match INT EXISTS PATH '$.showIf.match'
  )) j
  WHERE JSON_CONTAINS_PATH(x.form_json, 'one', '$[*].showIf.op')
  GROUP BY x.id
) f ON f.id = t.id
SET t.form_json = f.fixed;

-- workflow_versions: requiredIf
UPDATE /*+ SET_VAR(group_concat_max_len = 67108864) */ workflow_versions t
JOIN (
  SELECT x.id,
    CAST(CONCAT('[', GROUP_CONCAT(CAST(
      IF(j.r_op IN ('EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'FILLED', 'EMPTY') AND JSON_TYPE(JSON_EXTRACT(j.elem, '$.requiredIf.op')) = 'STRING' AND JSON_TYPE(JSON_EXTRACT(j.elem, '$.requiredIf.field')) = 'STRING' AND j.r_has_operator = 0 AND j.r_has_match = 0,
        JSON_SET(j.elem, '$.requiredIf', CAST((CASE j.r_op
          WHEN 'FILLED' THEN JSON_OBJECT('field', j.r_field, 'operator', 'IS_NOT_EMPTY')
          WHEN 'EMPTY' THEN JSON_OBJECT('field', j.r_field, 'operator', 'IS_EMPTY')
          WHEN 'NEQ' THEN JSON_OBJECT('match', 'ALL', 'conditions', JSON_ARRAY(
            JSON_OBJECT('field', j.r_field, 'operator', 'IS_NOT_EMPTY'),
            JSON_OBJECT('field', j.r_field, 'operator', 'NEQ', 'value', CAST(IF(REGEXP_LIKE(REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), '^-?(0|[1-9][0-9]*)([.][0-9]+)?$'), REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), JSON_QUOTE(COALESCE(j.r_value, ''))) AS JSON))))
          ELSE JSON_OBJECT('field', j.r_field, 'operator', j.r_op, 'value', CAST(IF(REGEXP_LIKE(REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), '^-?(0|[1-9][0-9]*)([.][0-9]+)?$'), REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), JSON_QUOTE(COALESCE(j.r_value, ''))) AS JSON))
        END) AS JSON)),
        j.elem) AS CHAR) ORDER BY j.idx SEPARATOR ','), ']') AS JSON) AS fixed
  FROM workflow_versions x,
  JSON_TABLE(x.form_json, '$[*]' COLUMNS (
    idx FOR ORDINALITY,
    elem JSON PATH '$',
    r_field VARCHAR(255) PATH '$.requiredIf.field',
    r_op VARCHAR(32) PATH '$.requiredIf.op',
    r_value VARCHAR(1000) PATH '$.requiredIf.value',
    r_has_operator INT EXISTS PATH '$.requiredIf.operator',
    r_has_match INT EXISTS PATH '$.requiredIf.match'
  )) j
  WHERE JSON_CONTAINS_PATH(x.form_json, 'one', '$[*].requiredIf.op')
  GROUP BY x.id
) f ON f.id = t.id
SET t.form_json = f.fixed;

-- module_type_versions: showIf
UPDATE /*+ SET_VAR(group_concat_max_len = 67108864) */ module_type_versions t
JOIN (
  SELECT x.id,
    CAST(CONCAT('[', GROUP_CONCAT(CAST(
      IF(j.r_op IN ('EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'FILLED', 'EMPTY') AND JSON_TYPE(JSON_EXTRACT(j.elem, '$.showIf.op')) = 'STRING' AND JSON_TYPE(JSON_EXTRACT(j.elem, '$.showIf.field')) = 'STRING' AND j.r_has_operator = 0 AND j.r_has_match = 0,
        JSON_SET(j.elem, '$.showIf', CAST((CASE j.r_op
          WHEN 'FILLED' THEN JSON_OBJECT('field', j.r_field, 'operator', 'IS_NOT_EMPTY')
          WHEN 'EMPTY' THEN JSON_OBJECT('field', j.r_field, 'operator', 'IS_EMPTY')
          WHEN 'NEQ' THEN JSON_OBJECT('match', 'ALL', 'conditions', JSON_ARRAY(
            JSON_OBJECT('field', j.r_field, 'operator', 'IS_NOT_EMPTY'),
            JSON_OBJECT('field', j.r_field, 'operator', 'NEQ', 'value', CAST(IF(REGEXP_LIKE(REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), '^-?(0|[1-9][0-9]*)([.][0-9]+)?$'), REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), JSON_QUOTE(COALESCE(j.r_value, ''))) AS JSON))))
          ELSE JSON_OBJECT('field', j.r_field, 'operator', j.r_op, 'value', CAST(IF(REGEXP_LIKE(REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), '^-?(0|[1-9][0-9]*)([.][0-9]+)?$'), REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), JSON_QUOTE(COALESCE(j.r_value, ''))) AS JSON))
        END) AS JSON)),
        j.elem) AS CHAR) ORDER BY j.idx SEPARATOR ','), ']') AS JSON) AS fixed
  FROM module_type_versions x,
  JSON_TABLE(x.form_json, '$[*]' COLUMNS (
    idx FOR ORDINALITY,
    elem JSON PATH '$',
    r_field VARCHAR(255) PATH '$.showIf.field',
    r_op VARCHAR(32) PATH '$.showIf.op',
    r_value VARCHAR(1000) PATH '$.showIf.value',
    r_has_operator INT EXISTS PATH '$.showIf.operator',
    r_has_match INT EXISTS PATH '$.showIf.match'
  )) j
  WHERE JSON_CONTAINS_PATH(x.form_json, 'one', '$[*].showIf.op')
  GROUP BY x.id
) f ON f.id = t.id
SET t.form_json = f.fixed, t.updated_at = t.updated_at;

-- module_type_versions: requiredIf
UPDATE /*+ SET_VAR(group_concat_max_len = 67108864) */ module_type_versions t
JOIN (
  SELECT x.id,
    CAST(CONCAT('[', GROUP_CONCAT(CAST(
      IF(j.r_op IN ('EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'FILLED', 'EMPTY') AND JSON_TYPE(JSON_EXTRACT(j.elem, '$.requiredIf.op')) = 'STRING' AND JSON_TYPE(JSON_EXTRACT(j.elem, '$.requiredIf.field')) = 'STRING' AND j.r_has_operator = 0 AND j.r_has_match = 0,
        JSON_SET(j.elem, '$.requiredIf', CAST((CASE j.r_op
          WHEN 'FILLED' THEN JSON_OBJECT('field', j.r_field, 'operator', 'IS_NOT_EMPTY')
          WHEN 'EMPTY' THEN JSON_OBJECT('field', j.r_field, 'operator', 'IS_EMPTY')
          WHEN 'NEQ' THEN JSON_OBJECT('match', 'ALL', 'conditions', JSON_ARRAY(
            JSON_OBJECT('field', j.r_field, 'operator', 'IS_NOT_EMPTY'),
            JSON_OBJECT('field', j.r_field, 'operator', 'NEQ', 'value', CAST(IF(REGEXP_LIKE(REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), '^-?(0|[1-9][0-9]*)([.][0-9]+)?$'), REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), JSON_QUOTE(COALESCE(j.r_value, ''))) AS JSON))))
          ELSE JSON_OBJECT('field', j.r_field, 'operator', j.r_op, 'value', CAST(IF(REGEXP_LIKE(REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), '^-?(0|[1-9][0-9]*)([.][0-9]+)?$'), REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), JSON_QUOTE(COALESCE(j.r_value, ''))) AS JSON))
        END) AS JSON)),
        j.elem) AS CHAR) ORDER BY j.idx SEPARATOR ','), ']') AS JSON) AS fixed
  FROM module_type_versions x,
  JSON_TABLE(x.form_json, '$[*]' COLUMNS (
    idx FOR ORDINALITY,
    elem JSON PATH '$',
    r_field VARCHAR(255) PATH '$.requiredIf.field',
    r_op VARCHAR(32) PATH '$.requiredIf.op',
    r_value VARCHAR(1000) PATH '$.requiredIf.value',
    r_has_operator INT EXISTS PATH '$.requiredIf.operator',
    r_has_match INT EXISTS PATH '$.requiredIf.match'
  )) j
  WHERE JSON_CONTAINS_PATH(x.form_json, 'one', '$[*].requiredIf.op')
  GROUP BY x.id
) f ON f.id = t.id
SET t.form_json = f.fixed, t.updated_at = t.updated_at;

-- custom_approval_settings: showIf
UPDATE /*+ SET_VAR(group_concat_max_len = 67108864) */ custom_approval_settings t
JOIN (
  SELECT x.id,
    CAST(CONCAT('[', GROUP_CONCAT(CAST(
      IF(j.r_op IN ('EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'FILLED', 'EMPTY') AND JSON_TYPE(JSON_EXTRACT(j.elem, '$.showIf.op')) = 'STRING' AND JSON_TYPE(JSON_EXTRACT(j.elem, '$.showIf.field')) = 'STRING' AND j.r_has_operator = 0 AND j.r_has_match = 0,
        JSON_SET(j.elem, '$.showIf', CAST((CASE j.r_op
          WHEN 'FILLED' THEN JSON_OBJECT('field', j.r_field, 'operator', 'IS_NOT_EMPTY')
          WHEN 'EMPTY' THEN JSON_OBJECT('field', j.r_field, 'operator', 'IS_EMPTY')
          WHEN 'NEQ' THEN JSON_OBJECT('match', 'ALL', 'conditions', JSON_ARRAY(
            JSON_OBJECT('field', j.r_field, 'operator', 'IS_NOT_EMPTY'),
            JSON_OBJECT('field', j.r_field, 'operator', 'NEQ', 'value', CAST(IF(REGEXP_LIKE(REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), '^-?(0|[1-9][0-9]*)([.][0-9]+)?$'), REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), JSON_QUOTE(COALESCE(j.r_value, ''))) AS JSON))))
          ELSE JSON_OBJECT('field', j.r_field, 'operator', j.r_op, 'value', CAST(IF(REGEXP_LIKE(REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), '^-?(0|[1-9][0-9]*)([.][0-9]+)?$'), REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), JSON_QUOTE(COALESCE(j.r_value, ''))) AS JSON))
        END) AS JSON)),
        j.elem) AS CHAR) ORDER BY j.idx SEPARATOR ','), ']') AS JSON) AS fixed
  FROM custom_approval_settings x,
  JSON_TABLE(x.form_json, '$[*]' COLUMNS (
    idx FOR ORDINALITY,
    elem JSON PATH '$',
    r_field VARCHAR(255) PATH '$.showIf.field',
    r_op VARCHAR(32) PATH '$.showIf.op',
    r_value VARCHAR(1000) PATH '$.showIf.value',
    r_has_operator INT EXISTS PATH '$.showIf.operator',
    r_has_match INT EXISTS PATH '$.showIf.match'
  )) j
  WHERE JSON_CONTAINS_PATH(x.form_json, 'one', '$[*].showIf.op')
  GROUP BY x.id
) f ON f.id = t.id
SET t.form_json = f.fixed, t.updated_at = t.updated_at;

-- custom_approval_settings: requiredIf
UPDATE /*+ SET_VAR(group_concat_max_len = 67108864) */ custom_approval_settings t
JOIN (
  SELECT x.id,
    CAST(CONCAT('[', GROUP_CONCAT(CAST(
      IF(j.r_op IN ('EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'FILLED', 'EMPTY') AND JSON_TYPE(JSON_EXTRACT(j.elem, '$.requiredIf.op')) = 'STRING' AND JSON_TYPE(JSON_EXTRACT(j.elem, '$.requiredIf.field')) = 'STRING' AND j.r_has_operator = 0 AND j.r_has_match = 0,
        JSON_SET(j.elem, '$.requiredIf', CAST((CASE j.r_op
          WHEN 'FILLED' THEN JSON_OBJECT('field', j.r_field, 'operator', 'IS_NOT_EMPTY')
          WHEN 'EMPTY' THEN JSON_OBJECT('field', j.r_field, 'operator', 'IS_EMPTY')
          WHEN 'NEQ' THEN JSON_OBJECT('match', 'ALL', 'conditions', JSON_ARRAY(
            JSON_OBJECT('field', j.r_field, 'operator', 'IS_NOT_EMPTY'),
            JSON_OBJECT('field', j.r_field, 'operator', 'NEQ', 'value', CAST(IF(REGEXP_LIKE(REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), '^-?(0|[1-9][0-9]*)([.][0-9]+)?$'), REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), JSON_QUOTE(COALESCE(j.r_value, ''))) AS JSON))))
          ELSE JSON_OBJECT('field', j.r_field, 'operator', j.r_op, 'value', CAST(IF(REGEXP_LIKE(REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), '^-?(0|[1-9][0-9]*)([.][0-9]+)?$'), REGEXP_REPLACE(COALESCE(j.r_value, ''), '[,[:space:]₹]', ''), JSON_QUOTE(COALESCE(j.r_value, ''))) AS JSON))
        END) AS JSON)),
        j.elem) AS CHAR) ORDER BY j.idx SEPARATOR ','), ']') AS JSON) AS fixed
  FROM custom_approval_settings x,
  JSON_TABLE(x.form_json, '$[*]' COLUMNS (
    idx FOR ORDINALITY,
    elem JSON PATH '$',
    r_field VARCHAR(255) PATH '$.requiredIf.field',
    r_op VARCHAR(32) PATH '$.requiredIf.op',
    r_value VARCHAR(1000) PATH '$.requiredIf.value',
    r_has_operator INT EXISTS PATH '$.requiredIf.operator',
    r_has_match INT EXISTS PATH '$.requiredIf.match'
  )) j
  WHERE JSON_CONTAINS_PATH(x.form_json, 'one', '$[*].requiredIf.op')
  GROUP BY x.id
) f ON f.id = t.id
SET t.form_json = f.fixed, t.updated_at = t.updated_at;
