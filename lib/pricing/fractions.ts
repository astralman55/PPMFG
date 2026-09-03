/**
 * Fractional dimension parsing for the quote builder's length/width fields.
 *
 * Machinists write dimensions as mixed fractions ("12 1/2", "12-1/2") as
 * often as decimals ("12.5"). Thickness is never free text - it is a select
 * scoped to the material's stocked sizes (see CLAUDE_CODE_BRIEF.md §7.1) -
 * so this parser is only used for length_in and width_in.
 */

const DECIMAL = /^-?\d+(\.\d+)?$/;
// "12 1/2" or "12-1/2": whole number, separator, fraction.
const MIXED = /^(\d+)[\s-]+(\d+)\/(\d+)$/;
// "1/2" alone, no whole-number part.
const PLAIN_FRACTION = /^(\d+)\/(\d+)$/;

export class DimensionInputError extends Error {}

/**
 * Parses a dimension string into inches. Accepts plain decimals ("12.5"),
 * mixed fractions ("12 1/2", "12-1/2") and plain fractions ("1/2"). Throws
 * DimensionInputError on anything else, with a message safe to show a
 * customer directly.
 */
export function parse_fraction_input(raw: string): number {
  const s = raw.trim();
  if (s === "") {
    throw new DimensionInputError("Enter a dimension.");
  }

  if (DECIMAL.test(s)) {
    return Number(s);
  }

  const mixed = s.match(MIXED);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den === 0) {
      throw new DimensionInputError(`"${raw}" is not a valid dimension (division by zero).`);
    }
    return whole + num / den;
  }

  const plain = s.match(PLAIN_FRACTION);
  if (plain) {
    const num = Number(plain[1]);
    const den = Number(plain[2]);
    if (den === 0) {
      throw new DimensionInputError(`"${raw}" is not a valid dimension (division by zero).`);
    }
    return num / den;
  }

  throw new DimensionInputError(
    `"${raw}" is not a valid dimension. Use a decimal (12.5) or a fraction (12 1/2).`
  );
}
