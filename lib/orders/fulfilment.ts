import { getOrderLines, type OrderLineRow } from "./lines-store";
import { getLot, type LotRow } from "../lots/store";
import { getOrderById, getCustomer } from "./store";
import { downloadPrivateFile } from "../supabase/storage";
import { renderCertificatePdf, type CertificateLine } from "../docs/certificate";
import { buildCertificationPacket } from "../docs/packet";

/**
 * The hard block from CLAUDE_CODE_BRIEF.md §9: "an order cannot be marked
 * shipped until every line has a lot_id and that lot has an mtr_path. Not a
 * warning." Enforced here once and reused by both the packet-generation
 * route (which can't build a real certificate without this anyway) and the
 * mark-shipped route (the actual gate the brief calls out by name).
 */
export class FulfilmentError extends Error {}

export async function assertOrderReadyToCertify(
  orderId: string
): Promise<{ lines: OrderLineRow[]; lots: Map<string, LotRow> }> {
  const lines = await getOrderLines(orderId);
  if (lines.length === 0) {
    throw new FulfilmentError("This order has no lines to certify.");
  }

  const lots = new Map<string, LotRow>();
  for (const line of lines) {
    if (!line.lot_id) {
      throw new FulfilmentError(`Line ${line.line_no} has no lot assigned yet.`);
    }
    if (!lots.has(line.lot_id)) {
      const lot = await getLot(line.lot_id);
      if (!lot) throw new FulfilmentError(`Line ${line.line_no} references a lot that no longer exists.`);
      lots.set(line.lot_id, lot);
    }
    const lot = lots.get(line.lot_id)!;
    if (!lot.mtr_path) {
      throw new FulfilmentError(
        `Line ${line.line_no}'s lot (${lot.lot_number}) has no Material Test Report uploaded yet.`
      );
    }
  }

  return { lines, lots };
}

/**
 * Generates the Certification Packet for an order: the Certificate of
 * Conformance (built fresh from the current lot assignments, never cached)
 * merged with every distinct assigned lot's Material Test Report - see
 * CLAUDE_CODE_BRIEF.md §9 Stage 2. Pure generation, no storage writes and no
 * email - callers decide whether this is a throwaway preview or the real
 * send (app/api/ops/orders/[id]/packet/{preview,send}/route.ts).
 */
export async function buildOrderCertificationPacket(orderId: string): Promise<{
  packetPdf: Buffer;
  order: NonNullable<Awaited<ReturnType<typeof getOrderById>>>;
  certNumber: string;
}> {
  const order = await getOrderById(orderId);
  if (!order) throw new FulfilmentError("Order not found.");

  const { lines, lots } = await assertOrderReadyToCertify(orderId);
  const customer = await getCustomer(order.customer_id);

  const certLines: CertificateLine[] = lines.map((line) => {
    const lot = line.lot_id ? lots.get(line.lot_id)! : null;
    return {
      line_no: line.line_no,
      part_ref: line.part_ref,
      material_code: line.material_code,
      qty: line.qty,
      length_in: line.length_in,
      width_in: line.width_in,
      thickness_nominal: line.thickness_nominal,
      thickness_actual: line.thickness_actual,
      tolerance_tier: line.tolerance_tier,
      edge_finish: line.edge_finish,
      face_finish: line.face_finish,
      annealed: line.annealed,
      certification_tier: line.certification_tier,
      inspected_by: line.inspected_by,
      lot: lot
        ? {
            lot_number: lot.lot_number,
            brand: lot.brand,
            manufacturer: lot.manufacturer,
            country_of_origin: lot.country_of_origin ?? null,
          }
        : null,
    };
  });

  const certNumber = order.order_number.replace(/^ORD-/, "CERT-");
  const shipAddress = order.ship_address as {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
  } | null;

  const certificatePdf = await renderCertificatePdf({
    certNumber,
    certDate: new Date().toISOString(),
    orderNumber: order.order_number,
    customerPo: order.customer_po,
    soldTo: { company: customer?.company ?? null, email: customer?.email ?? "" },
    shipTo: shipAddress,
    lines: certLines,
  });

  const uniqueLots = Array.from(lots.values());
  const mtrBuffers = await Promise.all(uniqueLots.map((lot) => downloadPrivateFile("mtr", lot.mtr_path!)));

  const packetPdf = await buildCertificationPacket(certificatePdf, mtrBuffers);
  return { packetPdf, order, certNumber };
}
