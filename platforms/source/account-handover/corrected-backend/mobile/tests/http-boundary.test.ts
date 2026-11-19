import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { createMobileClient } from "../src/client.ts";
import { payloadHash } from "../src/hash.ts";
import { createHttpPort, createProbeTransport, HTTP_BLOCKERS } from "../src/http.ts";

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else if (/\.(ts|mjs|html|md|json)$/.test(name)) out.push(path);
  }
  return out;
}

describe("Meridian HTTP boundary", () => {
  test("reads and writes do not touch the transport", async () => {
    const transport = createProbeTransport();
    const port = createHttpPort(transport);
    assert.equal(port.writesEnabled, false);
    const hash = payloadHash({ planId: "plan-riverside" });
    const input = { personId: "jules", idempotencyKey: "k", payloadHash: hash, body: { planId: "plan-riverside" } };
    assert.equal((await port.discover()).status, "unavailable");
    assert.equal((await port.plan("plan-riverside")).status, "unavailable");
    assert.equal((await port.visibility("plan-riverside")).status, "unavailable");
    assert.equal((await port.requestJoin(input)).status, "unavailable");
    assert.equal((await port.acceptDisclosure({ ...input, body: { planId: "plan-riverside", otherId: "ada" } })).status, "unavailable");
    assert.equal((await port.revokeContact({ ...input, body: { permissionId: "grant-1" } })).status, "unavailable");
    assert.equal((await port.lookup({ personId: "jules", endpoint: "join", key: "k", payloadHash: hash })).status, "unavailable");
    assert.equal(transport.calls(), 0);

    const client = createMobileClient(port);
    const blocked = await client.boot();
    assert.equal(blocked.phase, "live-blocked");
    assert.equal(blocked.relay.value, null);
    assert.ok(blocked.blockers.some((line) => line === HTTP_BLOCKERS.discover));
    await client.requestJoin("plan-riverside", "should-not-send");
    await client.reconcile("join", "should-not-send");
    assert.equal(transport.calls(), 0);
    assert.equal(client.ledgerEntries().some((entry) => entry.status === "committed"), false);
  });

  test("the mobile tree does not persist relays, import the server, or carry passcodes", () => {
    const root = join(import.meta.dirname, "..");
    const files = filesUnder(join(root, "src")).concat([join(root, "README.md")]);
    const combined = files.map((path) => readFileSync(path, "utf8")).join("\n");
    for (const word of ["grove", "sketch", "trail", "table", "desk", "reset-the-grove"]) {
      assert.equal(new RegExp(`\\b${word}\\b`).test(combined), false, word);
    }
    assert.equal(/\blocalStorage\s*[.\[]/.test(combined), false);
    assert.equal(/\bsessionStorage\s*[.\[]/.test(combined), false);
    assert.equal(/\bAsyncStorage\b/.test(combined), false);
    assert.equal(/\bSecureStore\b/.test(combined), false);
    assert.equal(/\bwriteFile(Sync)?\b/.test(combined), false);
    const code = files.concat(filesUnder(join(root, "tests")), [join(root, "preview/build.ts")]);
    for (const file of code) {
      const text = readFileSync(file, "utf8");
      assert.equal(/from\s+["'][^"']*meridian\/src\/lib\/(domain|db|actions|seed|receipt)/.test(text), false, file);
    }
    const http = readFileSync(join(root, "src/http.ts"), "utf8");
    assert.equal(http.includes(".send("), false);
    assert.match(http, /writesEnabled: false/);
  });
});
