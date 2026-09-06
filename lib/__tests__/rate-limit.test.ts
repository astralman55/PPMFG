import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit, getClientIp } from "../rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("allows up to maxRequests within the window", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    }
  });

  test("denies the request past maxRequests within the window", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) checkRateLimit(key, 3, 60_000);
    const result = checkRateLimit(key, 3, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("allows again once the window has elapsed", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) checkRateLimit(key, 3, 60_000);
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
  });

  test("different keys are tracked independently", () => {
    const keyA = `test-a-${Math.random()}`;
    const keyB = `test-b-${Math.random()}`;
    for (let i = 0; i < 3; i++) checkRateLimit(keyA, 3, 60_000);
    expect(checkRateLimit(keyA, 3, 60_000).allowed).toBe(false);
    expect(checkRateLimit(keyB, 3, 60_000).allowed).toBe(true);
  });
});

describe("getClientIp", () => {
  test("reads the first address from a comma-separated x-forwarded-for", () => {
    const req = new Request("http://localhost/x", { headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" } });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  test("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = new Request("http://localhost/x", { headers: { "x-real-ip": "203.0.113.9" } });
    expect(getClientIp(req)).toBe("203.0.113.9");
  });

  test("falls back to \"unknown\" when neither header is present", () => {
    const req = new Request("http://localhost/x");
    expect(getClientIp(req)).toBe("unknown");
  });
});
