import { describe, expect, it } from "vitest";
import { decideSignup, signupMode, signupNeedsInvite, type SignupEnv } from "./signup-policy";

/** No `STEVE_*` keys at all — a deploy that never heard of this file. */
const bare: SignupEnv = {};

describe("signupMode", () => {
  it("defaults to claim, including for a value it does not recognise", () => {
    expect(signupMode(bare)).toBe("claim");
    expect(signupMode({ STEVE_SIGNUP_MODE: "nonsense" })).toBe("claim");
  });

  it("reads open and closed, case- and space-insensitively", () => {
    expect(signupMode({ STEVE_SIGNUP_MODE: " OPEN " })).toBe("open");
    expect(signupMode({ STEVE_SIGNUP_MODE: "Closed" })).toBe("closed");
  });
});

describe("decideSignup", () => {
  it("lets the first account claim an unconfigured install", () => {
    expect(
      decideSignup({ email: "owner@example.com", claim: "unclaimed", env: bare }),
    ).toEqual({ allowed: true });
  });

  // The whole point of the module: this is the case that used to be allowed.
  it("refuses a stranger once the install is claimed and nothing is configured", () => {
    expect(
      decideSignup({ email: "stranger@example.com", claim: "claimed", env: bare }),
    ).toEqual({ allowed: false, reason: "invite_required" });
  });

  it("accepts an allowlisted email on a claimed install", () => {
    const env: SignupEnv = { STEVE_SIGNUP_ALLOWED_EMAILS: "a@example.com, B@Example.com" };
    expect(decideSignup({ email: "  B@example.COM ", claim: "claimed", env }).allowed).toBe(true);
    expect(decideSignup({ email: "c@example.com", claim: "claimed", env }).allowed).toBe(false);
  });

  it("accepts the invite code and refuses a wrong or absent one", () => {
    const env: SignupEnv = { STEVE_SIGNUP_INVITE_CODE: "s3cret-code" };
    const at = (inviteCode?: string) =>
      decideSignup({ email: "new@example.com", inviteCode, claim: "claimed", env }).allowed;

    expect(at("s3cret-code")).toBe(true);
    expect(at(" s3cret-code ")).toBe(true);
    expect(at("s3cret-cod")).toBe(false);
    expect(at("")).toBe(false);
    expect(at(undefined)).toBe(false);
  });

  it("never treats an unset invite code as a matching empty one", () => {
    expect(
      decideSignup({ email: "new@example.com", inviteCode: "", claim: "claimed", env: bare })
        .allowed,
    ).toBe(false);
  });

  // The production incident this tri-state exists for: a cold instance could
  // not reach Postgres, `hasAnyAccount()` fell back to an absent file and
  // reported false, and the gate read that as "fresh install, help yourself".
  it("refuses when the claim state could not be determined", () => {
    expect(decideSignup({ email: "x@example.com", claim: "unknown", env: bare })).toEqual({
      allowed: false,
      reason: "unavailable",
    });
  });

  it("an unknown claim state is not rescued by an invite code or an allowlist", () => {
    const env: SignupEnv = {
      STEVE_SIGNUP_INVITE_CODE: "code",
      STEVE_SIGNUP_ALLOWED_EMAILS: "x@example.com",
    };
    expect(
      decideSignup({ email: "x@example.com", inviteCode: "code", claim: "unknown", env }).allowed,
    ).toBe(false);
  });

  // `open` is an explicit choice to accept anyone, so an outage does not
  // change the answer — there was no gate to fail closed.
  it("open is unaffected by an unknown claim state", () => {
    expect(
      decideSignup({ email: "x@example.com", claim: "unknown", env: { STEVE_SIGNUP_MODE: "open" } })
        .allowed,
    ).toBe(true);
  });

  it("open lets anyone in, claimed or not", () => {
    const env: SignupEnv = { STEVE_SIGNUP_MODE: "open" };
    expect(decideSignup({ email: "x@example.com", claim: "claimed", env }).allowed).toBe(true);
  });

  it("closed refuses even the first account, and even with a valid code", () => {
    const env: SignupEnv = { STEVE_SIGNUP_MODE: "closed", STEVE_SIGNUP_INVITE_CODE: "code" };
    expect(decideSignup({ email: "x@example.com", claim: "unclaimed", env })).toEqual({
      allowed: false,
      reason: "closed",
    });
    expect(
      decideSignup({ email: "x@example.com", inviteCode: "code", claim: "claimed", env })
        .allowed,
    ).toBe(false);
  });
});

describe("signupNeedsInvite", () => {
  it("only asks for a code when one is configured and the install is claimed", () => {
    const withCode: SignupEnv = { STEVE_SIGNUP_INVITE_CODE: "code" };
    expect(signupNeedsInvite("claimed", withCode)).toBe(true);
    expect(signupNeedsInvite("unclaimed", withCode)).toBe(false);
    expect(signupNeedsInvite("claimed", bare)).toBe(false);
    // Cannot tell -> behave as though claimed, so the form never renders as a
    // fresh install waiting to be taken over.
    expect(signupNeedsInvite("unknown", withCode)).toBe(true);
    expect(signupNeedsInvite("claimed", { ...withCode, STEVE_SIGNUP_MODE: "open" })).toBe(false);
  });
});
