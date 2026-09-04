import { randomBytes } from "crypto";

/**
 * A short, human-readable order number, distinct from the internal uuid
 * primary key. Not sequential - collisions are checked at insert time via
 * the `orders.order_number` unique constraint, but at this volume the
 * timestamp + random suffix makes a collision effectively impossible.
 */
export function generateOrderNumber(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return `ORD-${y}${m}${d}-${suffix}`;
}
