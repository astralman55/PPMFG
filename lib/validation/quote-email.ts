import { z } from "zod";

/**
 * Validation for POST /api/quote/email - CLAUDE_CODE_BRIEF.md §20.5. `email`
 * is only ever used the FIRST time a given quote is emailed (to set the
 * address of record); every later call to the same quote_id ignores this
 * field and reuses the address already on file - see the route for why.
 */
export const QuoteEmailRequestSchema = z.object({
  quote_id: z.string().min(1),
  email: z.string().email(),
});

export type QuoteEmailRequestPayload = z.infer<typeof QuoteEmailRequestSchema>;
