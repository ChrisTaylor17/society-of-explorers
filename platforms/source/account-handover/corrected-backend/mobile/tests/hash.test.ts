import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";
import { payloadHash, sha256Hex } from "../src/hash.ts";

function nodeHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

describe("pure SHA-256 payload hash", () => {
  test("matches published vectors and Node", () => {
    assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const twoBlocks = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
    assert.equal(sha256Hex(twoBlocks), "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    for (const input of ["", "abc", twoBlocks, "relay:ada.linden"]) {
      assert.equal(sha256Hex(input), nodeHash(input));
    }
  });

  test("canonical payload bytes stay stable across key order", () => {
    const left = payloadHash({ planId: "plan-riverside", otherId: "ada" });
    const right = payloadHash({ otherId: "ada", planId: "plan-riverside" });
    assert.equal(left, right);
    assert.equal(left, nodeHash('{"otherId":"ada","planId":"plan-riverside"}'));
    assert.notEqual(payloadHash({ planId: "plan-riverside" }), left);
    assert.notEqual(payloadHash(["ada", "jules"]), payloadHash(["jules", "ada"]));
  });
});
