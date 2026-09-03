import { describe, test, expect } from "vitest";
import { parse_fraction_input, DimensionInputError } from "../fractions";

describe("parse_fraction_input", () => {
  test.each([
    ["12 1/2", 12.5],
    ["12-1/2", 12.5],
    ["12.5", 12.5],
    ["12", 12],
    ["0.5", 0.5],
    ["1/2", 0.5],
    [" 12 1/2 ", 12.5],
    ["6 3/4", 6.75],
  ])("%s -> %d", (input, expected) => {
    expect(parse_fraction_input(input)).toBeCloseTo(expected, 9);
  });

  test.each(["", "abc", "12/0", "1 2 3", "twelve"])("rejects invalid input: %s", (input) => {
    expect(() => parse_fraction_input(input)).toThrow(DimensionInputError);
  });
});
