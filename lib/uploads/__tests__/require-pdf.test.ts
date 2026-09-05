import { describe, test, expect } from "vitest";
import { checkPurchaseOrderUpload, MAX_PO_UPLOAD_BYTES } from "../require-pdf";

const PDF_HEADER = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("checkPurchaseOrderUpload", () => {
  test("accepts a real PDF with a .pdf extension", () => {
    expect(checkPurchaseOrderUpload("po-12345.pdf", PDF_HEADER)).toEqual({ ok: true });
  });

  test("rejects a non-PDF extension even if named .pdf were swapped for something else", () => {
    const result = checkPurchaseOrderUpload("po-12345.docx", PDF_HEADER);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("PDF");
  });

  test("rejects an image renamed to end in .pdf - extension alone is not trusted", () => {
    const result = checkPurchaseOrderUpload("sneaky.pdf", PNG_HEADER);
    expect(result.ok).toBe(false);
  });

  test("rejects a file over the size cap", () => {
    const big = new Uint8Array(MAX_PO_UPLOAD_BYTES + 1);
    big.set(PDF_HEADER);
    const result = checkPurchaseOrderUpload("big.pdf", big);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("too large");
  });

  test("accepts a file exactly at the size cap", () => {
    const atLimit = new Uint8Array(MAX_PO_UPLOAD_BYTES);
    atLimit.set(PDF_HEADER);
    expect(checkPurchaseOrderUpload("at-limit.pdf", atLimit).ok).toBe(true);
  });

  test("every other document/image format used in reject-drawings.ts is also rejected here", () => {
    for (const ext of ["dwg", "dxf", "step", "png", "jpg", "stl"]) {
      const result = checkPurchaseOrderUpload(`file.${ext}`, PDF_HEADER);
      expect(result.ok).toBe(false);
    }
  });
});
