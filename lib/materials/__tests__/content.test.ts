import { describe, test, expect } from "vitest";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import { materialContent, getMaterialContent, getMaterialCodeBySlug } from "../content";

const CFG = cfgJson as unknown as PricingConfig;

describe("materialContent - CLAUDE_CODE_BRIEF.md §17.1", () => {
  test("every material in config.json has a content entry", () => {
    for (const code of Object.keys(CFG.materials)) {
      expect(() => getMaterialContent(code), `missing content for ${code}`).not.toThrow();
    }
  });

  test("every content entry corresponds to a real material in config.json", () => {
    for (const code of Object.keys(materialContent)) {
      expect(CFG.materials[code], `content.ts has an entry for unknown material ${code}`).toBeDefined();
    }
  });

  test("every slug is unique", () => {
    const slugs = Object.values(materialContent).map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("getMaterialCodeBySlug resolves every real slug and rejects an unknown one", () => {
    for (const [code, content] of Object.entries(materialContent)) {
      expect(getMaterialCodeBySlug(content.slug)).toBe(code);
    }
    expect(getMaterialCodeBySlug("not-a-real-material")).toBeNull();
  });

  test("no content field is empty, and every material has at least one FAQ", () => {
    for (const [code, content] of Object.entries(materialContent)) {
      expect(content.hero_line.length, code).toBeGreaterThan(0);
      expect(content.overview.length, code).toBeGreaterThan(0);
      expect(content.why_this_material.length, code).toBeGreaterThan(0);
      expect(content.typical_applications.length, code).toBeGreaterThan(0);
      expect(content.faq.length, code).toBeGreaterThanOrEqual(3);
      expect(content.meta_title.length, code).toBeLessThanOrEqual(60);
      expect(content.meta_description.length, code).toBeLessThanOrEqual(155);
    }
  });

  test("getMaterialContent throws a clear error for a material that doesn't exist", () => {
    expect(() => getMaterialContent("NOT_A_REAL_MATERIAL")).toThrow(/No lib\/materials\/content\.ts entry/);
  });
});
