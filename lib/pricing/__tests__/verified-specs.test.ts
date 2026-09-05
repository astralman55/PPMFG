import { describe, test, expect } from "vitest";
import type { PricingConfig } from "../engine";
import { verifiedSpecs } from "../verified-specs";
import rawConfig from "../config.json";

const CFG = rawConfig as unknown as PricingConfig;

describe("verifiedSpecs - the hard gate (CLAUDE_CODE_BRIEF.md §20.3)", () => {
  test("undefined input yields an empty list, not a crash", () => {
    expect(verifiedSpecs(undefined)).toEqual([]);
  });

  test("an entry with a real verified_source passes through", () => {
    const specs = [{ designation: "ASTM D6262", description: "PAEK shapes", verified_source: "Ensinger datasheet, rev. 2025" }];
    expect(verifiedSpecs(specs)).toEqual(specs);
  });

  test("an entry with an empty-string verified_source is filtered out", () => {
    const specs = [{ designation: "ASTM D6262", description: "PAEK shapes", verified_source: "" }];
    expect(verifiedSpecs(specs)).toEqual([]);
  });

  test("an entry with a whitespace-only verified_source is filtered out", () => {
    const specs = [{ designation: "ASTM D6262", description: "PAEK shapes", verified_source: "   " }];
    expect(verifiedSpecs(specs)).toEqual([]);
  });

  test("a mixed list keeps only the verified entries", () => {
    const specs = [
      { designation: "REAL-1", description: "d1", verified_source: "source A" },
      { designation: "FAKE-2", description: "d2", verified_source: "" },
    ];
    expect(verifiedSpecs(specs)).toEqual([specs[0]]);
  });

  test("every brand in the shipped config has zero verified specs today - the accordion must not render anywhere yet", () => {
    for (const mat of Object.values(CFG.materials)) {
      for (const brand of Object.values(mat.brands)) {
        expect(verifiedSpecs(brand.applicable_specs)).toEqual([]);
      }
    }
  });
});
