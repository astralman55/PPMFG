import { z } from "zod";

/**
 * Validation for POST /api/quote. Deliberately has no price field anywhere -
 * the browser sends dimensions and options only. Unknown keys (including
 * anything a tampering client tries to inject, like a total) are silently
 * stripped by zod's default object behaviour, never read by the engine.
 */

export const LineItemSchema = z.object({
  material_code: z.string().min(1),
  length_in: z.number().positive(),
  width_in: z.number().positive(),
  thickness_in: z.number().positive(),
  qty: z.number().int().positive().optional(),
  part_ref: z.string().max(40).optional(),
  brand: z.string().min(1).optional(),
  certification_tier: z.string().min(1).optional(),
  tolerance_tier: z.string().min(1).optional(),
  edge_finish: z.string().min(1).optional(),
  face_finish: z.string().min(1).optional(),
  anneal: z.boolean().optional(),
  add_ons: z.array(z.string()).nullable().optional(),
});

export const QuoteRequestSchema = z.object({
  lines: z.array(LineItemSchema).min(1).max(25),
  lead_tier: z.string().min(1).optional(),
  dest_zip: z.string().min(1).max(10).optional(),
  order_add_ons: z.array(z.string()).nullable().optional(),
  sourcing_mode: z.string().nullable().optional(),
  dropcut_quoted_cost: z.number().nullable().optional(),
  /** ISO "YYYY-MM-DD". If omitted, the server fills in today's date. */
  order_date: z.string().nullable().optional(),
});

export type QuoteRequestPayload = z.infer<typeof QuoteRequestSchema>;
