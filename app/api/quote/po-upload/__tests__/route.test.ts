import { describe, test, expect } from "vitest";
import { POST } from "../route";
import { saveQuote, getQuote } from "@/lib/quotes/store";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0x25]);

async function makeQuote() {
  return saveQuote(
    {
      request_json: {},
      result_json: {},
      subtotal_cents: 100,
      shipping_cents: 0,
      total_cents: 100,
      promised_ship_date: "2026-01-01",
      config_version: "test",
    },
    24
  );
}

function upload(quote_id: string, filename: string, bytes: Uint8Array) {
  const form = new FormData();
  form.set("quote_id", quote_id);
  form.set("file", new File([new Uint8Array(bytes)], filename, { type: "application/pdf" }));
  return POST(new Request("http://localhost/api/quote/po-upload", { method: "POST", body: form }));
}

describe("POST /api/quote/po-upload", () => {
  test("accepts a real PDF and attaches its storage path to the quote", async () => {
    const quote = await makeQuote();
    const res = await upload(quote.id, "po-4471.pdf", PDF_BYTES);
    expect(res.status).toBe(200);

    const updated = await getQuote(quote.id);
    expect(updated?.po_upload_path).toBeTruthy();
  });

  test("rejects a non-PDF file", async () => {
    const quote = await makeQuote();
    const res = await upload(quote.id, "po.docx", PDF_BYTES);
    expect(res.status).toBe(415);
    const updated = await getQuote(quote.id);
    expect(updated?.po_upload_path).toBeNull();
  });

  test("rejects an image renamed to .pdf", async () => {
    const quote = await makeQuote();
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = await upload(quote.id, "sneaky.pdf", pngBytes);
    expect(res.status).toBe(415);
  });

  test("404s for a quote id that doesn't exist", async () => {
    const res = await upload("00000000-0000-0000-0000-000000000000", "po.pdf", PDF_BYTES);
    expect(res.status).toBe(404);
  });

  test("400s when no file is attached", async () => {
    const quote = await makeQuote();
    const form = new FormData();
    form.set("quote_id", quote.id);
    const res = await POST(new Request("http://localhost/api/quote/po-upload", { method: "POST", body: form }));
    expect(res.status).toBe(400);
  });
});
