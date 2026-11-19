import { writeSync } from "node:fs";
import { createWorld } from "../../src/world.js";
import { payloadHash } from "../../src/hash.js";
const [databasePath, mode, actor = "ada", target = "jules"] = process.argv.slice(2);
let armed = false;
const pause = stage => { writeSync(1, JSON.stringify({stage}) + "\n"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); };
const world = createWorld({ databasePath, allowFaults: true, storageTestHooks: {
 beforeCommit() { if (armed && mode === "before") pause("beforeCommit"); },
 afterCommit() { if (armed && mode === "after") pause("afterCommit"); },
} });
const person = await world.signIn(actor, "synthetic-" + actor);
armed = true;
const body = {otherId:target};
const result = await world.write(person.token,"block",{personId:actor,idempotencyKey:"child-block-"+actor,payloadHash:payloadHash(body),body});
await world.close();
writeSync(1, JSON.stringify({stage:"complete",status:result.status,version:result.version}) + "\n");
