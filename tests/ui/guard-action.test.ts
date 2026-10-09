import { afterEach, describe, expect, it, vi } from "vitest";
import { guardAction, SESSION_ENDED } from "@/features/ui/form";

// QA session 14 (DEF-02/03/07): a form's Server Action call never throws
// into the page and never waits forever.
const fd = new FormData();

afterEach(() => vi.unstubAllGlobals());

describe("guardAction", () => {
  it("passes normal answers straight through", async () => {
    const guarded = guardAction(async () => ({ ok: true, message: "Saved." }));
    expect(await guarded(null, fd)).toEqual({ ok: true, message: "Saved." });
  });

  it("turns a thrown failure into a message (still signed in → connection message)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ signedIn: true }))));
    const guarded = guardAction(async () => {
      throw new Error("An unexpected response was received from the server.");
    });
    expect(await guarded(null, fd)).toMatchObject({ ok: false, message: expect.stringContaining("Couldn't reach the server") });
  });

  it("says the session ended when the failure is because of that", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ signedIn: false }))));
    const thrown = guardAction(async () => {
      throw new Error("redirected to /login");
    });
    const notFound = guardAction(async () => ({ ok: false, message: "Not found." }));
    expect(await thrown(null, fd)).toEqual({ ok: false, message: SESSION_ENDED });
    expect(await notFound(null, fd)).toEqual({ ok: false, message: SESSION_ENDED });
  });

  it("keeps an ordinary 'Not found.' when the person is still signed in", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ signedIn: true }))));
    expect(await guardAction(async () => ({ ok: false, message: "Not found." }))(null, fd)).toEqual({ ok: false, message: "Not found." });
  });

  it("stops waiting after the time limit", async () => {
    const guarded = guardAction(() => new Promise(() => undefined), 50);
    expect(await guarded(null, fd)).toMatchObject({ ok: false, message: expect.stringContaining("taking longer than expected") });
  });
});
