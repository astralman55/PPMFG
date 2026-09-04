import { NextResponse } from "next/server";
import { buildOrderCertificationPacket, FulfilmentError } from "@/lib/orders/fulfilment";
import { CertificateError } from "@/lib/docs/certificate";
import { PacketError } from "@/lib/docs/packet";
import { uploadPrivateFile } from "@/lib/supabase/storage";
import { markOrderCertified, getCustomer } from "@/lib/orders/store";
import { certificationPacketEmail } from "@/lib/email/certification-packet";
import { getResend, resendConfigured, getFromAddress } from "@/lib/email/client";

/**
 * Generates the Certification Packet, archives it to the certs/ bucket, sets
 * the order to certified, and emails it to the customer - CLAUDE_CODE_BRIEF.md
 * §9 Stage 2. Re-running this after a correction (a lot reassigned, a typo
 * fixed) simply overwrites the packet and re-sends - see the upsert below.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;

  let result;
  try {
    result = await buildOrderCertificationPacket(id);
  } catch (err) {
    if (err instanceof FulfilmentError || err instanceof CertificateError || err instanceof PacketError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
  const { packetPdf, order, certNumber } = result;

  const path = `${order.order_number}.pdf`;
  await uploadPrivateFile("certs", path, packetPdf, "application/pdf", { upsert: true });
  const updatedOrder = await markOrderCertified(order.id, path);

  const customer = await getCustomer(order.customer_id);
  if (!customer?.email) {
    console.warn(`[ops/packet] order ${order.order_number} certified but has no customer email to send to.`);
  } else if (!resendConfigured()) {
    console.warn(`[ops/packet] order ${order.order_number} certified but RESEND_API_KEY is not configured, so no email was sent.`);
  } else {
    const { subject, html, text } = certificationPacketEmail({ orderNumber: order.order_number, certNumber });
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to: customer.email,
      subject,
      html,
      text,
      attachments: [{ filename: `certification-packet-${order.order_number}.pdf`, content: packetPdf }],
    });
    if (error) {
      console.error(`[ops/packet] order ${order.order_number} certified but the email failed to send: ${error.message}`);
    }
  }

  return NextResponse.json({ order: updatedOrder });
}
