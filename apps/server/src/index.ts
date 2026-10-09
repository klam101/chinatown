import { resolve } from "node:path";
import { findRepoRoot, loadConfig } from "./config.js";
import { buildApp } from "./app.js";
import { openDb } from "./db.js";
import { ConsolePrinter, NetworkPrinter } from "./printer.js";

try {
  process.loadEnvFile(resolve(findRepoRoot(), ".env"));
} catch {
  // No .env file: use defaults.
}

const config = loadConfig();
const printer = config.printerHost ? new NetworkPrinter(config.printerHost, config.printerPort) : new ConsolePrinter();
const app = buildApp({
  db: openDb(config.dbPath),
  printer,
  taxRate: config.taxRate,
  webDist: config.webDist,
  logger: true,
});

await app.listen({ port: config.port, host: "0.0.0.0" });
app.log.info(`Printer: ${config.printerHost ? `${config.printerHost}:${config.printerPort}` : "console (no PRINTER_HOST set)"}`);
