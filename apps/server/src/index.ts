import { resolve } from "node:path";
import { findRepoRoot, loadConfig } from "./config.js";
import { buildApp } from "./app.js";
import { openDb } from "./db.js";

try {
  process.loadEnvFile(resolve(findRepoRoot(), ".env"));
} catch {
  // No .env file: use defaults.
}

const config = loadConfig();
// TAX_RATE and PRINTER_* only fill in the settings of a brand-new database; after that they are
// changed in the app's Settings screen.
const db = openDb(config.dbPath, {
  taxRate: config.taxRate,
  printerHost: config.printerHost ?? "",
  printerPort: config.printerPort,
});
const app = buildApp({ db, webDist: config.webDist, logger: true });

await app.listen({ port: config.port, host: "0.0.0.0" });
