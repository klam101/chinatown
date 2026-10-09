import type { MenuCategory, MenuItem } from "../../../shared/types.js";
import type { Db } from "./db.js";

interface ItemRow {
  id: number;
  category_id: number;
  name: string;
  alt_name: string | null;
  price_cents: number;
  available: number;
}

function toMenuItem(row: ItemRow): MenuItem {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    altName: row.alt_name,
    priceCents: row.price_cents,
    available: row.available === 1,
  };
}

export function getMenu(db: Db): MenuCategory[] {
  const categories = db
    .prepare("SELECT id, name FROM categories ORDER BY sort_order, id")
    .all() as { id: number; name: string }[];
  const items = (
    db.prepare("SELECT * FROM menu_items ORDER BY sort_order, id").all() as unknown as ItemRow[]
  ).map(toMenuItem);
  return categories.map((c) => ({ ...c, items: items.filter((i) => i.categoryId === c.id) }));
}

export function getMenuItem(db: Db, id: number): MenuItem | undefined {
  const row = db.prepare("SELECT * FROM menu_items WHERE id = ?").get(id) as ItemRow | undefined;
  return row && toMenuItem(row);
}

export function createMenuItem(
  db: Db,
  input: { categoryId: number; name: string; altName?: string | null; priceCents: number },
): MenuItem {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO menu_items (category_id, name, alt_name, price_cents, sort_order) VALUES (?, ?, ?, ?, 999)")
    .run(input.categoryId, input.name, input.altName ?? null, input.priceCents);
  return getMenuItem(db, Number(lastInsertRowid))!;
}

export function updateMenuItem(
  db: Db,
  id: number,
  changes: Partial<Pick<MenuItem, "name" | "altName" | "priceCents" | "available">>,
): MenuItem | undefined {
  const current = getMenuItem(db, id);
  if (!current) return undefined;
  const next = { ...current, ...changes };
  db.prepare("UPDATE menu_items SET name = ?, alt_name = ?, price_cents = ?, available = ? WHERE id = ?").run(
    next.name,
    next.altName,
    next.priceCents,
    next.available ? 1 : 0,
    id,
  );
  return getMenuItem(db, id);
}
