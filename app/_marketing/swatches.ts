/**
 * Material swatch colours - CLAUDE_CODE_BRIEF.md §11 names five explicitly
 * (PEEK bone, Ultem amber, Delrin white, black Delrin, G10 green); the
 * other materials in config.json get a true-to-life colour in the same
 * spirit (PTFE virgin's translucent white, PPS's tan-grey, Torlon's amber
 * tan) rather than an arbitrary one.
 */
const SWATCH_BY_MATERIAL: Record<string, string> = {
  PEEK_NAT: "var(--color-swatch-peek)",
  PEEK_GF30: "var(--color-swatch-peek)",
  PEEK_CF30: "var(--color-swatch-peek)",
  ULTEM_1000: "var(--color-swatch-ultem)",
  ULTEM_2300: "var(--color-swatch-ultem)",
  DELRIN_150: "var(--color-swatch-delrin)",
  DELRIN_AF: "var(--color-swatch-delrin-af)",
  PTFE_VIRGIN: "var(--color-swatch-ptfe)",
  PTFE_GF25: "var(--color-swatch-ptfe)",
  PPS_TECHTRON: "var(--color-swatch-pps)",
  TORLON_4203: "var(--color-swatch-torlon)",
  G10_FR4: "var(--color-swatch-g10)",
};

export function materialSwatch(materialCode: string): string {
  return SWATCH_BY_MATERIAL[materialCode] ?? "var(--color-swatch-peek)";
}
