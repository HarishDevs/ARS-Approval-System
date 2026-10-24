import { describe, expect, it } from "vitest";
import { parseBlocks } from "@/features/ai/RichAnswer";
import { friendlyError } from "@/server/ai/friendly";

describe("analyst answers render from Markdown (D-178)", () => {
  it("headings, lists, tables and the metrics/chart blocks", () => {
    const blocks = parseBlocks(["## Pipeline", "We have **54** deals.", "- Won 19", "- Lost 16", "", "| Stage | Count |", "|---|---|", "| Won | 19 |", "```metrics", '[{"label":"Open","value":19}]', "```", "```chart", '{"type":"bar","labels":["Won"],"values":[19]}', "```"].join("\n"));
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "list", "table", "fence", "fence"]);
    expect(blocks[3]).toMatchObject({ kind: "table", header: ["Stage", "Count"], rows: [["Won", "19"]] });
    expect(blocks[4]).toMatchObject({ kind: "fence", lang: "metrics" });
  });
});

describe("underscores in names (D-178)", () => {
  it("stay as written", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { Inline } = await import("@/features/ai/RichAnswer");
    const { createElement } = await import("react");
    expect(renderToStaticMarkup(createElement(Inline, { text: "Person PB_A_X1 and _this_" }))).toBe("Person PB_A_X1 and <em>this</em>");
  });
});

describe("failed answers in plain words (D-178)", () => {
  it("hides provider detail from people", () => {
    expect(friendlyError("Groq: The provider's rate limit or quota was reached (Rate limit reached for model `openai/gpt-oss-120b` in organization `org_x`)")).toMatch(/lot of questions/);
    expect(friendlyError("DeepSeek: The provider refused the request (HTTP 402) (Insufficient Balance)")).toMatch(/not available right now/);
    expect(friendlyError("Stopped.")).toBe("Stopped.");
    expect(friendlyError("Something odd (HTTP 418)")).toBe("I couldn't answer just now. Please try again.");
  });
});
