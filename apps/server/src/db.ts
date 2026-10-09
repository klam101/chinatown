import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MENU } from "./menu-data.js";

export type Db = DatabaseSync;

const SCHEMA = `
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

const SCHEMA_VERSION = 2;

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
    PRAGMA foreign_keys = ON;
  `);
}

/** Opens the database (":memory:" for tests), creates tables, and seeds a sample menu if empty. */
export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  resetIfOutdated(db);
  db.exec(SCHEMA);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  seedMenuIfEmpty(db);
  return db;
}

function seedMenuIfEmpty(db: Db): void {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM categories").get() as { count: number };
  if (count > 0) return;

  const insertCategory = db.prepare("INSERT INTO categories (name, note, sort_order) VALUES (?, ?, ?)");
  const insertItem = db.prepare(
    `INSERT INTO menu_items (category_id, code, name, alt_name, price_cents, spicy, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertOption = db.prepare(
    "INSERT INTO menu_item_options (menu_item_id, group_name, name, extra_cents, sort_order) VALUES (?, ?, ?, ?, ?)",
  );
  const cents = (dollars: number) => Math.round(dollars * 100);

  db.exec("BEGIN");
  MENU.forEach((section, i) => {
    const categoryId = insertCategory.run(section.name, section.note ?? null, i).lastInsertRowid;
    section.rows.forEach(([code, altName, name, prices, extras = {}], j) => {
      const sizes = Array.isArray(prices)
        ? prices
            .map((price, k) => ({ name: (extras.sizes ?? section.sizes ?? [])[k], price }))
            .filter((s): s is { name: string; price: number } => s.price !== null)
        : [];
      if (sizes.some((s) => !s.name)) throw new Error(`Menu item ${code} ${name} has a price without a size label`);
      const base = Array.isArray(prices) ? Math.min(...sizes.map((s) => s.price)) : prices;

      const itemId = insertItem.run(categoryId, code, name, altName, cents(base), extras.spicy ? 1 : 0, j).lastInsertRowid;
      if (sizes.length > 1) {
        sizes.forEach((s, k) => insertOption.run(itemId, "Size", s.name, cents(s.price) - cents(base), k));
      }
      extras.choices?.forEach((choice, k) => insertOption.run(itemId, "Choice", choice, 0, k));
    });
  });
  db.exec("COMMIT");
}
