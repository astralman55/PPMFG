import { describe, test, expect } from "vitest";
import { createLot, findCandidateLots, DuplicateLotError } from "../store";

function lotInput(overrides: Partial<Parameters<typeof createLot>[0]> = {}) {
  return {
    lot_number: `LOT-${Math.random().toString(36).slice(2, 8)}`,
    material_code: "PEEK_NAT",
    brand: "ENSINGER_TECAPEEK",
    certification_tier: "TIER1_TRACEABLE",
    manufacturer: "Ensinger",
    country_of_origin: "Germany",
    thickness_nominal: 0.5,
    received_date: "2026-09-01",
    ...overrides,
  };
}

describe("createLot", () => {
  test("rejects a duplicate lot_number/material_code/thickness_nominal combination", async () => {
    const input = lotInput({ lot_number: "LOT-DUP-1" });
    await createLot(input);
    await expect(createLot(input)).rejects.toThrow(DuplicateLotError);
  });

  test("allows the same lot_number on a different thickness (the unique key is the triple, not just the lot number)", async () => {
    const lotNumber = "LOT-DUP-2";
    await createLot(lotInput({ lot_number: lotNumber, thickness_nominal: 0.5 }));
    await expect(createLot(lotInput({ lot_number: lotNumber, thickness_nominal: 0.75 }))).resolves.toBeTruthy();
  });
});

describe("findCandidateLots - CLAUDE_CODE_BRIEF.md §10: \"filter by brand and tier and refuse a mismatch\"", () => {
  test("a GENERIC-brand line can be satisfied by any real named brand", async () => {
    const lot = await createLot(lotInput({ lot_number: "LOT-GEN-1", brand: "MITSUBISHI_KETRON" }));
    const candidates = await findCandidateLots({
      material_code: "PEEK_NAT",
      brand: "GENERIC",
      certification_tier: "TIER1_TRACEABLE",
      thickness_nominal: 0.5,
    });
    expect(candidates.map((l) => l.id)).toContain(lot.id);
  });

  test("a named-brand line is only satisfied by a lot of that exact brand (brand lock)", async () => {
    const wrongBrand = await createLot(lotInput({ lot_number: "LOT-LOCK-1", brand: "MITSUBISHI_KETRON" }));
    const rightBrand = await createLot(lotInput({ lot_number: "LOT-LOCK-2", brand: "VICTREX" }));

    const candidates = await findCandidateLots({
      material_code: "PEEK_NAT",
      brand: "VICTREX",
      certification_tier: "TIER1_TRACEABLE",
      thickness_nominal: 0.5,
    });
    expect(candidates.map((l) => l.id)).not.toContain(wrongBrand.id);
    expect(candidates.map((l) => l.id)).toContain(rightBrand.id);
  });

  test("a mismatched certification tier is refused even with matching material/brand/thickness", async () => {
    const industrialLot = await createLot(
      lotInput({ lot_number: "LOT-TIER-1", certification_tier: "INDUSTRIAL", country_of_origin: null })
    );
    const candidates = await findCandidateLots({
      material_code: "PEEK_NAT",
      brand: "GENERIC",
      certification_tier: "TIER1_TRACEABLE",
      thickness_nominal: 0.5,
    });
    expect(candidates.map((l) => l.id)).not.toContain(industrialLot.id);
  });

  test("a mismatched nominal thickness is refused", async () => {
    const thickLot = await createLot(lotInput({ lot_number: "LOT-THK-1", thickness_nominal: 1 }));
    const candidates = await findCandidateLots({
      material_code: "PEEK_NAT",
      brand: "GENERIC",
      certification_tier: "TIER1_TRACEABLE",
      thickness_nominal: 0.5,
    });
    expect(candidates.map((l) => l.id)).not.toContain(thickLot.id);
  });

  test("a mismatched material is refused", async () => {
    const otherMaterial = await createLot(lotInput({ lot_number: "LOT-MAT-1", material_code: "ULTEM_1000", brand: "SABIC_ULTEM" }));
    const candidates = await findCandidateLots({
      material_code: "PEEK_NAT",
      brand: "GENERIC",
      certification_tier: "TIER1_TRACEABLE",
      thickness_nominal: 0.5,
    });
    expect(candidates.map((l) => l.id)).not.toContain(otherMaterial.id);
  });
});
