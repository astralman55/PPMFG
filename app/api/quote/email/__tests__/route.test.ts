import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const sendMock = vi.fn();

// Only the network call to Resend is mocked - PDF generation and the email
// template are real, so this proves an actual PDF gets attached, not that a
// function was merely invoked.
vi.mock("@/lib/email/client", () => ({
  resendConfigured: () => true,
  getFromAddress: () => "Precision Plastics Manufacturing <test@example.com>",
  getResend: () => ({ emails: { send: sendMock } }),
}));

import { POST as quotePost } from "../../route";
import { POST as emailPost } from "../route";

const CANONICAL_LINE = { material_code: "PEEK_NAT", length_in: 12, width_in: 12, thickness_in: 0.5, qty: 1 };

async function makeQuote() {
  const res = await quotePost(
    new Request("http://localhost/api/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lines: [CANONICAL_LINE], lead_tier: "STD", sourcing_mode: "MASTER_SHEET", order_date: "2026-09-03" }),
    })
  );
  return res.json();
}

function emailRequest(quote_id: string, email: string) {
  return emailPost(
    new Request("http://localhost/api/quote/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quote_id, email }),
    })
  );
}

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: "email_test_1" }, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/quote/email", () => {
  test("sends a real quote-summary PDF to the requested email on first use", async () => {
    const quote = await makeQuote();
    const res = await emailRequest(quote.quote_id, "buyer@example.com");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent_to).toBe("buyer@example.com");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const args = sendMock.mock.calls[0][0];
    expect(args.to).toBe("buyer@example.com");
    expect(args.subject).toContain("quote");
    expect(args.attachments).toHaveLength(1);
    expect(args.attachments[0].filename).toBe(`quote-${quote.quote_id}.pdf`);

    const pdfBuffer: Buffer = args.attachments[0].content;
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdfBuffer.length).toBeGreaterThan(500);
  });

  test("a second call with a DIFFERENT email is ignored - it sends to the address already on record", async () => {
    const quote = await makeQuote();
    await emailRequest(quote.quote_id, "real-customer@example.com");
    sendMock.mockClear();

    // Simulate the rate-limit window having already elapsed so this is a
    // legitimate "resend," not a rejected duplicate - even then, an attacker
    // supplying a different address must not redirect the send.
    const { getQuote } = await import("@/lib/quotes/store");
    const row = await getQuote(quote.quote_id);
    if (row) row.emailed_at = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const res = await emailRequest(quote.quote_id, "attacker@example.com");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent_to).toBe("real-customer@example.com");
    expect(sendMock.mock.calls[0][0].to).toBe("real-customer@example.com");
  });

  test("rejects a second send within the 5-minute cooldown", async () => {
    const quote = await makeQuote();
    await emailRequest(quote.quote_id, "buyer@example.com");
    sendMock.mockClear();

    const res = await emailRequest(quote.quote_id, "buyer@example.com");
    expect(res.status).toBe(429);
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("404s for a quote id that doesn't exist", async () => {
    const res = await emailRequest("00000000-0000-0000-0000-000000000000", "buyer@example.com");
    expect(res.status).toBe(404);
  });

  test("410s for an expired quote", async () => {
    const quote = await makeQuote();
    const { getQuote } = await import("@/lib/quotes/store");
    const row = await getQuote(quote.quote_id);
    if (row) row.expires_at = new Date(Date.now() - 1000).toISOString();

    const res = await emailRequest(quote.quote_id, "buyer@example.com");
    expect(res.status).toBe(410);
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("rejects a malformed email address with a 400", async () => {
    const quote = await makeQuote();
    const res = await emailRequest(quote.quote_id, "not-an-email");
    expect(res.status).toBe(400);
  });
});
