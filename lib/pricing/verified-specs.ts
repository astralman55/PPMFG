import type { ApplicableSpec } from "./engine";

/**
 * CLAUDE_CODE_BRIEF.md §20.3 - the hard gate. A designation (ASTM/AMS/NEMA/
 * MIL-spec etc.) never reaches the live site without a non-empty
 * verified_source naming where the claim came from (a datasheet, an actual
 * MTR). This is the one function every rendering path MUST call before
 * showing a spec - never render config's applicable_specs directly.
 */
export function verifiedSpecs(specs: ApplicableSpec[] | undefined): ApplicableSpec[] {
  return (specs ?? []).filter((s) => s.verified_source != null && s.verified_source.trim().length > 0);
}
