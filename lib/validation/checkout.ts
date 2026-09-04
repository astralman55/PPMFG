import { z } from "zod";

/**
 * Validation for POST /api/checkout. Deliberately accepts ONLY these four
 * fields - see CLAUDE_CODE_BRIEF.md §7.3: "POST /api/checkout accepts only
 * { quote_id, email, company, customer_po }." No price field exists here
 * either; the server reads total_cents from the stored quote row.
 */
export const CheckoutRequestSchema = z.object({
  quote_id: z.string().min(1),
  email: z.string().email(),
  company: z.string().max(200).nullable().optional(),
  customer_po: z.string().max(80).nullable().optional(),
});

export type CheckoutRequestPayload = z.infer<typeof CheckoutRequestSchema>;
