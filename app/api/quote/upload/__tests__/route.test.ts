import { describe, test, expect } from "vitest";
import { POST } from "../route";

function uploadFile(name: string, content: BlobPart, type = "text/csv"): Promise<Response> {
  const form = new FormData();
  const file = new File([content], name, { type });
  form.append("file", file);
  return POST(new Request("http://localhost/api/quote/upload", { method: "POST", body: form }));
}

const GOOD_CSV = [
  "part_ref,material_code,brand,certification_tier,length_in,width_in,thickness_in,qty,tolerance_tier,edge_finish",
  "BRKT-001,PEEK_NAT,ENSINGER_TECAPEEK,TIER1_TRACEABLE,12,12,0.5,1,STANDARD,DEBURRED",
  "SPCR-002,ULTEM_1000,GENERIC,INDUSTRIAL,6,4,0.25,10,STANDARD,CHAMFERED",
].join("\n");

describe("POST /api/quote/upload", () => {
  test("parses the documented template into line items", async () => {
    const res = await uploadFile("dims.csv", GOOD_CSV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.errors).toEqual([]);
    expect(body.lines).toHaveLength(2);
    expect(body.lines[0]).toMatchObject({ material_code: "PEEK_NAT", length_in: 12, width_in: 12 });
  });

  test("reports the row and reason for a non-stocked thickness", async () => {
    const bad = [
      "part_ref,material_code,length_in,width_in,thickness_in,qty",
      "A,PEEK_NAT,12,12,0.437,1",
    ].join("\n");
    const res = await uploadFile("dims.csv", bad);
    const body = await res.json();
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].row).toBe(2);
    expect(body.errors[0].message).toContain("not a stocked thickness");
  });

  test.each(["drawing.dxf", "part.step", "model.stl", "scan.pdf"])(
    "hard-rejects a drawing/model file: %s",
    async (name) => {
      const res = await uploadFile(name, "irrelevant content", "application/octet-stream");
      expect(res.status).toBe(415);
      const body = await res.json();
      expect(body.error).toContain("We don't accept drawings or 3D models");
    }
  );

  test("rejects a PDF renamed to look like a CSV", async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"
    const res = await uploadFile("totally-a-spreadsheet.csv", pdfBytes);
    expect(res.status).toBe(415);
  });

  test("rejects an unsupported file type", async () => {
    const res = await uploadFile("notes.txt", "hello", "text/plain");
    expect(res.status).toBe(415);
  });

  test.each(["dims.xlsx", "dims.xls"])(
    "Excel upload (%s) is disabled - CLAUDE_CODE_BRIEF.md Phase 14 §22, the xlsx parsing library had unpatched CVEs",
    async (name) => {
      const res = await uploadFile(name, "irrelevant content", "application/vnd.ms-excel");
      expect(res.status).toBe(415);
      const body = await res.json();
      expect(body.error).toContain("Excel upload is temporarily unavailable");
      expect(body.error).toContain(".csv");
    }
  );
});
