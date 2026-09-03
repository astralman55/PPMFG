/**
 * Hard rejection of drawings and 3D models, per CLAUDE_CODE_BRIEF.md §7.2.
 *
 * This is the single most important compliance decision in the build.
 * Dimensions alone are not controlled technical data; a drawing of a
 * component is. Keeping technical data off our servers keeps a customer's
 * program off our servers. Checked by extension AND by magic bytes, because
 * a customer could rename a file without meaning to evade anything.
 */

export const REJECTED_EXTENSIONS = [
  "dwg",
  "dxf",
  "step",
  "stp",
  "iges",
  "igs",
  "sldprt",
  "sldasm",
  "ipt",
  "catpart",
  "prt",
  "x_t",
  "3dm",
  "stl",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "tif",
  "tiff",
  "heic",
] as const;

export const DRAWING_REJECTION_MESSAGE =
  "We don't accept drawings or 3D models - only dimensions. This is deliberate. " +
  "Keeping technical data off our servers keeps your program off our servers.";

function extname(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx + 1).toLowerCase();
}

/** True if the first `sig.length` bytes of `bytes` equal `sig`. */
function matchesBytes(bytes: Uint8Array, offset: number, sig: number[]): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

function asciiAt(bytes: Uint8Array, offset: number, len: number): string {
  return Array.from(bytes.slice(offset, offset + len))
    .map((b) => String.fromCharCode(b))
    .join("");
}

/**
 * Best-effort magic-byte sniff for the formats in REJECTED_EXTENSIONS that
 * have a well-defined binary signature. Text-based CAD formats (DXF, STEP,
 * IGES) don't have a universal magic number, so those rely on the extension
 * check plus a light content probe for their standard header markers.
 */
function looksLikeRejectedFormat(bytes: Uint8Array): boolean {
  // PDF: "%PDF-"
  if (matchesBytes(bytes, 0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (matchesBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return true;
  // JPEG: FF D8 FF
  if (matchesBytes(bytes, 0, [0xff, 0xd8, 0xff])) return true;
  // TIFF: little-endian "II*\0" or big-endian "MM\0*"
  if (matchesBytes(bytes, 0, [0x49, 0x49, 0x2a, 0x00])) return true;
  if (matchesBytes(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a])) return true;
  // HEIC/HEIF: ISO base media file, "ftyp" box at offset 4
  if (asciiAt(bytes, 4, 4) === "ftyp") return true;
  // DWG: "AC10" / "AC15" / "AC1032" etc. version tag at the start
  if (asciiAt(bytes, 0, 2) === "AC" && /^\d/.test(asciiAt(bytes, 2, 1))) return true;
  // Binary STL: no reliable magic number, but text STL starts with "solid".
  // A binary STL's 80-byte header is opaque, so this only catches the text form.
  if (asciiAt(bytes, 0, 5).toLowerCase() === "solid") return true;
  // STEP (ISO-10303): "ISO-10303" appears near the top of the file.
  if (asciiAt(bytes, 0, 512).includes("ISO-10303")) return true;
  // DXF: ASCII files start with a "0\nSECTION" group; binary DXF starts
  // with "AutoCAD Binary DXF".
  const head = asciiAt(bytes, 0, 22);
  if (head.startsWith("AutoCAD Binary DXF")) return true;
  const headText = asciiAt(bytes, 0, 512);
  if (/^\s*0\s*[\r\n]+\s*SECTION/.test(headText)) return true;
  // IGES: fixed-width card format, columns 73-80 of the first line read "S      1".
  const firstLine = asciiAt(bytes, 0, 80);
  if (/^.{72}S\s*1\s*$/.test(firstLine)) return true;

  return false;
}

export interface DrawingCheckResult {
  rejected: boolean;
  reason?: string;
}

/**
 * Checks one uploaded file by name and content. Reject if either the
 * extension or the sniffed content matches a drawing/model format.
 */
export function checkForRejectedDrawing(filename: string, bytes: Uint8Array): DrawingCheckResult {
  const ext = extname(filename);
  if ((REJECTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { rejected: true, reason: DRAWING_REJECTION_MESSAGE };
  }
  if (looksLikeRejectedFormat(bytes)) {
    return { rejected: true, reason: DRAWING_REJECTION_MESSAGE };
  }
  return { rejected: false };
}
