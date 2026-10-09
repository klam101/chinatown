import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface Config {
  port: number;
  dbPath: string;
  taxRate: number;
  printerHost: string | null;
  printerPort: number;
  webDist: string;
}

/** The repository root, found by walking up from this file (works from src/ and from dist/). */
export function findRepoRoot(start = import.meta.dirname): string {
  let dir = start;
  while (!existsSync(resolve(dir, "apps/web"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error("Could not find the repository root");
    dir = parent;
  }
  return dir;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, repoRoot = findRepoRoot()): Config {
  return {
    port: Number(env.PORT ?? 3000),
    dbPath: env.DB_PATH ?? resolve(repoRoot, "data/orders.db"),
    taxRate: Number(env.TAX_RATE ?? 0),
    printerHost: env.PRINTER_HOST || null,
    printerPort: Number(env.PRINTER_PORT ?? 9100),
    webDist: env.WEB_DIST ?? resolve(repoRoot, "apps/web/dist"),
  };
}
