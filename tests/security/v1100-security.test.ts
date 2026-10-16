import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { pageForPath, PAGES } from "@/server/authorization/pages";
import { parseTaskFilters, taskListSql } from "@/server/modules/task-lists";
import { infoListSql, parseInfoFilters } from "@/server/modules/info-lists";

// v1.10.0 security hardening (SECURITY_WEBSITE_FIX_TRACKER.md).
const BASE = "https://approval.arssteels.net";
const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) => new NextRequest(new URL(path, BASE), { method: init.method ?? "GET", headers: init.headers });

afterEach(() => vi.unstubAllEnvs());

describe("middleware headers (SEC-07, SEC-08, SEC-18)", () => {
  it("SEC-07: a cross-origin preflight to the API gets no Access-Control-Allow-* headers", async () => {
    const response = await middleware(req("/api/me/notifications", { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "POST" } }));
    expect(response.status).toBe(204);
    expect([...response.headers.keys()].filter((name) => name.startsWith("access-control-allow"))).toEqual([]);
  });

  it("SEC-07: a cross-site POST to the API is refused before any route runs", async () => {
    const response = await middleware(req("/api/me/notifications", { method: "POST", headers: { "sec-fetch-site": "cross-site", cookie: "ars_session=x" } }));
    expect(response.status).toBe(403);
  });

  it("SEC-08: a plain-HTTP visit (Cloudflare's CF-Visitor) is sent to HTTPS in production only", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await middleware(req("/login?next=/users", { headers: { "cf-visitor": '{"scheme":"http"}' } }));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`${BASE}/login?next=/users`);
    const secure = await middleware(req("/login", { headers: { "cf-visitor": '{"scheme":"https"}' } }));
    expect(secure.status).not.toBe(308);
    vi.stubEnv("NODE_ENV", "test");
    expect((await middleware(req("/login", { headers: { "cf-visitor": '{"scheme":"http"}' } }))).status).not.toBe(308);
  });

  it("SEC-18: pages and API answers are private and not stored; CSP and a request id are set", async () => {
    const response = await middleware(req("/login"));
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    // Static brand files keep their own caching.
    expect((await middleware(req("/icons/icon-192.png"))).headers.get("cache-control")).toBeNull();
  });

  it("SEC-02: without a session, protected pages go to sign-in and the API answers a plain 404", async () => {
    const page = await middleware(req("/admin/users"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/login?next=%2Fadmin%2Fusers");
    const api = await middleware(req("/api/files/1"));
    expect(api.status).toBe(404);
  });
});

describe("page access (G-3, SEC-17)", () => {
  it("Super Admin addresses are no configured page (refused for others by checkPageAccess)", () => {
    expect(pageForPath("/superadmin/import")).toBeNull();
  });

  it("SEC-17: Sign-in & devices can't be restricted, so signing out a lost device always works", () => {
    expect(pageForPath("/users/security")).toBeNull();
    expect(pageForPath("/api/me/sign-out-everywhere")).toBeNull();
    expect(PAGES.some((page) => page.key === "users.security")).toBe(false);
  });
});

describe("SEC-06: list sorting and search can't change the SQL", () => {
  const evil = "id; DROP TABLE users; --";
  it("task lists: an unknown sort falls back; search text only ever goes in as a parameter", () => {
    const filters = parseTaskFilters({ sort: evil, q: `x' OR 1=1 --` });
    const sql = taskListSql(filters, "MINE", { id: 7, isAdmin: false }, [], new Date("2026-10-16T00:00:00Z"));
    expect(sql.orderBy).not.toContain("DROP");
    expect(sql.where.join(" ")).not.toContain("OR 1=1");
    expect(sql.params.some((param) => typeof param === "string" && param.includes("OR 1=1"))).toBe(true);
  });

  it("information lists: the same", () => {
    const filters = parseInfoFilters({ sort: evil, q: `x' OR 1=1 --` }, "INBOX");
    const sql = infoListSql(filters, "INBOX", 7, "2026-10-16", []);
    expect(sql.orderBy).toBe("COALESCE(i.published_at, i.created_at) DESC, i.id DESC");
    expect(sql.where.join(" ")).not.toContain("OR 1=1");
  });
});
