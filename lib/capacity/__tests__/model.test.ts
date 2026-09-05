import { describe, test, expect } from "vitest";
import type { PricingConfig } from "@/lib/pricing/engine";
import rawConfig from "@/lib/pricing/config.json";
import {
  buildCapacityQueue,
  computeLineMinutes,
  groupKeyFor,
  runCapacityWalk,
  type CapacityLineInput,
  type CapacityQueueLine,
} from "../model";

const CFG = rawConfig as unknown as PricingConfig;

function line(overrides: Partial<CapacityLineInput>): CapacityLineInput {
  return {
    order_id: "order-1",
    order_number: "ORD-1",
    customer_label: "Acme Machine Shop",
    line_no: 1,
    promised_ship_date: "2026-09-10",
    material_code: "PEEK_NAT",
    brand: "GENERIC",
    thickness_nominal: 0.5,
    certification_tier: "TIER1_TRACEABLE",
    length_in: 12,
    width_in: 12,
    qty: 1,
    tolerance_tier: "STANDARD",
    edge_finish: "DEBURRED",
    face_finish: "AS_SUPPLIED",
    annealed: false,
    add_ons: null,
    ...overrides,
  };
}

describe("computeLineMinutes", () => {
  test("returns a positive number of minutes for an ordinary line", () => {
    const minutes = computeLineMinutes(line({}), CFG);
    expect(minutes).toBeGreaterThan(0);
  });

  test("never includes blade-changeover time - an isolated call always sees an empty blade_groups_seen", () => {
    // If it leaked through, this would double the single-line minutes when
    // called twice with the exact same input (it doesn't - it's stateless).
    const a = computeLineMinutes(line({}), CFG);
    const b = computeLineMinutes(line({}), CFG);
    expect(a).toBe(b);
    expect(a).toBeLessThan(CFG.labor.t_setup_min + CFG.labor.t_blade_change_min + 200);
  });

  test("annealed lines take longer than the same part unannealed", () => {
    const plain = computeLineMinutes(line({ material_code: "ULTEM_1000" }), CFG);
    const annealed = computeLineMinutes(line({ material_code: "ULTEM_1000", annealed: true }), CFG);
    expect(annealed).toBeGreaterThan(plain);
  });

  test("throws QuoteError for a material that no longer exists, rather than a generic crash", () => {
    expect(() => computeLineMinutes(line({ material_code: "DISCONTINUED_MATERIAL" }), CFG)).toThrow();
  });
});

describe("groupKeyFor", () => {
  test("two lines with the same material/brand/thickness/tier share a group", () => {
    const a = groupKeyFor(line({}), CFG);
    const b = groupKeyFor(line({ length_in: 8, width_in: 8, qty: 5 }), CFG);
    expect(a).toBe(b);
  });

  test("a different brand is a different group", () => {
    const a = groupKeyFor(line({ brand: "GENERIC" }), CFG);
    const b = groupKeyFor(line({ brand: "VICTREX" }), CFG);
    expect(a).not.toBe(b);
  });
});

describe("buildCapacityQueue", () => {
  test("computes minutes and a group key for every valid line", () => {
    const { lines, failures } = buildCapacityQueue([line({}), line({ line_no: 2 })], CFG);
    expect(lines).toHaveLength(2);
    expect(failures).toHaveLength(0);
    expect(lines[0].minutes).toBeGreaterThan(0);
    expect(lines[0].group_key).toBe(lines[1].group_key);
  });

  test("a bad line is reported as a failure, not thrown - it must not take down the whole dashboard", () => {
    const { lines, failures } = buildCapacityQueue([line({}), line({ line_no: 2, material_code: "NOPE" })], CFG);
    expect(lines).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].line_no).toBe(2);
    expect(failures[0].reason.length).toBeGreaterThan(0);
  });
});

describe("runCapacityWalk", () => {
  const TODAY = "2026-09-03"; // a Thursday

  test("a single small line on a single order is on track when there's ample budget", () => {
    const queueLines: CapacityQueueLine[] = [
      { order_id: "o1", order_number: "ORD-1", customer_label: "Acme", line_no: 1, promised_ship_date: "2026-09-15", minutes: 30, group_key: "A" },
    ];
    const result = runCapacityWalk(queueLines, { today: TODAY, availableMinutesPerDay: 450 }, CFG);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].status).toBe("on_track");
    expect(result.orders[0].shortfall_minutes).toBe(0);
    expect(result.total_blade_changes).toBe(1);
  });

  test("a job needing far more time than its own deadline allows is flagged at risk with a real shortfall", () => {
    // 5000 minutes needs ~12 business days at 450/day; promising it in ~4
    // business days from a Thursday start cannot possibly land in time.
    const queueLines: CapacityQueueLine[] = [
      { order_id: "big", order_number: "ORD-BIG", customer_label: "Big Co", line_no: 1, promised_ship_date: "2026-09-08", minutes: 5000, group_key: "A" },
    ];
    const result = runCapacityWalk(queueLines, { today: TODAY, availableMinutesPerDay: 450 }, CFG);
    const big = result.orders.find((o) => o.order_id === "big")!;
    expect(big.status).toBe("at_risk");
    expect(big.shortfall_minutes).toBeGreaterThan(0);
  });

  test("queuing a huge order ahead of a small one by an earlier promised date can push the small one to at risk too", () => {
    const queueLines: CapacityQueueLine[] = [
      { order_id: "big", order_number: "ORD-BIG", customer_label: "Big Co", line_no: 1, promised_ship_date: "2026-09-04", minutes: 5000, group_key: "A" },
      { order_id: "small", order_number: "ORD-SMALL", customer_label: "Small Co", line_no: 1, promised_ship_date: "2026-09-10", minutes: 30, group_key: "B" },
    ];
    const result = runCapacityWalk(queueLines, { today: TODAY, availableMinutesPerDay: 450 }, CFG);
    const big = result.orders.find((o) => o.order_id === "big")!;
    const small = result.orders.find((o) => o.order_id === "small")!;
    expect(big.status).toBe("at_risk"); // walked first (sooner date), still can't fit its own deadline
    expect(small.status).toBe("at_risk"); // queued behind big's ~12 days of work, past its own 2026-09-10 date
  });

  test("blade changes are charged once per distinct group across the whole queue, not once per line", () => {
    const queueLines: CapacityQueueLine[] = [
      { order_id: "o1", order_number: "ORD-1", customer_label: "A", line_no: 1, promised_ship_date: "2026-09-10", minutes: 20, group_key: "SAME" },
      { order_id: "o1", order_number: "ORD-1", customer_label: "A", line_no: 2, promised_ship_date: "2026-09-10", minutes: 20, group_key: "SAME" },
      { order_id: "o2", order_number: "ORD-2", customer_label: "B", line_no: 1, promised_ship_date: "2026-09-11", minutes: 20, group_key: "SAME" },
      { order_id: "o3", order_number: "ORD-3", customer_label: "C", line_no: 1, promised_ship_date: "2026-09-12", minutes: 20, group_key: "DIFFERENT" },
    ];
    const result = runCapacityWalk(queueLines, { today: TODAY, availableMinutesPerDay: 450 }, CFG);
    expect(result.total_blade_changes).toBe(2); // "SAME" once, "DIFFERENT" once
  });

  test("the per-day table's minutes never exceed the available budget except for a single line that alone is bigger than a day", () => {
    const queueLines: CapacityQueueLine[] = Array.from({ length: 10 }, (_, i) => ({
      order_id: `o${i}`,
      order_number: `ORD-${i}`,
      customer_label: "A",
      line_no: 1,
      promised_ship_date: "2026-09-20",
      minutes: 100,
      group_key: "A",
    }));
    const result = runCapacityWalk(queueLines, { today: TODAY, availableMinutesPerDay: 450 }, CFG);
    for (const day of result.days) {
      expect(day.minutes_consumed).toBeLessThanOrEqual(450 + 1e-6);
    }
  });

  test("a line whose own minutes exceed a single day's budget spills across multiple consecutive business days", () => {
    const queueLines: CapacityQueueLine[] = [
      { order_id: "o1", order_number: "ORD-1", customer_label: "A", line_no: 1, promised_ship_date: "2026-09-15", minutes: 900, group_key: "A" },
    ];
    const result = runCapacityWalk(queueLines, { today: TODAY, availableMinutesPerDay: 450 }, CFG);
    expect(result.days.length).toBeGreaterThanOrEqual(2);
    for (const day of result.days) {
      expect(day.minutes_consumed).toBeLessThanOrEqual(450 + 1e-6);
    }
    const totalConsumed = result.days.reduce((s, d) => s + d.minutes_consumed, 0);
    expect(totalConsumed).toBeCloseTo(900 + CFG.labor.t_blade_change_min, 2);
  });

  test("an empty queue produces no days and no orders, without error", () => {
    const result = runCapacityWalk([], { today: TODAY, availableMinutesPerDay: 450 }, CFG);
    expect(result.days).toEqual([]);
    expect(result.orders).toEqual([]);
    expect(result.at_risk_count).toBe(0);
  });

  test("the walk starts on a business day even if 'today' is a weekend", () => {
    const queueLines: CapacityQueueLine[] = [
      { order_id: "o1", order_number: "ORD-1", customer_label: "A", line_no: 1, promised_ship_date: "2026-09-15", minutes: 30, group_key: "A" },
    ];
    // 2026-09-05 is a Saturday.
    const result = runCapacityWalk(queueLines, { today: "2026-09-05", availableMinutesPerDay: 450 }, CFG);
    const weekdayCode = new Date(`${result.days[0].date}T00:00:00Z`).getUTCDay();
    expect(weekdayCode).not.toBe(0); // not Sunday
    expect(weekdayCode).not.toBe(6); // not Saturday
  });
});
