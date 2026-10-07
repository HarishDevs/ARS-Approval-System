// Writes docs/NOTIFICATION-TEMPLATES.md from the template catalogue (S6-04).
// Usage: node scripts/dev/write-templates-doc.mjs  (Node 23.6+ runs .ts directly)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderTemplatesDoc } from "../../server/notifications/templates.ts";

const target = fileURLToPath(new URL("../../docs/NOTIFICATION-TEMPLATES.md", import.meta.url));
writeFileSync(target, renderTemplatesDoc(), "utf8");
console.log(`Wrote ${target}`);
