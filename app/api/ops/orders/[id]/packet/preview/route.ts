import { NextResponse } from "next/server";
import { buildOrderCertificationPacket, FulfilmentError } from "@/lib/orders/fulfilment";
import { CertificateError } from "@/lib/docs/certificate";
import { PacketError } from "@/lib/docs/packet";

/**
 * Generates the Certification Packet and returns the PDF bytes directly for
 * the operator to look at - CLAUDE_CODE_BRIEF.md §10: "generate packet,
 * preview, send." Nothing is stored or emailed; regenerating this costs
 * nothing and reflects whatever lots are currently assigned.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const { packetPdf, order } = await buildOrderCertificationPacket(id);
    return new Response(new Uint8Array(packetPdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="packet-preview-${order.order_number}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof FulfilmentError || err instanceof CertificateError || err instanceof PacketError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
