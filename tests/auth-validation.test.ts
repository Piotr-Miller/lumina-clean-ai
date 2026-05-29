import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/auth-validation";

describe("validateNewPassword", () => {
  it("accepts a valid matching password at the minimum length", () => {
    const password = "x".repeat(MIN_PASSWORD_LENGTH);
    expect(validateNewPassword(password, password)).toEqual({});
  });

  it("requires the password", () => {
    expect(validateNewPassword("", "")).toEqual({
      password: "Password is required",
      confirmPassword: "Please confirm your password",
    });
  });

  it("rejects a too-short password", () => {
    const short = "x".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validateNewPassword(short, short).password).toBe(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  });

  it("requires the confirmation field", () => {
    expect(validateNewPassword("secret123", "").confirmPassword).toBe("Please confirm your password");
  });

  it("rejects mismatched passwords", () => {
    expect(validateNewPassword("secret123", "secret124").confirmPassword).toBe("Passwords do not match");
  });
});
