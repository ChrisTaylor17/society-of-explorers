import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { contactDisclosure } from "../src/consent.ts";
import { REVOCATION_LIMIT } from "../src/copy.js";
import { payloadHash } from "../src/hash.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function sha(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

test("vendored Meridian consent and passcode files are unchanged", () => {
  assert.equal(sha(join(root, "src/consent.ts")), "9792acdf5a7177ebd6ad45ac64a3866f9ed5257050e39d487b1d6c14fcf96524");
  assert.equal(sha(join(root, "src/passcode.ts")), "95c2892e6dc2d23e35d441657aeb65742645791300f287cbd5701aaf366367f3");
});

test("contactDisclosure keeps the Meridian reason strings", () => {
  const planId = "plan";
  const both = [
    { grantorId: "ada", granteeId: "jules", scope: "contact", resourceId: planId, status: "active" },
    { grantorId: "jules", granteeId: "ada", scope: "contact", resourceId: planId, status: "active" },
  ];
  assert.equal(
    contactDisclosure({ viewerId: "ada", otherId: "jules", planId, invitationStatus: "invited", grants: both }).reason,
    "They have not accepted the plan yet.",
  );
  assert.equal(
    contactDisclosure({ viewerId: "ada", otherId: "jules", planId, invitationStatus: "accepted", grants: both.slice(0, 1) }).reason,
    "You accepted disclosure. It stays hidden until they accept too.",
  );
  assert.equal(
    contactDisclosure({ viewerId: "jules", otherId: "ada", planId, invitationStatus: "accepted", grants: both.slice(0, 1) }).reason,
    "They accepted disclosure. It stays hidden until you accept too.",
  );
  const shown = contactDisclosure({ viewerId: "ada", otherId: "jules", planId, invitationStatus: "accepted", grants: both });
  assert.equal(shown.visible, true);
  assert.equal(shown.reason, "Both of you accepted. The relay handle is visible.");
  const revoked = contactDisclosure({
    viewerId: "ada",
    otherId: "jules",
    planId,
    invitationStatus: "accepted",
    grants: [{ ...both[0], status: "revoked" }, both[1]],
  });
  assert.equal(revoked.visible, false);
  assert.equal(revoked.reason, "You revoked contact, so the relay is hidden even though they had accepted.");
});

test("payload hash matches the mobile canonical bytes", () => {
  const expected = createHash("sha256").update('{"otherId":"ada","planId":"plan-riverside"}').digest("hex");
  assert.equal(payloadHash({ planId: "plan-riverside", otherId: "ada" }), expected);
});

test("copy does not describe revocation as destroying a copy someone already saw", () => {
  const files = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "consent-lock.test.js") continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(js|ts|md)$/.test(name)) files.push(path);
    }
  }
  walk(root);
  const banned = [/wipe/i, /forgotten/i, /eras(e|es|ed|ing) what/i, /delete the relay/i, /removes what they saw/i];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const pattern of banned) assert.doesNotMatch(text, pattern, file);
  }
  assert.equal(REVOCATION_LIMIT, "Revoking stops future contact access. It cannot erase information someone already saw.");
  assert.match(readFileSync(join(root, "README.md"), "utf8"), /working local prototype/);
});
