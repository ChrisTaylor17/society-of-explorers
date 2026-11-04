import { migrateReportStorage } from "./sqlite-state.js";
const args = process.argv.slice(2);
try {
  if (args.length !== 1) throw new Error("Expected one path");
  console.log(JSON.stringify(migrateReportStorage(args[0])));
} catch {
  console.error("Report storage migration did not finish. Preserve the database and inspect before retrying; no reset was requested.");
  process.exitCode = 1;
}
