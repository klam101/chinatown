import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createCategory, createMenuItem } from "./menu.js";
import { MENU } from "./menu-data.js";
import { updateSettings } from "./settings.js";
import type { Settings } from "../../../shared/types.js";

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  code TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  alt_name TEXT,
  price_cents INTEGER NOT NULL,
  spicy INTEGER NOT NULL DEFAULT 0,
  available INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_item_options (
  id INTEGER PRIMARY KEY,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
  group_name TEXT NOT NULL,
  name TEXT NOT NULL,
  extra_cents INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  number INTEGER NOT NULL,
  business_date TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  customer_name TEXT,
  customer_phone TEXT,
  note TEXT,
  subtotal_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (business_date, number)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
  code TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  alt_name TEXT,
  options TEXT NOT NULL DEFAULT '[]',
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  note TEXT
);
`;

const SCHEMA_VERSION = 3;

/**
 * Before the first release there are no migrations: a database from an older schema is
 * rebuilt from scratch. Replace this with real migrations once the restaurant has live data.
 */
function resetIfOutdated(db: Db): void {
  const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get() as { count: number };
  if (count === 0 || user_version === SCHEMA_VERSION) return;
  console.warn(`Database schema ${user_version} is outdated (now ${SCHEMA_VERSION}); rebuilding it.`);
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS order_items; DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS menu_item_options; DROP TABLE IF EXISTS menu_items; DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS settings;
    PRAGMA foreign_keys = ON;
  `);
}

/**
 * Opens the database (":memory:" for tests) and creates tables. A brand-new database gets the
 * starter menu and the given first-run settings; after that both are edited in the app.
 */
export function openDb(path: string, firstRunSettings: Partial<Settings> = {}): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  resetIfOutdated(db);
  const isNew = (db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'settings'").get() as { count: number }).count === 0;
  db.exec(SCHEMA);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  if (isNew) updateSettings(db, firstRunSettings);
  seedMenuIfEmpty(db);
  return db;
}

function seedMenuIfEmpty(db: Db): void {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM categories").get() as { count: number };
  if (count > 0) return;
  const cents = (dollars: number) => Math.round(dollars * 100);

  db.exec("BEGIN");
  for (const section of MENU) {
    const category = createCategory(db, { name: section.name, note: section.note });
    for (const [code, altName, name, prices, extras = {}] of section.rows) {
      const labels = extras.sizes ?? section.sizes ?? [];
      const sizes = Array.isArray(prices)
        ? prices.flatMap((price, k) => (price === null ? [] : [{ name: labels[k], priceCents: cents(price) }]))
        : [];
      if (sizes.some((s) => !s.name)) throw new Error(`Menu item ${code} ${name} has a price without a size label`);
      createMenuItem(
        db,
        {
          categoryId: category.id,
          code,
          name,
          altName,
          priceCents: Array.isArray(prices) ? undefined : cents(prices),
          sizes,
          choices: extras.choices,
          spicy: extras.spicy,
        },
        false,
      );
    }
  }
  db.exec("COMMIT");
}
