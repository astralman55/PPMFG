import { Resend } from "resend";

/**
 * Server-only Resend client for outbound order email. Same
 * configured-or-throw pattern as lib/stripe/client.ts and
 * lib/supabase/admin.ts.
 *
 * Resend will send from its own onboarding@resend.dev sender with no DNS
 * setup at all, which is enough to prove the whole Stage-1 flow end to end.
 * A verified domain (RESEND_FROM_EMAIL) is only needed before real customers
 * receive mail - see CLAUDE_CODE_BRIEF.md §16.
 */

let cached: Resend | null = null;

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function getResend(): Resend {
  if (cached) return cached;

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "Resend is not configured yet. Add RESEND_API_KEY to .env.local (see CLAUDE_CODE_BRIEF.md §13)."
    );
  }

  cached = new Resend(key);
  return cached;
}

/**
 * The address order email is sent from. Defaults to Resend's shared
 * onboarding@resend.dev sender, which works with zero DNS setup - useful for
 * testing before a domain is verified. Set RESEND_FROM_EMAIL once a real
 * sending domain is verified in the Resend dashboard.
 */
export function getFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || "Precision Plastics Manufacturing <onboarding@resend.dev>";
}
