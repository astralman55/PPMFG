import { brand } from "@/lib/brand";

/**
 * The Stage-1 order confirmation email - see CLAUDE_CODE_BRIEF.md §9. Plain
 * HTML built with template strings rather than a component library: the
 * locked stack (§1) names Resend for sending but no templating package, so
 * this stays a single small file instead of adding a new dependency.
 */

export interface OrderConfirmationInput {
  orderNumber: string;
  promisedShipDate: string | null;
  customerEmail: string;
  orderStatusUrl: string;
  amountPaidCents: number;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "to be confirmed";
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function orderConfirmationEmail(input: OrderConfirmationInput): { subject: string; html: string; text: string } {
  const shipDate = formatDate(input.promisedShipDate);
  const total = money(input.amountPaidCents);
  const subject = `${brand.companyName} order ${input.orderNumber} confirmed - ships ${shipDate}`;

  const html = `
<!doctype html>
<html>
  <body style="font-family: Helvetica, Arial, sans-serif; color: #14181C; max-width: 560px; margin: 0 auto; padding: 24px;">
    <p style="font-size: 16px; font-weight: bold; margin-bottom: 0;">${escapeHtml(brand.companyName)}</p>
    <p style="font-size: 20px; font-weight: bold; margin-top: 24px;">Order ${escapeHtml(input.orderNumber)} confirmed</p>
    <p>Thanks for your order. Payment of <strong>${total}</strong> was received and your order is queued for cutting.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 8px 0; color: #6B7280; font-size: 13px;">Order number</td>
        <td style="padding: 8px 0; text-align: right; font-weight: bold;">${escapeHtml(input.orderNumber)}</td>
      </tr>
      <tr style="border-top: 1px solid #E3E3DE;">
        <td style="padding: 8px 0; color: #6B7280; font-size: 13px;">Promised ship date</td>
        <td style="padding: 8px 0; text-align: right; font-weight: bold;">${shipDate}</td>
      </tr>
    </table>
    <p>Your commercial invoice is attached to this email as a PDF. A separate payment receipt from Stripe is on its
      way to your inbox as well.</p>
    <p style="margin-top: 20px; padding: 12px; background: #FCFCFA; border: 1px solid #E3E3DE;">
      <strong>Certification Package - coming separately.</strong> The same business day this order is cut, we'll
      email a Certificate of Conformance naming the actual material lot, plus the mill's Material Test Report for
      that lot.
    </p>
    <p style="margin-top: 20px;">
      <a href="${input.orderStatusUrl}" style="color: #B8710F; font-weight: bold;">View order status</a>
    </p>
    <p style="margin-top: 32px; font-size: 12px; color: #6B7280;">
      Questions about this order? Reply to this email and it will reach us directly.
    </p>
  </body>
</html>`.trim();

  const text = [
    `${brand.companyName}`,
    ``,
    `Order ${input.orderNumber} confirmed`,
    `Payment of ${total} was received and your order is queued for cutting.`,
    ``,
    `Order number: ${input.orderNumber}`,
    `Promised ship date: ${shipDate}`,
    ``,
    `Your commercial invoice is attached to this email as a PDF. A separate payment receipt from Stripe is on its way to your inbox as well.`,
    ``,
    `Certification Package - coming separately. The same business day this order is cut, we'll email a Certificate of Conformance naming the actual material lot, plus the mill's Material Test Report for that lot.`,
    ``,
    `Order status: ${input.orderStatusUrl}`,
    ``,
    `Questions about this order? Reply to this email and it will reach us directly.`,
  ].join("\n");

  return { subject, html, text };
}
