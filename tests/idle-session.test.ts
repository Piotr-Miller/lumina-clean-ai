import { describe, expect, it } from "vitest";

import { ACTIVITY_COOKIE, IDLE_SIGNOUT_MESSAGE, IDLE_TIMEOUT_MS, decideIdleAction } from "@/lib/idle-session";

// A fixed, arbitrary "now" — the decision is pure, so any anchor works.
const NOW = 1_750_000_000_000;

describe("exported constants", () => {
  it("timeout is exactly 30 minutes", () => {
    expect(IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });

  it("cookie name is stable (middleware + devtools contract)", () => {
    expect(ACTIVITY_COOKIE).toBe("lc-last-activity");
  });

  it("signout notice names the 30-minute window", () => {
    expect(IDLE_SIGNOUT_MESSAGE).toContain("30 minutes");
  });
});

describe("anonymous requests", () => {
  it("no cookie → noop", () => {
    expect(decideIdleAction(false, undefined, NOW)).toBe("noop");
  });

  it("lingering cookie → cleanup (prevents stale-cookie carryover into a future session)", () => {
    expect(decideIdleAction(false, String(NOW - 1000), NOW)).toBe("cleanup");
  });

  it("even a malformed lingering cookie → cleanup", () => {
    expect(decideIdleAction(false, "garbage", NOW)).toBe("cleanup");
  });

  it("empty-valued cookie still counts as present → cleanup", () => {
    expect(decideIdleAction(false, "", NOW)).toBe("cleanup");
  });
});

describe("authenticated — missing or malformed cookie starts a fresh window", () => {
  it.each([
    ["missing", undefined],
    ["empty string", ""],
    ["non-numeric", "garbage"],
    ["mixed digits and letters", "12a3"],
    ["negative", "-5000"],
    ["decimal", "1750000000000.5"],
    ["exponent notation", "1e12"],
    ["whitespace-padded", " 1750000000000"],
  ] as const)("%s → start", (_label, cookieValue) => {
    expect(decideIdleAction(true, cookieValue, NOW)).toBe("start");
  });

  it("future-dated timestamp → start (clock edits/tampering reset the window, never extend it)", () => {
    expect(decideIdleAction(true, String(NOW + 1), NOW)).toBe("start");
  });
});

describe("authenticated — inside the window slides it", () => {
  it("activity just now → refresh", () => {
    expect(decideIdleAction(true, String(NOW), NOW)).toBe("refresh");
  });

  it("1 ms before the threshold → refresh", () => {
    expect(decideIdleAction(true, String(NOW - IDLE_TIMEOUT_MS + 1), NOW)).toBe("refresh");
  });
});

describe("authenticated — at/past the window expires", () => {
  it("exactly at the threshold → expire (boundary is inclusive)", () => {
    expect(decideIdleAction(true, String(NOW - IDLE_TIMEOUT_MS), NOW)).toBe("expire");
  });

  it("long past the threshold → expire", () => {
    expect(decideIdleAction(true, String(NOW - 7 * 24 * 60 * 60 * 1000), NOW)).toBe("expire");
  });

  it("epoch zero (ancient cookie) → expire, not malformed", () => {
    expect(decideIdleAction(true, "0", NOW)).toBe("expire");
  });
});
