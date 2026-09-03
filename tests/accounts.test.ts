import { describe, it, expect } from "vitest";
import { isEmailShaped, normalizeEmail, passwordProblem } from "@/lib/accounts";

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
