import { describe, test, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();

// Checkout session creation is a real network call to Stripe - mock it.
// Everything else in this test exercises real code: real quote pricing,
// real in-memory quote storage, real request validation.
vi.mock("@/lib/stripe/client", () => ({
  stripeConfigured: () => true,
  getStripe: () => ({
    checkout: { sessions: { create: createMock } },
  }),
}));

import { POST as checkoutPost } from "../route";
import { POST as quotePost } from "../../quote/route";

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

function postCheckout(body: unknown) {
  return checkoutPost(
    new Request("http://localhost/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({ id: "cs_test_123", url: "https://checkout.stripe.com/pay/cs_test_123" });
});

describe("POST /api/checkout", () => {
  test("builds the Stripe session from the stored quote's total, ignoring any price the client sends", async () => {
    const quote = await makeQuote();
    const res = await postCheckout({
      quote_id: quote.quote_id,
      email: "buyer@example.com",
      company: "Acme Machine Shop",
      customer_po: "PO-4471",
      // A tampering client trying to buy it for a dollar - these are not
      // fields the schema accepts, so they should have zero effect.
      total_cents: 100,
      price: 1.0,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://checkout.stripe.com/pay/cs_test_123");
    expect(typeof body.order_number).toBe("string");

    expect(createMock).toHaveBeenCalledTimes(1);
    const args = createMock.mock.calls[0][0];
    expect(args.line_items[0].price_data.unit_amount).toBe(Math.round(quote.totals.subtotal_goods * 100));
    expect(args.line_items[1].price_data.unit_amount).toBe(Math.round(quote.totals.shipping * 100));
    expect(args.mode).toBe("payment");
    expect(args.automatic_tax).toEqual({ enabled: true });
    expect(args.customer_creation).toBe("always");
    expect(args.shipping_address_collection).toEqual({ allowed_countries: ["US"] });
    expect(args.custom_fields[0].key).toBe("purchase_order_number");
    expect(args.custom_fields[0].text.default_value).toBe("PO-4471");
    expect(args.metadata.quote_id).toBe(quote.quote_id);
  });

  test("marks the quote consumed, so it cannot be checked out twice", async () => {
    const quote = await makeQuote();
    const first = await postCheckout({ quote_id: quote.quote_id, email: "buyer@example.com" });
    expect(first.status).toBe(200);

    const second = await postCheckout({ quote_id: quote.quote_id, email: "buyer@example.com" });
    expect(second.status).toBe(409);
  });

  test("fails cleanly (not a crash) when Stripe rejects the session request", async () => {
    createMock.mockRejectedValueOnce(new Error("You must have a valid head office address to enable automatic tax calculation in test mode."));
    const quote = await makeQuote();
    const res = await postCheckout({ quote_id: quote.quote_id, email: "buyer@example.com" });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("head office address");
  });

  test("rejects an unknown quote_id", async () => {
    const res = await postCheckout({ quote_id: "00000000-0000-0000-0000-000000000000", email: "buyer@example.com" });
    expect(res.status).toBe(404);
  });

  test("rejects an invalid email", async () => {
    const quote = await makeQuote();
    const res = await postCheckout({ quote_id: quote.quote_id, email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  test("rejects a request missing quote_id", async () => {
    const res = await postCheckout({ email: "buyer@example.com" });
    expect(res.status).toBe(400);
  });
});
