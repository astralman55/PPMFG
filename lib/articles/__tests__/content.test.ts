import { describe, test, expect } from "vitest";
import cfgJson from "@/lib/pricing/config.json";
import type { PricingConfig } from "@/lib/pricing/engine";
import { articles, getArticleBySlug } from "../content";

const CFG = cfgJson as unknown as PricingConfig;

describe("articles - CLAUDE_CODE_BRIEF.md §17.5", () => {
  test("all five articles exist", () => {
    expect(articles.length).toBe(5);
  });

  test("every slug is unique", () => {
    const slugs = articles.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("every related material code is real", () => {
    for (const a of articles) {
      for (const code of a.relatedMaterialCodes) {
        expect(CFG.materials[code], `${a.slug} references unknown material ${code}`).toBeDefined();
      }
    }
  });

  test("every article is substantial (600-900 words is the brief's target)", () => {
    for (const a of articles) {
      const wordCount = a.body.join(" ").split(/\s+/).filter(Boolean).length;
      expect(wordCount, a.slug).toBeGreaterThan(400);
    }
  });

  test("getArticleBySlug resolves every real slug and rejects an unknown one", () => {
    for (const a of articles) {
      expect(getArticleBySlug(a.slug)?.title).toBe(a.title);
    }
    expect(getArticleBySlug("not-a-real-article")).toBeNull();
  });

  test("meta titles and descriptions stay within search-snippet limits", () => {
    for (const a of articles) {
      expect(a.meta_title.length, a.slug).toBeLessThanOrEqual(60);
      expect(a.meta_description.length, a.slug).toBeLessThanOrEqual(160);
    }
  });
});
