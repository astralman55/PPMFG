import type { MaterialSpec, SheetSize } from "./engine";

/**
 * CLAUDE_CODE_BRIEF.md §20.2 - distributors don't stock one sheet size per
 * material regardless of thickness. `sheet_size_overrides` is keyed by the
 * thickness (in inches, as it appears in stock_thicknesses_in) stringified
 * with String() - e.g. String(0.125) === "0.125". Falls back to the
 * material's flat sheet_length_in/sheet_width_in when no override exists,
 * which today means every call, since every material's overrides start
 * empty (see config.json's sheet_size_overrides_note).
 */
export function resolveSheetSize(mat: MaterialSpec, thicknessIn: number): SheetSize {
  const override = mat.sheet_size_overrides?.[String(thicknessIn)];
  if (override) {
    return { sheet_length_in: override.sheet_length_in, sheet_width_in: override.sheet_width_in };
  }
  return { sheet_length_in: mat.sheet_length_in, sheet_width_in: mat.sheet_width_in };
}
