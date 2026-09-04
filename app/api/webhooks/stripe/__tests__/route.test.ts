import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import Stripe from "stripe";
import * as ordersStore from "@/lib/orders/store";
import { POST as webhookPost } from "../route";

/**
 * No mocking of Stripe here at all: this uses the real `stripe` package's
 * offline test-signing helper to produce a genuinely valid webhook
 * signature, so the route's actual signature-verification code runs for
 * real - not a stand-in. Signature generation/verification is pure HMAC,
 * so this needs no network call and no live Stripe account.
 */
const WEBHOOK_SECRET = "whsec_test_fake_secret_for_local_testing";

function buildSessionCompletedEvent(eventId: string, sessionOverrides: Record<string, unknown> = {}) {
  return {
    id: eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_default",
        object: "checkout.session",
        customer_details: {
          email: "buyer@example.com",
          address: { line1: "123 Main St", city: "El Cajon", state: "CA", postal_code: "92020", country: "US" },
        },
        customer: "cus_test_abc",
        payment_intent: "pi_test_abc",
        amount_total: 99504,
        total_details: { amount_tax: 0 },
        custom_fields: [{ key: "purchase_order_number", type: "text", text: { value: "PO-4471" } }],
        metadata: { quote_id: "", order_number: "ORD-20260903-ABCDEF", company: "Acme Machine Shop" },
        ...sessionOverrides,
      },
    },
  };
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
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/stripe", () => {
  test("a completed checkout creates exactly one order", async () => {
    const event = buildSessionCompletedEvent("evt_test_single", { id: "cs_test_single" });
    const res = await webhookPost(signedRequest(event));
    expect(res.status).toBe(200);

    const order = await ordersStore.getOrderBySessionId("cs_test_single");
    expect(order).not.toBeNull();
    expect(order?.order_number).toBe("ORD-20260903-ABCDEF");
    expect(order?.customer_po).toBe("PO-4471");
    expect(order?.amount_paid_cents).toBe(99504);
  });

  test("replaying the same webhook event creates no second order", async () => {
    const createOrderSpy = vi.spyOn(ordersStore, "createOrder");
    const event = buildSessionCompletedEvent("evt_test_replay", { id: "cs_test_replay" });
    const request1 = signedRequest(event);
    const request2 = signedRequest(event); // identical payload and signature - a true Stripe retry

    const first = await webhookPost(request1);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ received: true });

    const second = await webhookPost(request2);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ received: true, duplicate: true });

    // The order-creation code path never even ran on the replay.
    expect(createOrderSpy).toHaveBeenCalledTimes(1);

    const order = await ordersStore.getOrderBySessionId("cs_test_replay");
    expect(order).not.toBeNull();
  });

  test("rejects a request with an invalid signature", async () => {
    const event = buildSessionCompletedEvent("evt_test_bad_sig", { id: "cs_test_bad_sig" });
    const payload = JSON.stringify(event);
    const res = await webhookPost(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=not_a_real_signature", "content-type": "application/json" },
        body: payload,
      })
    );
    expect(res.status).toBe(400);
  });

  test("rejects a request with no signature header at all", async () => {
    const event = buildSessionCompletedEvent("evt_test_no_sig", { id: "cs_test_no_sig" });
    const res = await webhookPost(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify(event),
      })
    );
    expect(res.status).toBe(400);
  });

  test("ignores event types other than checkout.session.completed without error", async () => {
    const event = { id: "evt_test_other", type: "payment_intent.created", data: { object: {} } };
    const res = await webhookPost(signedRequest(event));
    expect(res.status).toBe(200);
  });
});
