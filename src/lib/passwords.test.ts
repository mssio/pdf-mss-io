import { describe, expect, test } from "vitest";

import { generateOwnerPassword, validateNewPassword } from "@/lib/passwords";

describe("generateOwnerPassword", () => {
  test("43 base64url characters from 32 random bytes", () => {
    const password = generateOwnerPassword();
    expect(password).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test("different every time", () => {
    expect(generateOwnerPassword()).not.toBe(generateOwnerPassword());
  });
});

describe("validateNewPassword", () => {
  test("required", () => expect(validateNewPassword("", "")).toBe("Password is required."));
  test("must match", () => expect(validateNewPassword("abc", "abd")).toBe("Passwords don't match."));
  test("ok", () => expect(validateNewPassword("abc", "abc")).toBeNull());
});
