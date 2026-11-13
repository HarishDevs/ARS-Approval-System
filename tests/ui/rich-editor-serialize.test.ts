// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { serialize } from "@/features/ui/RichEditor";

// v1.54.7: the editor's content becomes the app's formatting text, mark by mark.
const html = (markup: string) => {
  const root = document.createElement("div");
  root.innerHTML = markup;
  return serialize(root);
};

describe("RichEditor serialize", () => {
  it("keeps a block after a list", () => {
    expect(html("<ul><li>Steps count the coils</li></ul><div><b>bold text</b> plain</div>")).toBe("- Steps count the coils\n**bold text** plain");
  });
  it("bold switched off inside bold is plain", () => {
    expect(html('<b>bold <span style="font-weight: normal">plain</span></b>')).toBe("**bold** plain");
  });
  it("nests marks", () => {
    expect(html("<b>all <i>both</i></b>")).toBe("**all _both_**");
  });
  it("keeps mentions, code and safe links", () => {
    expect(html('ask <span data-mention="@[Manoj Manager](user:5)">@Manoj Manager</span> <code>x=1</code> <a href="https://ars.example">site</a>')).toBe("ask @[Manoj Manager](user:5) `x=1` [site](https://ars.example)");
  });
});
