import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import Stripe from "stripe";
import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";

import { POST as quotePost } from "../../quote/route";
import { POST as webhookPost } from "../../webhooks/stripe/route";
import { POST as lotsPost } from "../lots/route";
import { GET as orderDetailGet } from "../orders/[id]/route";
import { POST as assignPost } from "../orders/[id]/lines/[lineId]/assign/route";
import { GET as packetPreviewGet } from "../orders/[id]/packet/preview/route";
import { POST as shipPost } from "../orders/[id]/ship/route";

/**
 * End-to-end proof of CLAUDE_CODE_BRIEF.md §15's Phase 6 gate: "Full order
 * -> packet, end to end." Goes through the real route handlers exactly as a
 * browser would hit them: price a real quote, fire a genuinely-signed
 * checkout.session.completed webhook (materialising real order_lines),
 * receive real material into the lot library with a real PDF as its MTR,
 * assign it, and prove the hard block from §9 both blocks and then permits
 * shipping.
 */

const WEBHOOK_SECRET = "whsec_test_fake_secret_for_local_testing";

async function makeQuote() {
  const res = await quotePost(
    new Request("http://localhost/api/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lines: [{ material_code: "PEEK_NAT", brand: "GENERIC", certification_tier: "TIER1_TRACEABLE", length_in: 12, width_in: 12, thickness_in: 0.5, qty: 1 }],
        lead_tier: "STD",
        sourcing_mode: "MASTER_SHEET",
        order_date: "2026-09-04",
      }),
    })
  );
  return res.json();
}

function signedWebhookRequest(eventObj: unknown): Request {
  const payload = JSON.stringify(eventObj);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body: payload,
  });
}

async function samplePdfFile(name: string): Promise<File> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  const bytes = await doc.save();
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
}

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake_for_local_testing");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Phase 6 fulfilment flow", () => {
  test("quote -> paid order -> lot received -> assigned -> packet previews -> ships, with the hard block enforced along the way", async () => {
    const quote = await makeQuote();
    const sessionId = `cs_test_fulfilment_${Math.random().toString(36).slice(2, 8)}`;
    const orderNumber = `ORD-TEST-FULFIL-${Math.random().toString(36).slice(2, 8)}`;

    const webhookRes = await webhookPost(
      signedWebhookRequest({
        id: `evt_fulfil_${Math.random().toString(36).slice(2, 8)}`,
        type: "checkout.session.completed",
        data: {
          object: {
            id: sessionId,
            object: "checkout.session",
            customer_details: { email: "shopfloor@example.com", address: { line1: "1 Main St", city: "El Cajon", state: "CA", postal_code: "92020", country: "US" } },
            customer: `cus_test_${Math.random().toString(36).slice(2, 8)}`,
            payment_intent: `pi_test_${Math.random().toString(36).slice(2, 8)}`,
            amount_total: quote.totals.total_cents,
            total_details: { amount_tax: 0 },
            metadata: { quote_id: quote.quote_id, order_number: orderNumber, company: "" },
          },
        },
      })
    );
    expect(webhookRes.status).toBe(200);

    // Find the order id via the ops order-detail-by-id route isn't available
    // by order_number, so pull it from getOrderBySessionId directly - the
    // same lookup the order-confirmed page uses.
    const { getOrderBySessionId } = await import("@/lib/orders/store");
    const order = await getOrderBySessionId(sessionId);
    expect(order).not.toBeNull();
    const orderId = order!.id;

    // Before any lot exists: the hard block refuses both preview and ship.
    const previewBeforeLot = await packetPreviewGet(new Request("http://localhost"), { params: Promise.resolve({ id: orderId }) });
    expect(previewBeforeLot.status).toBe(409);
    const shipBeforeLot = await shipPost(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ tracking_number: "1Z", carrier: "UPS" }) }),
      { params: Promise.resolve({ id: orderId }) }
    );
    expect(shipBeforeLot.status).toBe(409);

    // Receive real material into the lot library with a real PDF as its MTR.
    const mtrFile = await samplePdfFile("mtr.pdf");
    const lotForm = new FormData();
    lotForm.set("lot_number", `LOT-FULFIL-${Math.random().toString(36).slice(2, 8)}`);
    lotForm.set("material_code", "PEEK_NAT");
    lotForm.set("brand", "ENSINGER_TECAPEEK");
    lotForm.set("certification_tier", "TIER1_TRACEABLE");
    lotForm.set("manufacturer", "Ensinger");
    lotForm.set("country_of_origin", "Germany");
    lotForm.set("thickness_nominal", "0.5");
    lotForm.set("received_date", "2026-09-01");
    lotForm.set("mtr", mtrFile);
    const lotRes = await lotsPost(new Request("http://localhost/api/ops/lots", { method: "POST", body: lotForm }));
    expect(lotRes.status).toBe(200);
    const { lot } = await lotRes.json();
    expect(lot.mtr_path).toBeTruthy();

    // The order-detail route should offer this lot as a candidate for the line.
    const detailRes = await orderDetailGet(new Request("http://localhost"), { params: Promise.resolve({ id: orderId }) });
    const detail = await detailRes.json();
    expect(detail.lines).toHaveLength(1);
    const lineId = detail.lines[0].id;
    expect(detail.lines[0].candidateLots.map((l: { id: string }) => l.id)).toContain(lot.id);

    // Assign it.
    const assignRes = await assignPost(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lot_id: lot.id, thickness_actual: 0.521, cut_by: "Operator A", inspected_by: "Operator B" }),
      }),
      { params: Promise.resolve({ id: orderId, lineId }) }
    );
    expect(assignRes.status).toBe(200);

    // Now the packet previews as a real, multi-page PDF: certificate + one MTR.
    const previewRes = await packetPreviewGet(new Request("http://localhost"), { params: Promise.resolve({ id: orderId }) });
    expect(previewRes.status).toBe(200);
    const packetBytes = Buffer.from(await previewRes.arrayBuffer());
    expect(packetBytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const packetDoc = await PDFDocument.load(packetBytes);
    expect(packetDoc.getPageCount()).toBe(2); // 1 certificate page + 1 MTR page

    const parser = new PDFParse({ data: packetBytes });
    const { text } = await parser.getText();
    await parser.destroy();
    expect(text).toContain(orderNumber);
    expect(text).toContain("Operator B");

    // And now shipping succeeds.
    const shipRes = await shipPost(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tracking_number: "1Z999AA10123456784", carrier: "UPS" }),
      }),
      { params: Promise.resolve({ id: orderId }) }
    );
    expect(shipRes.status).toBe(200);
    const { order: shippedOrder } = await shipRes.json();
    expect(shippedOrder.status).toBe("shipped");
    expect(shippedOrder.tracking_number).toBe("1Z999AA10123456784");
  });
});
