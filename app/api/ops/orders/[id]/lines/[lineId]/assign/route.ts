import { NextResponse } from "next/server";
import { getOrderLine, assignLotToLine } from "@/lib/orders/lines-store";
import { getLot } from "@/lib/lots/store";

/**
 * Assigns a lot to one order line during fulfilment - see
 * CLAUDE_CODE_BRIEF.md §10: "The lot dropdown must filter by brand and tier
 * and refuse a mismatch." The UI only offers matching lots, but this is
 * re-checked server-side rather than trusted from the client.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; lineId: string }> }): Promise<Response> {
  const { id: orderId, lineId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const { lot_id, thickness_actual, cut_by, inspected_by } = (body ?? {}) as Record<string, unknown>;

  if (typeof lot_id !== "string" || !lot_id) {
    return NextResponse.json({ error: "lot_id is required." }, { status: 400 });
  }
  if (typeof thickness_actual !== "number" || !Number.isFinite(thickness_actual) || thickness_actual <= 0) {
    return NextResponse.json({ error: "A valid measured actual thickness is required." }, { status: 400 });
  }
  if (typeof cut_by !== "string" || !cut_by.trim()) {
    return NextResponse.json({ error: "Cut by is required." }, { status: 400 });
  }
  if (typeof inspected_by !== "string" || !inspected_by.trim()) {
    return NextResponse.json({ error: "Inspected by is required." }, { status: 400 });
  }

  const line = await getOrderLine(lineId);
  if (!line || line.order_id !== orderId) {
    return NextResponse.json({ error: "Order line not found." }, { status: 404 });
  }

  const lot = await getLot(lot_id);
  if (!lot) return NextResponse.json({ error: "That lot does not exist." }, { status: 404 });
  if (lot.material_code !== line.material_code || lot.thickness_nominal !== line.thickness_nominal) {
    return NextResponse.json({ error: "That lot's material or thickness doesn't match this order line." }, { status: 409 });
  }
  if (lot.certification_tier !== line.certification_tier) {
    return NextResponse.json({ error: "That lot's certification tier doesn't match this order line." }, { status: 409 });
  }
  if (line.brand !== "GENERIC" && lot.brand !== line.brand) {
    return NextResponse.json({ error: `This line was quoted for ${line.brand} specifically; that lot is ${lot.brand}.` }, { status: 409 });
  }

  const updated = await assignLotToLine(lineId, {
    lot_id,
    thickness_actual,
    cut_by: cut_by.trim(),
    inspected_by: inspected_by.trim(),
  });
  return NextResponse.json({ line: updated });
}
