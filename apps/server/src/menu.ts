import type { MenuCategory, MenuItem, MenuOptionGroup } from "../../../shared/types.js";
import type { Db } from "./db.js";

interface ItemRow {
  id: number;
  category_id: number;
  code: string;
  name: string;
  alt_name: string | null;
  price_cents: number;
  spicy: number;
  available: number;
}

interface OptionRow {
  id: number;
  menu_item_id: number;
  group_name: string;
  name: string;
  extra_cents: number;
}

const OPTIONS_SQL = "SELECT * FROM menu_item_options ORDER BY menu_item_id, group_name DESC, sort_order, id";

/** Groups option rows by name, keeping Size before Choice. */
function toGroups(rows: OptionRow[]): MenuOptionGroup[] {
  const groups: MenuOptionGroup[] = [];
  for (const row of rows) {
    let group = groups.find((g) => g.name === row.group_name);
    if (!group) groups.push((group = { name: row.group_name, options: [] }));
    group.options.push({ id: row.id, name: row.name, extraCents: row.extra_cents });
  }
  return groups;
}

function toMenuItem(row: ItemRow, options: OptionRow[]): MenuItem {
  return {
    id: row.id,
    categoryId: row.category_id,
    code: row.code,
    name: row.name,
    altName: row.alt_name,
    priceCents: row.price_cents,
    spicy: row.spicy === 1,
    available: row.available === 1,
    optionGroups: toGroups(options),
  };
}

export function getMenu(db: Db): MenuCategory[] {
  const categories = db
    .prepare("SELECT id, name, note FROM categories ORDER BY sort_order, id")
    .all() as { id: number; name: string; note: string | null }[];
  const options = db.prepare(OPTIONS_SQL).all() as unknown as OptionRow[];
  const items = (db.prepare("SELECT * FROM menu_items ORDER BY sort_order, id").all() as unknown as ItemRow[]).map((row) =>
    toMenuItem(row, options.filter((o) => o.menu_item_id === row.id)),
  );
  return categories.map((c) => ({ ...c, items: items.filter((i) => i.categoryId === c.id) }));
}

export function getMenuItem(db: Db, id: number): MenuItem | undefined {
  const row = db.prepare("SELECT * FROM menu_items WHERE id = ?").get(id) as ItemRow | undefined;
  if (!row) return undefined;
  const options = db
    .prepare(OPTIONS_SQL.replace("ORDER BY menu_item_id,", "WHERE menu_item_id = ? ORDER BY"))
    .all(id) as unknown as OptionRow[];
  return toMenuItem(row, options);
}

export function createMenuItem(
  db: Db,
  input: { categoryId: number; code?: string; name: string; altName?: string | null; priceCents: number; spicy?: boolean },
): MenuItem {
  const { lastInsertRowid } = db
    .prepare(
      "INSERT INTO menu_items (category_id, code, name, alt_name, price_cents, spicy, sort_order) VALUES (?, ?, ?, ?, ?, ?, 999)",
    )
    .run(input.categoryId, input.code ?? "", input.name, input.altName ?? null, input.priceCents, input.spicy ? 1 : 0);
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
