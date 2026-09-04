import { brand } from "@/lib/brand";

/** The Stage-2 certification email - see CLAUDE_CODE_BRIEF.md §9: "Certification packet in your inbox the same business day we cut." */

export interface CertificationPacketEmailInput {
  orderNumber: string;
  certNumber: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function certificationPacketEmail(input: CertificationPacketEmailInput): { subject: string; html: string; text: string } {
  const subject = `${brand.companyName} order ${input.orderNumber} - certification packet attached`;

  const html = `
<!doctype html>
<html>
  <body style="font-family: Helvetica, Arial, sans-serif; color: #14181C; max-width: 560px; margin: 0 auto; padding: 24px;">
    <p style="font-size: 16px; font-weight: bold; margin-bottom: 0;">${escapeHtml(brand.companyName)}</p>
    <p style="font-size: 20px; font-weight: bold; margin-top: 24px;">Certification packet attached</p>
    <p>Order ${escapeHtml(input.orderNumber)} has been cut and inspected. Attached is your Certification Packet
      (certificate ${escapeHtml(input.certNumber)}), including our Certificate of Conformance and the mill's
      Material Test Report for every lot used.</p>
    <p style="margin-top: 20px; font-size: 12px; color: #6B7280;">
      Questions about this order? Reply to this email and it will reach us directly.
    </p>
  </body>
</html>`.trim();

  const text = [
    brand.companyName,
    "",
    "Certification packet attached",
    `Order ${input.orderNumber} has been cut and inspected. Attached is your Certification Packet (certificate ${input.certNumber}), including our Certificate of Conformance and the mill's Material Test Report for every lot used.`,
    "",
    "Questions about this order? Reply to this email and it will reach us directly.",
  ].join("\n");

  return { subject, html, text };
}
