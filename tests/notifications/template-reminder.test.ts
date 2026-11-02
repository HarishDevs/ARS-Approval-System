import { describe, expect, it } from "vitest";
import { templatesNeedingAttention } from "@/server/notifications/template-reminder";
import { WHATSAPP_TEMPLATES } from "@/server/notifications/templates";
import type { TemplateVersion } from "@/lib/db/repositories/whatsapp.repository";

// Q-013 (owner, 2 Nov 2026): the reminder of templates still to switch on.
describe("template reminder (Q-013)", () => {
  it("lists every template without a live version, with its state and a link", () => {
    const [first, second, third] = WHATSAPP_TEMPLATES;
    const live = { status: "ACTIVE", approvalStatus: "APPROVED", providerName: "x" } as TemplateVersion;
    const waiting = { status: "DRAFT", approvalStatus: "PENDING", submittedAt: new Date(), providerStatus: null } as unknown as TemplateVersion;
    const pending = templatesNeedingAttention([
      { entry: first!, live, latest: live },
      { entry: second!, live: null, latest: waiting },
      { entry: third!, live: null, latest: null },
    ]);
    expect(pending.map((item) => [item.code, item.state, item.href])).toEqual([
      [second!.code, "Waiting for Meta", `/superadmin/templates/${second!.code}`],
      [third!.code, "Not created", `/superadmin/templates/${third!.code}`],
    ]);
  });
});
