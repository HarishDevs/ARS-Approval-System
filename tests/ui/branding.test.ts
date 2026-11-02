import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import manifest from "@/app/manifest";
import { APP_BRANDING, TITLE_TEMPLATE } from "@/lib/branding";

// Nov 2026 branding: ARS CMS with the owner's ARS GREEN STEEL CMS logo.
const publicFile = (url: string) => path.resolve(__dirname, "../../public", url.replace(/^\//, ""));
const pngSize = (url: string) => {
  const buffer = readFileSync(publicFile(url));
  expect(buffer.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

describe("branding", () => {
  it("every image path in APP_BRANDING exists on disk", () => {
    const paths = Object.values(APP_BRANDING).flatMap((value) => (typeof value === "string" && value.startsWith("/") ? [value] : []));
    expect(paths.length).toBeGreaterThan(10);
    for (const url of paths) expect(existsSync(publicFile(url)), url).toBe(true);
  });

  it("the icons have the sizes their names say; the logo keeps 3:2", () => {
    for (const size of [16, 32, 48, 64, 96, 192, 512, 1024]) expect(pngSize(`/branding/ars-cms-icon-${size}.png`)).toEqual({ width: size, height: size });
    expect(pngSize(APP_BRANDING.appleTouchIcon)).toEqual({ width: 180, height: 180 });
    expect(pngSize(APP_BRANDING.maskable)).toEqual({ width: 512, height: 512 });
    expect(pngSize(APP_BRANDING.ogImage)).toEqual({ width: 1200, height: 630 });
    for (const url of [APP_BRANDING.logo, APP_BRANDING.logoLarge, APP_BRANDING.logoSmall]) {
      const { width, height } = pngSize(url);
      expect(width * 2).toBe(height * 3);
    }
  });

  it("the manifest uses the new name, colours and icons", () => {
    const m = manifest();
    expect(m).toMatchObject({ name: "ARS CMS — GREEN STEEL", short_name: "ARS CMS", theme_color: "#004B8D", background_color: APP_BRANDING.backgroundColor });
    const icons = m.icons ?? [];
    expect(icons.every((icon) => icon.src.startsWith("/branding/"))).toBe(true);
    expect(icons.some((icon) => icon.purpose === "maskable" && icon.src === APP_BRANDING.maskable)).toBe(true);
    expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const icon of icons) expect(existsSync(publicFile(icon.src)), icon.src).toBe(true);
    expect(JSON.stringify(m)).not.toMatch(/ARS-CMS|\/icons\//);
  });

  it("page titles read \"Page · ARS CMS\"", () => {
    expect(TITLE_TEMPLATE).toBe("%s · ARS CMS");
    // app/layout.tsx loads next/font, so its source is checked instead of importing it.
    const layout = readFileSync(path.resolve(__dirname, "../../app/layout.tsx"), "utf8");
    expect(layout).toContain("title: { default: APP_BRANDING.appName, template: TITLE_TEMPLATE }");
    expect(layout).toContain("apple: APP_BRANDING.appleTouchIcon");
    expect(layout).not.toMatch(/"\/icons\/|"\/brand\/|ARS-CMS/);
  });

  it("the service worker and offline page use the new icons", () => {
    const sw = readFileSync(publicFile("/sw.js"), "utf8");
    expect(sw).toContain("/branding/ars-cms-icon-192.png");
    expect(sw).not.toMatch(/"\/icons\/icon-|ars-mark/);
    const offline = readFileSync(publicFile("/offline.html"), "utf8");
    expect(offline).toContain("/branding/ars-cms-icon-192.png");
    expect(offline).not.toContain("ARS-CMS");
  });
});
