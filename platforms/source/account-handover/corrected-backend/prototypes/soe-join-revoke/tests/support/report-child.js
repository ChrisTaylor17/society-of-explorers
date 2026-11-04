import {writeSync} from "node:fs";
import {createWorld} from "../../src/world.js";
import {payloadHash} from "../../src/hash.js";
const [databasePath,phase]=process.argv.slice(2);let armed=false;
function pause(stage){writeSync(1,JSON.stringify({stage})+"\n");Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}
const w=createWorld({databasePath,allowFaults:true,storageTestHooks:{beforeCommit(){if(armed&&phase==="before")pause("before");},afterCommit(){if(armed&&phase==="after")pause("after");}}});
const s=await w.signIn("jules","synthetic-jules");armed=true;const body={otherId:"ada",category:"other",details:"Fictional crash case"};await w.write(s.token,"report",{personId:"jules",idempotencyKey:"crash-report",payloadHash:payloadHash(body),body});await w.close();
