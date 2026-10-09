import type { Settings } from "../../../shared/types.js";
import type { Db } from "./db.js";

export const DEFAULT_SETTINGS: Settings = {
  restaurantName: "My Restaurant",
  taxRate: 0,
  printerHost: "",
  printerPort: 9100,
};

/** Settings are stored as JSON values by key, so new ones need no schema change. */
export function getSettings(db: Db): Settings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function updateSettings(db: Db, changes: Partial<Settings>): Settings {
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  );
  for (const [key, value] of Object.entries(changes)) {
    if (key in DEFAULT_SETTINGS && value !== undefined) upsert.run(key, JSON.stringify(value));
  }
  return getSettings(db);
}
