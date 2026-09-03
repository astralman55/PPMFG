import { describe, test, expect } from "vitest";
import { checkForRejectedDrawing, DRAWING_REJECTION_MESSAGE } from "../reject-drawings";

function bytesFrom(sig: number[], padTo = 32): Uint8Array {
  const b = new Uint8Array(padTo);
  b.set(sig);
  return b;
}

function bytesFromText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("checkForRejectedDrawing - extension", () => {
  test.each(["blank.dxf", "part.STEP", "assembly.SLDASM", "model.stl", "scan.PDF", "photo.jpeg"])(
    "rejects by extension: %s",
    (name) => {
      const result = checkForRejectedDrawing(name, bytesFromText("irrelevant content"));
      expect(result.rejected).toBe(true);
      expect(result.reason).toBe(DRAWING_REJECTION_MESSAGE);
    }
  );

  test("accepts a plain .csv by extension", () => {
    const result = checkForRejectedDrawing("dims.csv", bytesFromText("part_ref,material_code\nA,PEEK_NAT\n"));
    expect(result.rejected).toBe(false);
  });

  test("accepts a plain .xlsx by extension", () => {
    // Real XLSX is a zip; content doesn't matter for this extension-only case.
    const result = checkForRejectedDrawing("dims.xlsx", bytesFrom([0x50, 0x4b, 0x03, 0x04]));
    expect(result.rejected).toBe(false);
  });
});

describe("checkForRejectedDrawing - magic bytes (renamed file)", () => {
  test("rejects a PDF renamed to .csv", () => {
    const pdfBytes = bytesFrom([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
    const result = checkForRejectedDrawing("totally-a-spreadsheet.csv", pdfBytes);
    expect(result.rejected).toBe(true);
  });

  test("rejects a PNG renamed to .csv", () => {
    const pngBytes = bytesFrom([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = checkForRejectedDrawing("image.csv", pngBytes);
    expect(result.rejected).toBe(true);
  });

  test("rejects an ASCII DXF renamed to .csv", () => {
    const dxfBytes = bytesFromText("0\nSECTION\n2\nHEADER\n");
    const result = checkForRejectedDrawing("drawing.csv", dxfBytes);
    expect(result.rejected).toBe(true);
  });

  test("rejects a STEP file renamed to .txt", () => {
    const stepBytes = bytesFromText("ISO-10303-21;\nHEADER;\n");
    const result = checkForRejectedDrawing("notes.txt", stepBytes);
    expect(result.rejected).toBe(true);
  });
});
