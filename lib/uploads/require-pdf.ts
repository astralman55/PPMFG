/**
 * CLAUDE_CODE_BRIEF.md §20.4 - the purchase-order upload accepts PDF only,
 * checked by extension AND magic bytes (a renamed file shouldn't slip past
 * an extension-only check, same discipline as reject-drawings.ts). This is
 * inert storage: nothing here parses, OCRs, or extracts the file's content -
 * it only confirms the file really is a PDF before it's stored.
 */

export const MAX_PO_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export interface PdfCheckResult {
  ok: boolean;
  reason?: string;
}

function extname(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx + 1).toLowerCase();
}

function looksLikePdf(bytes: Uint8Array): boolean {
  // "%PDF-" - the standard PDF header.
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export function checkPurchaseOrderUpload(filename: string, bytes: Uint8Array): PdfCheckResult {
  if (bytes.length > MAX_PO_UPLOAD_BYTES) {
    return { ok: false, reason: `That file is too large - purchase orders are capped at ${MAX_PO_UPLOAD_BYTES / (1024 * 1024)} MB.` };
  }
  if (extname(filename) !== "pdf") {
    return { ok: false, reason: "Purchase orders must be uploaded as a PDF." };
  }
  if (!looksLikePdf(bytes)) {
    return { ok: false, reason: "That file doesn't look like a valid PDF." };
  }
  return { ok: true };
}
