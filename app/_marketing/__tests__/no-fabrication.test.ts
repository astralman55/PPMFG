import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * CLAUDE_CODE_BRIEF.md §18 definition of done: "No 'AI' or 'machine
 * learning' language appears anywhere describing the nester." The nester is
 * a deterministic guillotine-packing algorithm; claiming otherwise is a
 * false technical claim a knowledgeable buyer would catch. This is a cheap
 * regression guard against a future copy edit reintroducing it.
 */
const MARKETING_DIR = join(__dirname, "..");

function marketingSourceFiles(): string[] {
  return readdirSync(MARKETING_DIR)
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .map((f) => join(MARKETING_DIR, f));
}

describe("homepage copy - no fabricated claims", () => {
  test("no AI/machine-learning language describes the nester anywhere in the marketing components", () => {
    const forbidden = /\bAI\b|artificial intelligence|machine learning|\bML\b/i;
    for (const file of marketingSourceFiles()) {
      const text = readFileSync(file, "utf8");
      expect(forbidden.test(text), `${file} contains AI/ML language`).toBe(false);
    }
  });

  test("the nesting explainer is labeled illustrative, not a live feed", () => {
    const text = readFileSync(join(MARKETING_DIR, "NestingExplainer.tsx"), "utf8");
    expect(text.toLowerCase()).toContain("illustrative");
  });

  test("the trust strip renders nothing when there are no real certifications", async () => {
    const { TrustStrip } = await import("../TrustStrip");
    const { brand } = await import("@/lib/brand");
    expect(brand.certifications).toEqual([]);
    expect(TrustStrip()).toBeNull();
  });
});
