import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPasscode(passcode: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(passcode, salt, 32).toString("hex");
  return { hash, salt };
}

export function checkPasscode(passcode: string, salt: string, hash: string): boolean {
  const got = scryptSync(passcode, salt, 32);
  const expected = Buffer.from(hash, "hex");
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}
