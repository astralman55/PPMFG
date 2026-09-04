import { NextResponse } from "next/server";
import { assertOrderReadyToCertify, FulfilmentError } from "@/lib/orders/fulfilment";
import { markOrderShipped } from "@/lib/orders/store";

/**
 * Marks an order shipped. CLAUDE_CODE_BRIEF.md §9's hard block is
 * re-checked here directly (not just trusted from the packet step): "an
 * order cannot be marked shipped until every line has a lot_id and that lot
 * has an mtr_path. Not a warning."
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;

  try {
    await assertOrderReadyToCertify(id);
  } catch (err) {
    if (err instanceof FulfilmentError) {
      return NextResponse.json({ error: `Cannot mark shipped: ${err.message}` }, { status: 409 });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const { tracking_number, carrier } = (body ?? {}) as Record<string, unknown>;
  if (typeof tracking_number !== "string" || !tracking_number.trim()) {
    return NextResponse.json({ error: "Tracking number is required." }, { status: 400 });
  }
  if (typeof carrier !== "string" || !carrier.trim()) {
    return NextResponse.json({ error: "Carrier is required." }, { status: 400 });
  }

  const order = await markOrderShipped(id, { tracking_number: tracking_number.trim(), carrier: carrier.trim() });
  return NextResponse.json({ order });
}
