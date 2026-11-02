import { describe, expect, it } from "vitest";
import type { Queryable } from "@/lib/db/client";
import { DEMO_CONFIRM_WORD, DEMO_REAL_USER_LIMIT, demoConfirmed, demoLoadRefusal } from "@/server/demo/service";

// V181-A8 (AUD-25, REC-21): demo data needs a typed confirmation and is
// refused on a database already in real use.
const dbWith = (total: number) => ({ query: async () => [[{ total }], []] }) as unknown as Queryable;

describe("demo load guard (V181-A8)", () => {
  it("the typed word must match (case and spaces around it don't matter)", () => {
    expect(DEMO_CONFIRM_WORD).toBe("LOAD DEMO");
    expect(demoConfirmed("LOAD DEMO")).toBe(true);
    expect(demoConfirmed(" load demo ")).toBe(true);
    expect(demoConfirmed("LOAD")).toBe(false);
    expect(demoConfirmed("")).toBe(false);
    expect(demoConfirmed(null)).toBe(false);
  });

  it("without the word: refused, and the database isn't even asked", async () => {
    const db = { query: async () => { throw new Error("should not be called"); } } as unknown as Queryable;
    expect(await demoLoadRefusal("yes", db)).toMatch(/Type LOAD DEMO to confirm/);
  });

  it("a fresh or test database: allowed", async () => {
    expect(await demoLoadRefusal("LOAD DEMO", dbWith(2))).toBeNull();
    expect(await demoLoadRefusal("LOAD DEMO", dbWith(DEMO_REAL_USER_LIMIT))).toBeNull();
  });

  it("a database in real use: refused with a plain reason", async () => {
    const message = await demoLoadRefusal("LOAD DEMO", dbWith(DEMO_REAL_USER_LIMIT + 1));
    expect(message).toMatch(/26 active real people/);
    expect(message).toMatch(/Nothing was loaded/);
  });
});
