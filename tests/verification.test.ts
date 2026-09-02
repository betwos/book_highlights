import { describe, it, expect } from "vitest";
import {
  CODE_LENGTH,
  MAX_ATTEMPTS,
  RESEND_INTERVAL_MS,
  checkCode,
  expiryFrom,
  generateCode,
  hashCode,
  resendWaitMs,
  type CodeRecord,
} from "@/lib/verification";
import { isEmailShaped, normalizeEmail, passwordProblem } from "@/lib/accounts";

const NOW = new Date("2026-09-01T12:00:00Z");

function record(over: Partial<CodeRecord> = {}): CodeRecord {
  return {
    codeHash: hashCode("123456"),
    expiresAt: new Date(NOW.getTime() + 60_000),
    consumedAt: null,
    attempts: 0,
    ...over,
  };
}

describe("generateCode", () => {
  it("is always CODE_LENGTH digits, zero-padded", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(new RegExp(`^\\d{${CODE_LENGTH}}$`));
    }
  });

  it("does not return the same code every time", () => {
    const seen = new Set(Array.from({ length: 50 }, generateCode));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("hashCode", () => {
  it("is stable and ignores surrounding whitespace", () => {
    expect(hashCode("123456")).toBe(hashCode("  123456 "));
  });

  it("does not contain the code itself", () => {
    expect(hashCode("123456")).not.toContain("123456");
  });

  it("differs for different codes", () => {
    expect(hashCode("123456")).not.toBe(hashCode("123457"));
  });
});

describe("checkCode", () => {
  it("accepts the right code before expiry", () => {
    expect(checkCode(record(), "123456", NOW)).toBe("ok");
  });

  it("rejects the wrong code", () => {
    expect(checkCode(record(), "000000", NOW)).toBe("mismatch");
  });

  it("rejects an expired code even when it matches", () => {
    const expired = record({ expiresAt: new Date(NOW.getTime() - 1) });
    expect(checkCode(expired, "123456", NOW)).toBe("expired");
  });

  it("rejects a consumed code even when it matches", () => {
    expect(checkCode(record({ consumedAt: NOW }), "123456", NOW)).toBe("consumed");
  });

  it("rejects once attempts are exhausted, without comparing", () => {
    const spent = record({ attempts: MAX_ATTEMPTS });
    expect(checkCode(spent, "123456", NOW)).toBe("too-many-attempts");
  });

  it("treats expiry as exclusive at the boundary", () => {
    const boundary = record({ expiresAt: NOW });
    expect(checkCode(boundary, "123456", NOW)).toBe("expired");
  });
});

describe("expiryFrom", () => {
  it("is in the future", () => {
    expect(expiryFrom(NOW).getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe("resendWaitMs", () => {
  it("allows the first send", () => {
    expect(resendWaitMs(null, NOW)).toBeNull();
  });

  it("blocks an immediate resend and reports the wait", () => {
    expect(resendWaitMs(NOW, NOW)).toBe(RESEND_INTERVAL_MS);
  });

  it("allows one after the interval has passed", () => {
    const long_ago = new Date(NOW.getTime() - RESEND_INTERVAL_MS);
    expect(resendWaitMs(long_ago, NOW)).toBeNull();
  });
});

describe("account rules", () => {
  it("normalizes case and whitespace so one address is one account", () => {
    expect(normalizeEmail("  Reader@Example.COM ")).toBe("reader@example.com");
  });

  it("catches obvious non-addresses", () => {
    expect(isEmailShaped("reader@example.com")).toBe(true);
    expect(isEmailShaped("reader@example")).toBe(false);
    expect(isEmailShaped("reader")).toBe(false);
    expect(isEmailShaped("two @spaces.com")).toBe(false);
  });

  it("requires length plus a letter and a digit", () => {
    expect(passwordProblem("correct-horse-9")).toBeNull();
    expect(passwordProblem("short1")).not.toBeNull();
    expect(passwordProblem("alllettersnodigit")).not.toBeNull();
    expect(passwordProblem("1234567890")).not.toBeNull();
  });
});
