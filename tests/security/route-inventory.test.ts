import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// SEC-02 (v1.10.0): every API route has an explicit access policy. A route
// either checks the signed-in person on the server (requireApiArea), or is
// on this list of deliberately public routes with the reason and its own
// protection. A new route that is neither fails this test.
const ROOT = path.resolve(__dirname, "../..");
const PUBLIC: Record<string, string> = {
  "app/api/auth/forgot/complete/route.ts": "password reset: single-use code, rate-limited per login and IP",
  "app/api/auth/forgot/start/route.ts": "password reset start: same answer for every User ID, rate-limited",
  "app/api/auth/google/route.ts": "Google sign-in: verifies the Firebase ID token server-side",
  "app/api/auth/keep-alive/route.ts": "extends the caller's own session cookie only",
  "app/api/auth/logout/route.ts": "ends the caller's own session",
  "app/api/auth/not-me/route.ts": "\"This wasn't me\": signed single-use purpose token",
  "app/api/auth/password/resend/route.ts": "sign-in code resend: bound to a pending challenge, rate-limited",
  "app/api/auth/password/start/route.ts": "password sign-in: rate-limited per login and IP, lockout",
  "app/api/auth/password/verify/route.ts": "sign-in code check: bound to the challenge, attempts capped",
  "app/api/auth/set-password/complete/route.ts": "set-password: signed single-use token plus WhatsApp code",
  "app/api/auth/set-password/start/route.ts": "set-password: signed single-use token",
  "app/api/auth/status/route.ts": "says only whether the caller is signed in",
  "app/api/auth/try/[token]/route.ts": "Try as: signed single-use 5-minute link, refused where anyone is signed in, view-only session",
  "app/api/health/route.ts": "health check: status words only, no data",
  "app/api/health/deep/route.ts": "health check for alerting (D-246): the same status words, 503 when degraded",
  "app/api/jobs/run/route.ts": "cron runner: JOB_RUNNER_SECRET compared in constant time",
  "app/api/webhooks/google-calendar/route.ts": "Google push notifications: channel id, resource id and hashed token must match, rate-limited",
  "app/api/webhooks/ceoitbox/route.ts": "provider receipts: shared secret compared in constant time, rate-limited",
};

function routes(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routes(full);
    return entry.name === "route.ts" ? [path.relative(ROOT, full).split(path.sep).join("/")] : [];
  });
}

describe("API route inventory (SEC-02)", () => {
  const all = routes(path.join(ROOT, "app/api"));

  it("finds the routes", () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it.each(all)("%s: guarded on the server, or deliberately public", (file) => {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    const guarded = /requireApiArea\(/.test(source);
    if (PUBLIC[file]) {
      expect(guarded, `${file} is listed as public but also guarded: remove it from the list`).toBe(false);
    } else {
      expect(guarded, `${file} has no requireApiArea(): add a guard, or list it as public with a reason`).toBe(true);
    }
  });

  it("every public route on the list still exists", () => {
    for (const file of Object.keys(PUBLIC)) expect(all, file).toContain(file);
  });

  it("machine routes check their secret in constant time", () => {
    expect(fs.readFileSync(path.join(ROOT, "app/api/webhooks/ceoitbox/route.ts"), "utf8")).toContain("timingSafeEqual");
    const jobs = fs.readFileSync(path.join(ROOT, "app/api/jobs/run/route.ts"), "utf8");
    expect(/timingSafeEqual|safeEqual|sameSecret/.test(jobs)).toBe(true);
  });
});

// Server Action files: every exported action must reach a server-side
// identity check before doing anything.
describe("Server Action inventory (SEC-02, SEC-14)", () => {
  function actionFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return actionFiles(full);
      if (!/\.tsx?$/.test(entry.name)) return [];
      return fs.readFileSync(full, "utf8").startsWith('"use server"') ? [path.relative(ROOT, full).split(path.sep).join("/")] : [];
    });
  }
  const files = actionFiles(path.join(ROOT, "app"));
  const GUARDS = /requireApiArea\(|getAdminActor\(|getCurrentSession\(|await (actor|me|owner|reportUser|user|currentActor|sessionUser|superAdmin|requireSuperAdmin)\w*\(/;

  it("finds the action files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)("%s: each exported action checks who is calling", (file) => {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    const bodies = source.split(/\nexport async function /).slice(1);
    for (const body of bodies) {
      const name = body.slice(0, body.indexOf("("));
      const end = body.search(/\n}\n/);
      expect(GUARDS.test(end > 0 ? body.slice(0, end) : body), `${file} → ${name}`).toBe(true);
    }
  });
});
