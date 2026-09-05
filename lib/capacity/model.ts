import { quote, QuoteError, add_business_days, type PricingConfig, type LineItemInput } from "@/lib/pricing/engine";

/**
 * CLAUDE_CODE_BRIEF.md §21 (Phase 13) - pure, framework-agnostic capacity
 * planning. No I/O here at all: the API route (server) assembles real order
 * data into CapacityLineInput[]; the ops page (client) calls these same
 * functions directly for the "available minutes per day" slider and the
 * hypothetical-order test, so both stay in lockstep with zero network
 * round-trips for what should feel instant.
 */

export interface CapacityLineInput {
  order_id: string;
  order_number: string;
  customer_label: string;
  line_no: number;
  promised_ship_date: string; // ISO "YYYY-MM-DD"
  material_code: string;
  brand: string;
  thickness_nominal: number;
  certification_tier: string;
  length_in: number;
  width_in: number;
  qty: number;
  tolerance_tier: string;
  edge_finish: string;
  face_finish: string;
  annealed: boolean;
  add_ons: string[] | null;
}

export interface CapacityQueueLine {
  order_id: string;
  order_number: string;
  customer_label: string;
  line_no: number;
  promised_ship_date: string;
  minutes: number;
  group_key: string;
}

export interface MinutesComputeFailure {
  order_id: string;
  order_number: string;
  line_no: number;
  reason: string;
}

export interface BuildQueueResult {
  lines: CapacityQueueLine[];
  failures: MinutesComputeFailure[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Same grouping key the nest board uses (cfg.nesting.queue_group_key -
 * material_code, brand, thickness_nominal, certification_tier), so "how many
 * blade changeovers remain" here means exactly what it means on the nest
 * board. Note this is coarser in one direction than the pricing engine's own
 * blade_change tracking (which keys on the material's blade_group alone, so
 * two different brands of the same material sharing a blade would count as
 * one changeover there but two "groups" here) - a deliberate, documented
 * simplification per §21.3's explicit instruction to reuse this exact key,
 * and a conservative one for staffing purposes.
 */
export function groupKeyFor(
  row: Pick<CapacityLineInput, "material_code" | "brand" | "thickness_nominal" | "certification_tier">,
  cfg: PricingConfig
): string {
  const fields = cfg.nesting.queue_group_key as (keyof typeof row)[];
  return fields.map((f) => String(row[f])).join("|");
}

/**
 * Fresh labor minutes for one line, recomputed against CURRENT config -
 * never a frozen quote snapshot (§21.2). Blade-changeover time is
 * deliberately excluded: an isolated quote() call always sees an empty
 * blade_groups_seen, so it always charges one blade change - but §21.3
 * charges blade time once per distinct GROUP across the whole queue, not
 * once per line, so that gets added back separately by the caller.
 * Annealing's own hands-on handling time (t_handling_min) is real operator
 * time not already folded into labor.t_total_min, so it's added here.
 */
export function computeLineMinutes(row: CapacityLineInput, cfg: PricingConfig): number {
  const line: LineItemInput = {
    material_code: row.material_code,
    length_in: row.length_in,
    width_in: row.width_in,
    thickness_in: row.thickness_nominal,
    qty: row.qty,
    brand: row.brand,
    certification_tier: row.certification_tier,
    tolerance_tier: row.tolerance_tier,
    edge_finish: row.edge_finish,
    face_finish: row.face_finish,
    anneal: row.annealed,
    add_ons: row.add_ons,
  };
  const result = quote({ lines: [line] }, cfg);
  const ln = result.lines[0];
  return ln.labor.t_total_min - ln.labor.t_blade_min + ln.annealing.t_handling_min;
}

/**
 * Recomputes every line's minutes and group key. A line that no longer
 * validates against current config (e.g. a discontinued material) is
 * skipped, not fatal - one stale order line must never take down the whole
 * dashboard. Skipped lines are reported in `failures` so the operator can
 * see something needs attention.
 */
export function buildCapacityQueue(rows: CapacityLineInput[], cfg: PricingConfig): BuildQueueResult {
  const lines: CapacityQueueLine[] = [];
  const failures: MinutesComputeFailure[] = [];

  for (const row of rows) {
    try {
      const minutes = computeLineMinutes(row, cfg);
      lines.push({
        order_id: row.order_id,
        order_number: row.order_number,
        customer_label: row.customer_label,
        line_no: row.line_no,
        promised_ship_date: row.promised_ship_date,
        minutes: round2(minutes),
        group_key: groupKeyFor(row, cfg),
      });
    } catch (e) {
      failures.push({
        order_id: row.order_id,
        order_number: row.order_number,
        line_no: row.line_no,
        reason: e instanceof QuoteError ? e.message : "Could not recompute this line against current config.",
      });
    }
  }

  return { lines, failures };
}

export interface DayPlan {
  date: string;
  minutes_consumed: number;
  minutes_available: number;
  blade_changes: number;
  order_numbers: string[];
}

export interface OrderOutcome {
  order_id: string;
  order_number: string;
  customer_label: string;
  promised_ship_date: string;
  status: "on_track" | "at_risk";
  shortfall_minutes: number;
  scheduled_through: string;
}

export interface CapacityWalkResult {
  days: DayPlan[];
  orders: OrderOutcome[];
  total_minutes: number;
  total_blade_changes: number;
  at_risk_count: number;
}

/**
 * The day-by-day walk (§21.4). Lines are processed in promised-ship-date
 * order, consuming a fixed per-day minute budget; a blade change is charged
 * the first time (and only the first time) each group is encountered. A
 * job bigger than one day's budget genuinely spills across several
 * consecutive business days rather than overflowing a single day.
 *
 * An order is "at risk" if any minutes belonging to it land on a day
 * strictly after its promised_ship_date; the shortfall is the total minutes
 * of ITS lines that spilled past that date - a direct, explainable "how much
 * of this order's own work won't be done in time."
 */
export function runCapacityWalk(
  lines: CapacityQueueLine[],
  opts: { today: string; availableMinutesPerDay: number },
  cfg: PricingConfig
): CapacityWalkResult {
  const sorted = [...lines].sort((a, b) => {
    if (a.promised_ship_date !== b.promised_ship_date) return a.promised_ship_date < b.promised_ship_date ? -1 : 1;
    if (a.order_number !== b.order_number) return a.order_number < b.order_number ? -1 : 1;
    return a.line_no - b.line_no;
  });

  const bladeMinutes = cfg.labor.t_blade_change_min;
  const chargedGroups = new Set<string>();
  const days: DayPlan[] = [];
  const lastDayForOrder = new Map<string, string>();
  const shortfallByOrder = new Map<string, number>();
  const orderMeta = new Map<string, { order_number: string; customer_label: string; promised_ship_date: string }>();

  let currentDate = add_business_days(opts.today, 0, cfg); // snaps forward onto a business day
  let minutesUsedToday = 0;
  let bladeChangesToday = 0;
  let orderNumbersToday = new Set<string>();

  function closeDay() {
    days.push({
      date: currentDate,
      minutes_consumed: round2(minutesUsedToday),
      minutes_available: opts.availableMinutesPerDay,
      blade_changes: bladeChangesToday,
      order_numbers: Array.from(orderNumbersToday).sort(),
    });
  }

  /**
   * Consumes `minutesNeeded` against the day budget, spilling into
   * subsequent business days as needed - a job bigger than one day's budget
   * genuinely occupies several days, it doesn't just overflow the first one.
   */
  function consume(minutesNeeded: number, line: CapacityQueueLine) {
    let need = minutesNeeded;
    while (need > 0) {
      const capacityLeft = opts.availableMinutesPerDay - minutesUsedToday;
      if (capacityLeft <= 0) {
        closeDay();
        currentDate = add_business_days(currentDate, 1, cfg);
        minutesUsedToday = 0;
        bladeChangesToday = 0;
        orderNumbersToday = new Set<string>();
        continue;
      }
      const chunk = Math.min(need, capacityLeft);
      minutesUsedToday += chunk;
      need -= chunk;
      orderNumbersToday.add(line.order_number);
      lastDayForOrder.set(line.order_id, currentDate);
      if (currentDate > line.promised_ship_date) {
        shortfallByOrder.set(line.order_id, (shortfallByOrder.get(line.order_id) ?? 0) + chunk);
      }
    }
  }

  for (const line of sorted) {
    if (!orderMeta.has(line.order_id)) {
      orderMeta.set(line.order_id, {
        order_number: line.order_number,
        customer_label: line.customer_label,
        promised_ship_date: line.promised_ship_date,
      });
    }

    const isNewGroup = !chargedGroups.has(line.group_key);
    if (isNewGroup) {
      chargedGroups.add(line.group_key);
      bladeChangesToday += 1;
      consume(bladeMinutes, line);
    }
    consume(line.minutes, line);
  }
  if (minutesUsedToday > 0) closeDay();

  const orders: OrderOutcome[] = Array.from(orderMeta.entries())
    .map(([order_id, meta]) => {
      const shortfall = shortfallByOrder.get(order_id) ?? 0;
      return {
        order_id,
        order_number: meta.order_number,
        customer_label: meta.customer_label,
        promised_ship_date: meta.promised_ship_date,
        status: (shortfall > 0 ? "at_risk" : "on_track") as "on_track" | "at_risk",
        shortfall_minutes: round2(shortfall),
        scheduled_through: lastDayForOrder.get(order_id) ?? meta.promised_ship_date,
      };
    })
    .sort((a, b) => (a.promised_ship_date < b.promised_ship_date ? -1 : a.promised_ship_date > b.promised_ship_date ? 1 : 0));

  return {
    days,
    orders,
    total_minutes: round2(lines.reduce((s, l) => s + l.minutes, 0) + chargedGroups.size * bladeMinutes),
    total_blade_changes: chargedGroups.size,
    at_risk_count: orders.filter((o) => o.status === "at_risk").length,
  };
}
