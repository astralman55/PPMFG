import { describe, test, expect } from "vitest";
import { POST } from "../route";
import { quote, type QuoteRequestInput, type PricingConfig } from "@/lib/pricing/engine";
import cfgJson from "@/lib/pricing/config.json";
import goldenData from "../../../../reference/golden_cases.json";

const CFG = cfgJson as unknown as PricingConfig;

function postJson(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

const canonicalInput = goldenData.cases.find((c) => c.name === "canonical_peek_12x12")!.input;

// The route prices against the real lib/pricing/config.json - its actual
// launch values (e.g. remnant_recovery_rate 0.15, marked UNCALIBRATED) -
// not the golden file's config_override, which simulates a hypothetical
// "mature" 0.50 figure purely to exercise the engine's math (see
// golden.test.ts). So the expectation here is computed the same way the
// route computes it, against the same shipped config - not against
// golden_cases.json's `expect` block, which used a different config.
const expected = quote(canonicalInput as unknown as QuoteRequestInput, CFG);

describe("POST /api/quote", () => {
  test("prices a PEEK 12x12x0.5 quote against the live config, and persists it", async () => {
    const res = await postJson(canonicalInput);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals.total_due).toBeCloseTo(expected.totals.total_due, 2);
    expect(body.totals.total_cents).toBe(expected.totals.total_cents);
    expect(body.lead_time.promised_ship_date).toBe(expected.lead_time.promised_ship_date);
    expect(typeof body.quote_id).toBe("string");
    expect(body.quote_id.length).toBeGreaterThan(0);
  });

  test("the server ignores a price the client tries to inject", async () => {
    const tampered = {
      ...(canonicalInput as Record<string, unknown>),
      // A malicious client trying to buy a $900 part for a dollar.
      total_cents: 100,
      totals: { total_due: 1.0, subtotal_goods: 1.0, shipping: 0.0 },
      price: 1.0,
    };
    const res = await postJson(tampered);
    expect(res.status).toBe(200);
    const body = await res.json();
    // The server computed its own price from dimensions/options - the
    // injected fields above were never read.
    expect(body.totals.total_cents).toBe(expected.totals.total_cents);
    expect(body.totals.total_due).toBeCloseTo(expected.totals.total_due, 2);
  });

  test("defaults to today when order_date is omitted", async () => {
    const { order_date: _omit, ...withoutDate } = canonicalInput as Record<string, unknown>;
    void _omit;
    const res = await postJson(withoutDate);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.lead_time.promised_ship_date).toBe("string");
  });

  test("rejects an unknown material with a clear message, not a stack trace", async () => {
    const res = await postJson({
      lines: [{ material_code: "UNOBTAINIUM", length_in: 12, width_in: 12, thickness_in: 0.5 }],
      sourcing_mode: "MASTER_SHEET",
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("unknown material");
  });

  test("rejects malformed JSON with a 400, not a crash", async () => {
    const res = await POST(
      new Request("http://localhost/api/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      })
    );
    expect(res.status).toBe(400);
  });

  test("rejects a request with no line items", async () => {
    const res = await postJson({ lines: [] });
    expect(res.status).toBe(400);
  });
});
