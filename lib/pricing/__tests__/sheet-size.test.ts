import { describe, test, expect } from "vitest";
import type { PricingConfig } from "../engine";
import { resolveSheetSize } from "../sheet-size";
import rawConfig from "../config.json";

const CFG = rawConfig as unknown as PricingConfig;

describe("resolveSheetSize", () => {
  test("falls back to the material's flat sheet size when overrides are empty (today's real config)", () => {
    const mat = CFG.materials.PEEK_NAT;
    const size = resolveSheetSize(mat, 0.5);
    expect(size).toEqual({ sheet_length_in: mat.sheet_length_in, sheet_width_in: mat.sheet_width_in });
  });

  test("uses a per-thickness override when one is present", () => {
    const mat = JSON.parse(JSON.stringify(CFG.materials.PEEK_NAT)) as (typeof CFG.materials)["PEEK_NAT"];
    mat.sheet_size_overrides = { "0.125": { sheet_length_in: 48, sheet_width_in: 48 } };
    expect(resolveSheetSize(mat, 0.125)).toEqual({ sheet_length_in: 48, sheet_width_in: 48 });
    // A different thickness on the same material still falls back to the default.
    expect(resolveSheetSize(mat, 0.5)).toEqual({ sheet_length_in: mat.sheet_length_in, sheet_width_in: mat.sheet_width_in });
  });

  test("every material in the shipped config has an (empty) sheet_size_overrides object", () => {
    for (const mat of Object.values(CFG.materials)) {
      expect(mat.sheet_size_overrides).toEqual({});
    }
  });
});
