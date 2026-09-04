import { PDFDocument } from "pdf-lib";

/**
 * Merges the generated Certificate of Conformance with each cited lot's
 * Material Test Report into one Certification Packet - see
 * CLAUDE_CODE_BRIEF.md §9 Stage 2. Pure PDF-merging, no I/O: the caller
 * fetches the certificate and MTR bytes (lib/supabase/storage.ts) and passes
 * them in.
 */

export class PacketError extends Error {}

export async function buildCertificationPacket(certificatePdf: Buffer, mtrPdfs: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();

  const cert = await loadOrThrow(certificatePdf, "the generated certificate");
  const certPages = await merged.copyPages(cert, cert.getPageIndices());
  for (const page of certPages) merged.addPage(page);

  for (let i = 0; i < mtrPdfs.length; i++) {
    const mtr = await loadOrThrow(mtrPdfs[i], `MTR #${i + 1}`);
    const mtrPages = await merged.copyPages(mtr, mtr.getPageIndices());
    for (const page of mtrPages) merged.addPage(page);
  }

  const bytes = await merged.save();
  return Buffer.from(bytes);
}

async function loadOrThrow(pdf: Buffer, label: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(pdf);
  } catch {
    throw new PacketError(`${label} is not a readable PDF file and can't be merged into the packet.`);
  }
}
