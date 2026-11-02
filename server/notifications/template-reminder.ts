import type { BoardEntry } from "@/server/notifications/template-registry";
import { versionStatus } from "@/features/superadmin/template-status";
import { templateLabel } from "@/server/notifications/templates";

// Q-013 (owner, 2 Nov 2026): a reminder of the WhatsApp templates that are
// still not switched on (no live, Meta-approved version), each linking to
// the page where it is created, submitted and goes live.
export interface PendingTemplate {
  code: string;
  label: string;
  state: string; // "Not created", "Draft, not sent", "Waiting for Meta", …
  href: string;
}

export function templatesNeedingAttention(board: readonly Pick<BoardEntry, "entry" | "live" | "latest">[]): PendingTemplate[] {
  return board
    .filter((item) => !item.live)
    .map((item) => ({
      code: item.entry.code,
      label: templateLabel(item.entry.eventType),
      state: item.latest ? versionStatus(item.latest).label : "Not created",
      href: `/superadmin/templates/${item.entry.code}`,
    }));
}
