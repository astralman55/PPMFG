import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import Stripe from "stripe";

const sendMock = vi.fn();

// Only the network call to Resend is mocked. PDF generation (@react-pdf/renderer)
// and the email HTML/text template are real - this proves an actual PDF gets
// attached to an actual order, not that some function was merely invoked.
vi.mock("@/lib/email/client", () => ({
  resendConfigured: () => true,
  getFromAddress: () => "Polly Plastics <test@example.com>",
  getResend: () => ({ emails: { send: sendMock } }),
}));

import { POST as webhookPost } from "../route";
import { POST as quotePost } from "../../../quote/route";

const WEBHOOK_SECRET = "whsec_test_fake_secret_for_local_testing";
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

function signedRequest(eventObj: unknown): Request {
  const payload = JSON.stringify(eventObj);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body: payload,
  });
}

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake_for_local_testing");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: "email_test_1" }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/stripe - Stage-1 confirmation email", () => {
  test("a completed checkout for a real quote sends one email with a real invoice PDF attached", async () => {
    const quote = await makeQuote();

    const event = {
      id: "evt_test_email_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_email_1",
          object: "checkout.session",
          customer_details: {
            email: "buyer@example.com",
            address: { line1: "123 Main St", city: "El Cajon", state: "CA", postal_code: "92020", country: "US" },
          },
          customer: "cus_test_email_1",
          payment_intent: "pi_test_email_1",
          amount_total: quote.totals.total_cents,
          total_details: { amount_tax: 0 },
          custom_fields: [{ key: "purchase_order_number", type: "text", text: { value: "PO-9001" } }],
          metadata: { quote_id: quote.quote_id, order_number: "ORD-20260903-EMAIL1", company: "Acme Machine Shop" },
        },
      },
    };

    const res = await webhookPost(signedRequest(event));
    expect(res.status).toBe(200);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const args = sendMock.mock.calls[0][0];
    expect(args.to).toBe("buyer@example.com");
    expect(args.subject).toContain("ORD-20260903-EMAIL1");
    expect(args.html).toContain("ORD-20260903-EMAIL1");
    expect(args.attachments).toHaveLength(1);
    expect(args.attachments[0].filename).toBe("invoice-ORD-20260903-EMAIL1.pdf");

    // A real PDF, not a stand-in: check the file signature and a sane size.
    const pdfBuffer: Buffer = args.attachments[0].content;
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdfBuffer.length).toBeGreaterThan(1000);
  });

  test("replaying the same webhook event sends no second email", async () => {
    const quote = await makeQuote();
    const event = {
      id: "evt_test_email_replay",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_email_replay",
          object: "checkout.session",
          customer_details: { email: "buyer2@example.com", address: null },
          customer: "cus_test_email_replay",
          payment_intent: "pi_test_email_replay",
          amount_total: quote.totals.total_cents,
          total_details: { amount_tax: 0 },
          metadata: { quote_id: quote.quote_id, order_number: "ORD-20260903-EMAIL2", company: "" },
        },
      },
    };

    const first = await webhookPost(signedRequest(event));
    expect(first.status).toBe(200);
    const second = await webhookPost(signedRequest(event));
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ duplicate: true });

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  test("order creation still succeeds even if sending the email fails", async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { message: "simulated Resend outage" } });
    const quote = await makeQuote();
    const event = {
      id: "evt_test_email_fail",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_email_fail",
          object: "checkout.session",
          customer_details: { email: "buyer3@example.com", address: null },
          customer: "cus_test_email_fail",
          payment_intent: "pi_test_email_fail",
          amount_total: quote.totals.total_cents,
          total_details: { amount_tax: 0 },
          metadata: { quote_id: quote.quote_id, order_number: "ORD-20260903-EMAIL3", company: "" },
        },
      },
    };

    const res = await webhookPost(signedRequest(event));
    // The webhook must still report success to Stripe - the order (payment
    // already captured) must not be retried/duplicated just because sending
    // the follow-up email failed.
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
