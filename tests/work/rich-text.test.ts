import { describe, expect, it } from "vitest";
import { encodeMentions, inlineParts, mentionIds, prefixLines, richBlocks, wrapSelection } from "@/features/work/rich-text";

// D-238: the Draft task's formatting, kept as text and shown as data.
describe("task description formatting", () => {
  it("reads bold, italic, struck and mentions; anything else stays text", () => {
    expect(inlineParts("Call **today**, _please_ ~~not Friday~~ @[Asha Rao](user:12) <b>x</b>")).toEqual([
      { kind: "text", text: "Call " },
      { kind: "bold", text: "today" },
      { kind: "text", text: ", " },
      { kind: "italic", text: "please" },
      { kind: "text", text: " " },
      { kind: "strike", text: "not Friday" },
      { kind: "text", text: " " },
      { kind: "mention", userId: 12, label: "Asha Rao" },
      { kind: "text", text: " <b>x</b>" },
    ]);
    expect(inlineParts("snake_case_name and 2*3*4")).toEqual([{ kind: "text", text: "snake_case_name and 2*3*4" }]);
  });

  it("groups bullet and numbered lines into lists", () => {
    const blocks = richBlocks("Steps:\n- one\n- two\n1. first\n2. second\nend");
    expect(blocks.map((block) => block.kind)).toEqual(["line", "bullets", "numbers", "line"]);
    expect(blocks[1]).toMatchObject({ items: [[{ kind: "text", text: "one" }], [{ kind: "text", text: "two" }]] });
  });

  it("turns picked @Names into mentions, longest name first, and lists who is mentioned", () => {
    const text = encodeMentions("Ask @Asha Rao and @Asha, not email@Asha.com", [
      { id: 1, name: "Asha" },
      { id: 2, name: "Asha Rao" },
    ]);
    expect(text).toBe("Ask @[Asha Rao](user:2) and @[Asha](user:1), not email@Asha.com");
    expect(mentionIds(`${text}\n- @[Asha](user:1)`)).toEqual([2, 1]);
  });

  it("wraps the selection and marks lines for the Formatting bar", () => {
    expect(wrapSelection("make this bold", 5, 9, "**", "bold text")).toEqual({ value: "make **this** bold", start: 7, end: 11 });
    expect(wrapSelection("x", 1, 1, "_", "italic text").value).toBe("x_italic text_");
    expect(prefixLines("a\nb\nc", 2, 4, false).value).toBe("a\n- b\n- c");
    expect(prefixLines("- a", 0, 0, true).value).toBe("1. a");
  });
});

// v1.52.2 (owner): comments format like an email body.
describe("comment formatting (v1.52.2)", () => {
  it("reads underline, code, links, quotes and headings", async () => {
    const { inlineParts, richBlocks } = await import("@/features/work/rich-text");
    expect(inlineParts("a ++b++ `c` [site](https://example.com)")).toEqual([
      { kind: "text", text: "a " },
      { kind: "underline", text: "b" },
      { kind: "text", text: " " },
      { kind: "code", text: "c" },
      { kind: "text", text: " " },
      { kind: "link", text: "site", href: "https://example.com" },
    ]);
    expect(richBlocks("> quoted\n# Title\nplain").map((block) => block.kind)).toEqual(["quote", "heading", "line"]);
  });
  it("never makes a link of anything but http(s) or mailto", async () => {
    const { inlineParts } = await import("@/features/work/rich-text");
    expect(inlineParts("[x](javascript:alert(1))").some((part) => part.kind === "link")).toBe(false);
    expect(inlineParts("[mail](mailto:a@b.co)")).toEqual([{ kind: "link", text: "mail", href: "mailto:a@b.co" }]);
  });
});
