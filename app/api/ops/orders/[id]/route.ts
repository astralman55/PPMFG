import { NextResponse } from "next/server";
import { getOrderById, getCustomer } from "@/lib/orders/store";
import { getOrderLines } from "@/lib/orders/lines-store";
import { findCandidateLots, getLot } from "@/lib/lots/store";
import { listRemnantsForOrder } from "@/lib/remnants/store";

/** Full fulfilment detail for one order: the order, its lines, and per-line candidate lots. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const [customer, lines, remnants] = await Promise.all([
    getCustomer(order.customer_id),
    getOrderLines(order.id),
    listRemnantsForOrder(order.id),
  ]);

  const linesWithLots = await Promise.all(
    lines.map(async (line) => ({
      ...line,
      assignedLot: line.lot_id ? await getLot(line.lot_id) : null,
      candidateLots: line.lot_id
        ? []
        : await findCandidateLots({
            material_code: line.material_code,
            brand: line.brand,
            certification_tier: line.certification_tier,
            thickness_nominal: line.thickness_nominal,
          }),
    }))
  );

  return NextResponse.json({ order, customer, lines: linesWithLots, remnants });
}
