import { describe, expect, it } from "vitest";
import { MENTION_MAX, parseMentions } from "@/server/approvals/mentions";

describe("@mentions (#9)", () => {
  it("finds User IDs after @, once each, case-insensitively", () => {
    expect(parseMentions("@asha please check, cc @Ravi.K and @asha again")).toEqual(["asha", "Ravi.K"]);
    expect(parseMentions("(@meena) thoughts?\n@it-admin.")).toEqual(["meena", "it-admin"]);
  });

  it("an email address or a lone @ is not a mention", () => {
    expect(parseMentions("write to asha@arssteels.co.in or @ the team, @a")).toEqual([]);
  });

  it("stops at the limit", () => {
    const text = Array.from({ length: 15 }, (_, index) => `@person${index}`).join(" ");
    expect(parseMentions(text)).toHaveLength(MENTION_MAX);
  });
});
