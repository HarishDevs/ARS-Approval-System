# Turns a mysqldump of a freshly migrated+seeded database into a safe import file
# for a new, empty hosted MySQL (docs/DEPLOYMENT.md Part B1, Part M). Usage:
#   python scripts/database/release-sql-clean.py <raw-dump.sql> <out.sql>
import re, sys
src, out = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf8").read()

# Collect triggers, then remove the mysqldump trigger blocks.
triggers = re.findall(r"TRIGGER `(\w+)` (BEFORE (?:UPDATE|DELETE|INSERT)) ON `(\w+)` FOR EACH ROW BEGIN\s*(SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '[^']*');\s*END", s)
assert len(triggers) == 6, triggers
s = re.sub(r"(/\*!50003 SET @saved_cs_client[^\n]*\n(?:/\*!50003[^\n]*\n)*?)?DELIMITER ;;\n.*?DELIMITER ;\n(?:/\*!50003 SET [^\n]*\n)*", "", s, flags=re.S)
assert "DELIMITER" not in s and "DEFINER" not in s and "TRIGGER" not in s
# Never drop or lock anything: importing twice must fail, not wipe data.
s = re.sub(r"^DROP TABLE IF EXISTS `\w+`;\n", "", s, flags=re.M)
s = re.sub(r"^(LOCK TABLES `\w+` WRITE|UNLOCK TABLES);\n", "", s, flags=re.M)
assert "DROP TABLE" not in s and "LOCK TABLES" not in s

header = """-- ARS Approval Platform v1.0.1: database setup for a NEW, EMPTY MySQL 8 database.
-- Import once (GoDaddy Node.js app -> Settings -> Hosted Database -> Import SQL).
-- Contents: all 15 migrations (tables, keys, append-only triggers), the seeds
-- (roles, the wa_login_otp_v1 template, the first Super Admin itadmin@arssteels.co.in,
-- Google sign-in), and schema_migrations, so the app's migrate step skips them.
-- It drops nothing: importing it into a database that already has these tables
-- fails with "Table already exists" instead of touching any data.
-- Contains no passwords, keys or personal data other than the itadmin account.

"""
footer = "\n-- Append-only protection (audit log, request timeline, comments): one-line triggers, no DELIMITER needed.\n"
for name, timing, table, body in triggers:
    footer += f"CREATE TRIGGER `{name}` {timing} ON `{table}` FOR EACH ROW {body};\n"
open(out, "w", encoding="utf8", newline="\n").write(header + s.rstrip() + "\n" + footer)
print("triggers:", len(triggers))
