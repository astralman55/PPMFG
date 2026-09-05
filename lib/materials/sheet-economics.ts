import type { PricingConfig } from "../pricing/engine";

/**
 * The MOQ-trap arithmetic used on the landing page (§11.3) and in the
 * "buying a small blank" article (§17.5) - one function so the two never
 * drift apart. Raw material cost only (no margin, no conversion cost) -
 * this is deliberately the floor of what a full sheet costs, not a price.
 */
export interface SheetVsBlankComparison {
  sheetLengthIn: number;
  sheetWidthIn: number;
  thicknessIn: number;
  sheetWeightLb: number;
  sheetRawCost: number;
  blankRawCost: number;
  shelfRemainderCost: number;
}

export function sheetVsBlankComparison(
  cfg: PricingConfig,
  materialCode: string,
  thicknessIn: number,
  blankLengthIn: number,
  blankWidthIn: number
): SheetVsBlankComparison {
  const mat = cfg.materials[materialCode];
  const sheetVolumeIn3 = mat.sheet_length_in * mat.sheet_width_in * thicknessIn;
  const sheetWeightLb = sheetVolumeIn3 * mat.density_lb_in3;
  const sheetRawCost = sheetWeightLb * mat.price_per_lb;
  const blankVolumeIn3 = blankLengthIn * blankWidthIn * thicknessIn;
  const blankRawCost = blankVolumeIn3 * mat.density_lb_in3 * mat.price_per_lb;
  return {
    sheetLengthIn: mat.sheet_length_in,
    sheetWidthIn: mat.sheet_width_in,
    thicknessIn,
    sheetWeightLb,
    sheetRawCost,
    blankRawCost,
    shelfRemainderCost: sheetRawCost - blankRawCost,
  };
}
