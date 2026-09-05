import { brand } from "@/lib/brand";

/**
 * CLAUDE_CODE_BRIEF.md §20.5 - the "email me this quote" send. Plain HTML
 * template strings, same reasoning as order-confirmation.ts: the locked
 * stack names Resend for sending but no templating package.
 */

export interface QuoteSummaryEmailInput {
  quoteId: string;
  totalDue: number;
  promisedShipDate: string;
  expiresAt: string; // ISO
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function quoteSummaryEmail(input: QuoteSummaryEmailInput): { subject: string; html: string; text: string } {
  const total = money(input.totalDue);
  const shipDate = formatDate(input.promisedShipDate);
  const validUntil = formatDate(input.expiresAt);
  const subject = `Your ${escapeHtml(brand.companyName)} quote - ${total}`;

  const html = `
<!doctype html>
<html>
  <body style="font-family: Helvetica, Arial, sans-serif; color: #14181C; max-width: 560px; margin: 0 auto; padding: 24px;">
    <p style="font-size: 16px; font-weight: bold; margin-bottom: 0;">${escapeHtml(brand.companyName)}</p>
    <p style="font-size: 12px; font-weight: bold; color: #B8710F; margin-top: 4px;">QUOTE - NOT A BILL</p>
    <p style="font-size: 20px; font-weight: bold; margin-top: 16px;">Your quote: ${total}</p>
    <p>Here's the price quote you asked for, attached as a PDF. Nothing has been charged and no payment is due -
      this is a price only.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 8px 0; color: #6B7280; font-size: 13px;">Quote number</td>
        <td style="padding: 8px 0; text-align: right; font-weight: bold;">${escapeHtml(input.quoteId)}</td>
      </tr>
      <tr style="border-top: 1px solid #E3E3DE;">
        <td style="padding: 8px 0; color: #6B7280; font-size: 13px;">If ordered today, ships</td>
        <td style="padding: 8px 0; text-align: right; font-weight: bold;">${shipDate}</td>
      </tr>
      <tr style="border-top: 1px solid #E3E3DE;">
        <td style="padding: 8px 0; color: #6B7280; font-size: 13px;">Valid until</td>
        <td style="padding: 8px 0; text-align: right; font-weight: bold;">${validUntil}</td>
      </tr>
    </table>
    <p style="margin-top: 20px; font-size: 12px; color: #6B7280;">
      Questions about this quote? Reply to this email and it will reach us directly.
    </p>
  </body>
</html>`.trim();

  const text = [
    `${brand.companyName}`,
    `QUOTE - NOT A BILL`,
    ``,
    `Your quote: ${total}`,
    `Here's the price quote you asked for, attached as a PDF. Nothing has been charged and no payment is due.`,
    ``,
    `Quote number: ${input.quoteId}`,
    `If ordered today, ships: ${shipDate}`,
    `Valid until: ${validUntil}`,
    ``,
    `Questions about this quote? Reply to this email and it will reach us directly.`,
  ].join("\n");

  return { subject, html, text };
}
