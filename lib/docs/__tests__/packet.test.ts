import { describe, test, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildCertificationPacket, PacketError } from "../packet";

async function onePagePdf(label: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  page.drawText(label, { x: 10, y: 100 });
  return Buffer.from(await doc.save());
}

async function twoPagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}

describe("buildCertificationPacket", () => {
  test("merges the certificate and every MTR into one PDF, certificate pages first", async () => {
    const cert = await onePagePdf("cert");
    const mtr1 = await onePagePdf("mtr1");
    const mtr2 = await twoPagePdf();

    const packet = await buildCertificationPacket(cert, [mtr1, mtr2]);
    expect(packet.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const merged = await PDFDocument.load(packet);
    expect(merged.getPageCount()).toBe(1 + 1 + 2);
  });

  test("works with no MTRs at all (still returns just the certificate)", async () => {
    const cert = await onePagePdf("cert");
    const packet = await buildCertificationPacket(cert, []);
    const merged = await PDFDocument.load(packet);
    expect(merged.getPageCount()).toBe(1);
  });

  test("throws a clear PacketError instead of a raw crash on a corrupt MTR file", async () => {
    const cert = await onePagePdf("cert");
    const notAPdf = Buffer.from("this is not a pdf");
    await expect(buildCertificationPacket(cert, [notAPdf])).rejects.toThrow(PacketError);
  });
});
