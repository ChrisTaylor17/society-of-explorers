import { createHttp } from "./http.js";
import { createWorld } from "./world.js";

const port = Number(process.env.PORT || 8787);
const databasePath = process.env.SOE_DATABASE_PATH;
const world = createWorld({ allowFaults: false, ...(databasePath === undefined ? {} : { databasePath }) });
const http = createHttp(world);
const { url } = await http.listen(port);
console.log(`SoE join/revoke prototype listening on ${url}`);
console.log(`Synthetic local server. Storage: ${world.storageMode}. Ctrl+C stops it.`);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try { await http.close(); await world.close(); }
  catch { process.exitCode = 1; }
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
