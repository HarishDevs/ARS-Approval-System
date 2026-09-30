import { describe, expect, it, vi } from "vitest";
import { notifyWithDeps, type NotifyDeps, type NotifyInput } from "@/server/notifications/notify";

function makeDeps(overrides: Partial<NotifyDeps> = {}) {
  const deliveries: Parameters<NotifyDeps["createDelivery"]>[0][] = [];
  const deps: NotifyDeps = {
    findRecipient: async () => ({ id: 5, name: "Staff", email: "staff@example.com", whatsappNumber: "919876543210", active: true }),
    createNotification: vi.fn(async () => 77),
    createDelivery: vi.fn(async (input) => {
      deliveries.push(input);
      return deliveries.length;
    }) as unknown as NotifyDeps["createDelivery"],
    findActiveTemplate: async () => ({ id: 3, providerName: "wa_new_login_v1", language: "en", variableKeys: ["name", "time"] }),
    sendWhatsApp: vi.fn(async () => ({ waMessageId: "wamid.1" })),
    sendEmail: vi.fn(async () => ({ id: "re_1" })),
    ...overrides,
  };
  return { deps, deliveries };
}

const input: NotifyInput = {
  eventType: "NEW_LOGIN",
  userId: 5,
  title: "New sign-in",
  message: "A new sign-in to your account.",
  email: { subject: "New sign-in", text: "Hello" },
  whatsappVariables: { name: "Staff", time: "10:00" },
};

describe("notification hub", () => {
  it("records in-app, sends email and WhatsApp with variables in template order", async () => {
    const { deps, deliveries } = makeDeps();
    await notifyWithDeps(input, deps);
    expect(deps.createNotification).toHaveBeenCalledOnce();
    expect(deps.sendWhatsApp).toHaveBeenCalledWith("919876543210", expect.objectContaining({ providerName: "wa_new_login_v1" }), ["Staff", "10:00"]);
    expect(deliveries.map((d) => [d.channel, d.status])).toEqual([
      ["EMAIL", "SENT"],
      ["WHATSAPP", "SENT"],
    ]);
  });

  it("skips WhatsApp when the template isn't configured yet (Q-013)", async () => {
    const { deps, deliveries } = makeDeps({ findActiveTemplate: async () => null });
    await notifyWithDeps(input, deps);
    expect(deps.sendWhatsApp).not.toHaveBeenCalled();
    expect(deliveries[1]).toMatchObject({ channel: "WHATSAPP", status: "SKIPPED", failureCode: "TEMPLATE_NOT_CONFIGURED" });
  });

  it("skips WhatsApp when the user has no number", async () => {
    const { deps, deliveries } = makeDeps({ findRecipient: async () => ({ id: 5, name: "S", email: "s@example.com", whatsappNumber: null, active: true }) });
    await notifyWithDeps(input, deps);
    expect(deliveries[1]).toMatchObject({ status: "SKIPPED", failureCode: "NO_WHATSAPP_NUMBER" });
  });

  it("never throws: provider failures become FAILED deliveries", async () => {
    const { deps, deliveries } = makeDeps({
      sendEmail: async () => {
        throw new Error("boom");
      },
      sendWhatsApp: async () => {
        throw new Error("boom");
      },
    });
    await expect(notifyWithDeps(input, deps)).resolves.toMatchObject({ email: { status: "FAILED" }, whatsapp: { status: "FAILED" } });
    expect(deliveries.map((d) => d.status)).toEqual(["FAILED", "FAILED"]);
  });

  it("never throws even if the database is down", async () => {
    const { deps } = makeDeps({
      createNotification: async () => {
        throw new Error("db down");
      },
    });
    await expect(notifyWithDeps(input, deps)).resolves.toEqual({ recorded: false, email: null, whatsapp: null });
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it("a send that worked is never marked FAILED when recording it fails (no double send on retry)", async () => {
    const { deps } = makeDeps({
      createDelivery: (async () => {
        throw new Error("db hiccup");
      }) as unknown as NotifyDeps["createDelivery"],
    });
    const summary = await notifyWithDeps(input, deps);
    expect(summary.email).toEqual({ status: "SENT" });
    expect(summary.whatsapp).toEqual({ status: "SENT" });
    expect(deps.sendEmail).toHaveBeenCalledOnce();
  });

  it("sends nothing to an inactive user", async () => {
    const { deps } = makeDeps({ findRecipient: async () => ({ id: 5, name: "S", email: "s@example.com", whatsappNumber: "91", active: false }) });
    await notifyWithDeps(input, deps);
    expect(deps.createNotification).not.toHaveBeenCalled();
  });
});
