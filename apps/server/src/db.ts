import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SAMPLE_MENU } from "./sample-menu.js";

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  alt_name TEXT,
  price_cents INTEGER NOT NULL,
  available INTEGER NOT NULL DEFAULT 1,
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
  name TEXT NOT NULL,
  alt_name TEXT,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  note TEXT
);
`;

/** Opens the database (":memory:" for tests), creates tables, and seeds a sample menu if empty. */
export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  seedMenuIfEmpty(db);
  return db;
}

function seedMenuIfEmpty(db: Db): void {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM categories").get() as { count: number };
  if (count > 0) return;

  const insertCategory = db.prepare("INSERT INTO categories (name, sort_order) VALUES (?, ?)");
  const insertItem = db.prepare(
    "INSERT INTO menu_items (category_id, name, alt_name, price_cents, sort_order) VALUES (?, ?, ?, ?, ?)",
  );
  SAMPLE_MENU.forEach((category, i) => {
    const { lastInsertRowid } = insertCategory.run(category.name, i);
    category.items.forEach((item, j) => {
      insertItem.run(lastInsertRowid, item.name, item.altName ?? null, item.priceCents, j);
    });
  });
}
