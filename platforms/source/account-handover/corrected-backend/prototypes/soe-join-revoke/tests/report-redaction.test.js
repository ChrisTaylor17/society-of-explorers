import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorld } from "../src/world.js";
import { createHttp } from "../src/http.js";
import { envelope } from "./helpers.js";

const SENTINELS = [
  "FICTIONAL_LOOKUP_PRIVATE_EXCEPTION_CANARY",
  "reporterId=fictional-redaction-person",
  "contact=fictional-redaction@example.invalid",
  "details=FICTIONAL_SENSITIVE_LOOKING_REPORT_TEXT",
];
const ERROR_RESPONSE = { status: "unavailable", blocker: "The prototype hit an unexpected error." };

for (const phase of ["beforeCommit", "afterCommit"]) {
  test(`report receipt lookup redacts injected ${phase} exceptions in fault mode`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "soe-report-redaction-"));
    let armed = false, injections = 0;
    const world = createWorld({
      databasePath: join(directory, "world.sqlite"),
      allowFaults: true,
      storageTestHooks: { [phase]() {
        if (armed) { injections++; throw new Error(SENTINELS.join("; ")); }
      } },
    });
    const http = createHttp(world);
    // Same real storage and hook, with the normal HTTP error policy as a control.
    const normal = createHttp(new Proxy(world, { get(target, key) {
      if (key === "allowFaults") return false;
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    } }));
    try {
      const { url } = await http.listen(0), normalUrl = (await normal.listen(0)).url;
      const jules = await world.signIn("jules", "synthetic-jules");
      const mina = await world.signIn("mina", "synthetic-mina");
      const report = { otherId: "ada", category: "other", details: "Fictional regression report." };
      const submitted = envelope("jules", "saved", report);
      const receipt = await world.write(jules.token, "report", submitted);
      assert.equal(receipt.status, "committed");
      const lookup = { personId: "jules", endpoint: "report", key: "saved", payloadHash: submitted.payloadHash };
      const cases = [
        { name: "submission control", url, path: "/api/writes/report", token: jules.token,
          raw: JSON.stringify(envelope("jules", "second", report)) },
        { name: "recorded receipt", url, path: "/api/lookup", token: jules.token, raw: JSON.stringify(lookup) },
        { name: "absent receipt", url, path: "/api/lookup", token: jules.token,
          raw: JSON.stringify({ ...lookup, key: "absent" }) },
        { name: "other actor's own absent namespace", url, path: "/api/lookup", token: mina.token,
          raw: JSON.stringify({ ...lookup, personId: "mina" }) },
        { name: "JSON escaped report endpoint", url, path: "/api/lookup", token: jules.token,
          raw: JSON.stringify(lookup).replace('"endpoint":"report"', '"endpoint":"rep\\u006frt"') },
        { name: "normal HTTP policy control", url: normalUrl, path: "/api/lookup", token: jules.token,
          raw: JSON.stringify(lookup) },
      ];
      armed = true;
      for (const item of cases) {
        const before = injections;
        const response = await fetch(item.url + item.path, {
          method: "POST", headers: { authorization: "Bearer " + item.token, "content-type": "application/json" },
          body: item.raw,
        });
        const text = await response.text();
        assert.equal(injections, before + 1, item.name + " must reach the real storage hook");
        assert.equal(response.status, 500, item.name);
        for (const sentinel of SENTINELS) assert.equal(text.includes(sentinel), false, item.name + " reflected " + sentinel);
        assert.equal(text, JSON.stringify(ERROR_RESPONSE), item.name + " must contain only the generic error body");
      }
      armed = false;
      // Faults neither expose receipt contents nor prevent later reconciliation.
      assert.deepEqual(await world.lookup(jules.token, lookup), { status: "recorded", result: receipt });
      assert.deepEqual(await world.lookup(mina.token, { ...lookup, personId: "mina" }), { status: "absent" });
    } finally {
      armed = false;
      await Promise.all([http.close(), normal.close()]);
      await world.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
