import { afterEach, describe, expect, it, vi } from "vitest";
import { actionErrorMessage, APP_UPDATED, guardAction, SESSION_ENDED, UNEXPECTED } from "@/features/ui/form";

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
      throw new TypeError("Failed to fetch");
    });
    expect(await guarded(null, fd)).toMatchObject({ ok: false, message: expect.stringContaining("Couldn't reach the server") });
  });

  // v1.12.5 (D-164): a page opened before a publish, and a server error,
  // each say what happened instead of "Couldn't reach the server".
  it("says ARS was updated when the page's action no longer exists, and raises the banner", async () => {
    const seen = vi.fn();
    vi.stubGlobal("window", Object.assign(new EventTarget(), { dispatchEvent: seen }));
    const stale = Object.assign(new Error('Server Action "7f00" was not found on the server.'), { name: "UnrecognizedActionError" });
    expect(await guardAction(async () => Promise.reject(stale))(null, fd)).toEqual({ ok: false, message: APP_UPDATED });
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ type: "ars:app-updated" }));
  });

  it("gives the reference of an error the server hit", () => {
    expect(actionErrorMessage(Object.assign(new Error("An error occurred in the Server Components render."), { digest: "2817325468" }))).toContain("reference 2817325468");
    expect(actionErrorMessage(new TypeError("Failed to fetch"))).toBeNull();
    expect(actionErrorMessage("nope")).toBeNull();
  });

  it("an unexpected answer while signed in says so; while signed out, the session ended", async () => {
    const unexpected = guardAction(async () => {
      throw new Error("An unexpected response was received from the server.");
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ signedIn: true }))));
    expect(await unexpected(null, fd)).toEqual({ ok: false, message: UNEXPECTED });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ signedIn: false }))));
    expect(await unexpected(null, fd)).toEqual({ ok: false, message: SESSION_ENDED });
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
