import Stripe from "stripe";

/**
 * Server-only Stripe client. Checkout is hosted-redirect mode - the
 * publishable key and Stripe.js are never needed, because the browser is
 * never shown a card field (see CLAUDE_CODE_BRIEF.md §8).
 */

let cached: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Throws a clear, owner-facing error if Stripe hasn't been configured yet,
 * rather than failing deep inside an API call with a confusing network error.
 */
export function getStripe(): Stripe {
  if (cached) return cached;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Stripe is not configured yet. Add STRIPE_SECRET_KEY to .env.local " +
        "(see CLAUDE_CODE_BRIEF.md §13). Use a test-mode key (starts with sk_test_) " +
        "until the whole flow works end to end."
    );
  }

  cached = new Stripe(key);
  return cached;
}
