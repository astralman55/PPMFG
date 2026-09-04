import { describe, test, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import {
  CertificateError,
  renderCertificatePdf,
  validateCertificateInput,
  type CertificateLine,
} from "../certificate";

function baseLine(overrides: Partial<CertificateLine> = {}): CertificateLine {
  return {
    line_no: 1,
    part_ref: null,
    material_code: "PEEK_NAT",
    qty: 2,
    length_in: 12,
    width_in: 12,
    thickness_nominal: 0.5,
    thickness_actual: 0.521,
    tolerance_tier: "STANDARD",
    edge_finish: "DEBURRED",
    face_finish: "AS_SUPPLIED",
    annealed: false,
    certification_tier: "TIER1_TRACEABLE",
    inspected_by: "J. Rivera",
    lot: { lot_number: "LOT-1001", brand: "ENSINGER_TECAPEEK", manufacturer: "Ensinger", country_of_origin: "Germany" },
    ...overrides,
  };
}

/** Extracts plain text from a rendered PDF so assertions can check real printed content, not just "it didn't throw." */
async function textOf(pdf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: pdf });
  const { text } = await parser.getText();
  await parser.destroy();
  return text;
}

describe("validateCertificateInput", () => {
  test("throws when a line has no lot assigned", () => {
    expect(() => validateCertificateInput([baseLine({ lot: null })])).toThrow(CertificateError);
  });
  test("throws when the lot has no country of origin", () => {
    expect(() =>
      validateCertificateInput([baseLine({ lot: { lot_number: "L1", brand: "GENERIC", manufacturer: "M", country_of_origin: null } })])
    ).toThrow(/country of origin/);
  });
  test("throws when there is no measured actual thickness", () => {
    expect(() => validateCertificateInput([baseLine({ thickness_actual: null })])).toThrow(/measured actual thickness/);
  });
  test("throws when there is no inspector recorded", () => {
    expect(() => validateCertificateInput([baseLine({ inspected_by: null })])).toThrow(/inspector/);
  });
  test("throws on an order with no lines at all", () => {
    expect(() => validateCertificateInput([])).toThrow(/no lines/);
  });
  test("passes for a fully-populated line", () => {
    expect(() => validateCertificateInput([baseLine()])).not.toThrow();
  });
});

describe("renderCertificatePdf - DFARS/lineage suppression (CLAUDE_CODE_BRIEF.md §9)", () => {
  test("an all-Tier-1 order prints the DFARS/authorised-channel/mercury statements and no INDUSTRIAL disclaimer", async () => {
    const pdf = await renderCertificatePdf({
      certNumber: "CERT-TEST-1",
      certDate: "2026-09-04",
      orderNumber: "ORD-TEST-1",
      customerPo: "PO-1",
      soldTo: { company: "Acme", email: "buyer@example.com" },
      shipTo: null,
      lines: [baseLine({ certification_tier: "TIER1_TRACEABLE" })],
    });
    const text = await textOf(pdf);
    expect(text).toContain("DFARS 252.225-7009");
    expect(text).not.toContain("INDUSTRIAL-tier material");
  });

  test("an all-INDUSTRIAL order suppresses the DFARS/lineage statements entirely and states no lineage is claimed", async () => {
    const pdf = await renderCertificatePdf({
      certNumber: "CERT-TEST-2",
      certDate: "2026-09-04",
      orderNumber: "ORD-TEST-2",
      customerPo: null,
      soldTo: { company: null, email: "buyer@example.com" },
      shipTo: null,
      lines: [baseLine({ certification_tier: "INDUSTRIAL" })],
    });
    const text = await textOf(pdf);
    expect(text).not.toContain("DFARS 252.225-7009");
    expect(text).toContain("No mill lineage or chain of custody is claimed");
  });

  test("a mixed order scopes the DFARS statement to the Tier 1 line(s) only and separately flags the INDUSTRIAL line(s)", async () => {
    const pdf = await renderCertificatePdf({
      certNumber: "CERT-TEST-3",
      certDate: "2026-09-04",
      orderNumber: "ORD-TEST-3",
      customerPo: null,
      soldTo: { company: null, email: "buyer@example.com" },
      shipTo: null,
      lines: [
        baseLine({ line_no: 1, certification_tier: "TIER1_TRACEABLE" }),
        baseLine({ line_no: 2, certification_tier: "INDUSTRIAL" }),
      ],
    });
    const text = await textOf(pdf);
    expect(text).toContain("DFARS 252.225-7009");
    expect(text).toContain("Tier 1 lines only");
    expect(text).toContain("No mill lineage or chain of custody is claimed");
    expect(text).toContain("#2");
  });

  test("produces a genuine, non-trivial PDF", async () => {
    const pdf = await renderCertificatePdf({
      certNumber: "CERT-TEST-4",
      certDate: "2026-09-04",
      orderNumber: "ORD-TEST-4",
      customerPo: null,
      soldTo: { company: null, email: "buyer@example.com" },
      shipTo: null,
      lines: [baseLine()],
    });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
