import type { MenuCategory, MenuItem, MenuItemInput, MenuOptionGroup } from "../../../shared/types.js";
import type { Db } from "./db.js";

export class MenuError extends Error {}

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
  const items = (
    db.prepare("SELECT * FROM menu_items WHERE archived = 0 ORDER BY sort_order, id").all() as unknown as ItemRow[]
  ).map((row) => toMenuItem(row, options.filter((o) => o.menu_item_id === row.id)));
  return categories.map((c) => ({ ...c, items: items.filter((i) => i.categoryId === c.id) }));
}

/** Looks up an item that is still on the menu (not removed). */
export function getMenuItem(db: Db, id: number): MenuItem | undefined {
  const row = db.prepare("SELECT * FROM menu_items WHERE id = ? AND archived = 0").get(id) as ItemRow | undefined;
  if (!row) return undefined;
  const options = db
    .prepare(OPTIONS_SQL.replace("ORDER BY menu_item_id,", "WHERE menu_item_id = ? ORDER BY"))
    .all(id) as unknown as OptionRow[];
  return toMenuItem(row, options);
}

export function createCategory(db: Db, input: { name: string; note?: string | null }): MenuCategory {
  const { next } = db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM categories").get() as { next: number };
  const { lastInsertRowid } = db
    .prepare("INSERT INTO categories (name, note, sort_order) VALUES (?, ?, ?)")
    .run(input.name, input.note ?? null, next);
  return { id: Number(lastInsertRowid), name: input.name, note: input.note ?? null, items: [] };
}

export function updateCategory(db: Db, id: number, changes: { name?: string; note?: string | null }): boolean {
  const current = db.prepare("SELECT name, note FROM categories WHERE id = ?").get(id) as
    | { name: string; note: string | null }
    | undefined;
  if (!current) return false;
  const next = { ...current, ...changes };
  db.prepare("UPDATE categories SET name = ?, note = ? WHERE id = ?").run(next.name, next.note, id);
  return true;
}

/**
 * Checks sizes and works out the stored base price. With sizes, the base is the cheapest
 * size and each size option stores its difference from it.
 */
function priceModel(input: Pick<MenuItemInput, "priceCents" | "sizes">): { base: number; sizes: { name: string; extra: number }[] } {
  const sizes = input.sizes ?? [];
  if (sizes.length === 1) throw new MenuError("An item with sizes needs at least two of them");
  if (new Set(sizes.map((s) => s.name)).size !== sizes.length) throw new MenuError("Size names must be different");
  if (sizes.length === 0) {
    if (input.priceCents === undefined) throw new MenuError("A price is required");
    return { base: input.priceCents, sizes: [] };
  }
  const base = Math.min(...sizes.map((s) => s.priceCents));
  return { base, sizes: sizes.map((s) => ({ name: s.name, extra: s.priceCents - base })) };
}

function replaceOptions(db: Db, itemId: number, group: "Size" | "Choice", options: { name: string; extra: number }[]): void {
  db.prepare("DELETE FROM menu_item_options WHERE menu_item_id = ? AND group_name = ?").run(itemId, group);
  const insert = db.prepare(
    "INSERT INTO menu_item_options (menu_item_id, group_name, name, extra_cents, sort_order) VALUES (?, ?, ?, ?, ?)",
  );
  options.forEach((o, i) => insert.run(itemId, group, o.name, o.extra, i));
}

function inTransaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function createMenuItem(db: Db, input: MenuItemInput & { categoryId: number }, useTransaction = true): MenuItem {
  const create = () => {
    const { base, sizes } = priceModel(input);
    const { next } = db
      .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM menu_items WHERE category_id = ?")
      .get(input.categoryId) as { next: number };
    const id = Number(
      db
        .prepare(
          `INSERT INTO menu_items (category_id, code, name, alt_name, price_cents, spicy, available, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.categoryId,
          input.code ?? "",
          input.name ?? "",
          input.altName ?? null,
          base,
          input.spicy ? 1 : 0,
          input.available === false ? 0 : 1,
          next,
        ).lastInsertRowid,
    );
    replaceOptions(db, id, "Size", sizes);
    replaceOptions(db, id, "Choice", (input.choices ?? []).map((name) => ({ name, extra: 0 })));
    return getMenuItem(db, id)!;
  };
  return useTransaction ? inTransaction(db, create) : create();
}

/** Applies the given changes. `sizes` and `choices`, when present, replace the item's whole list. */
export function updateMenuItem(db: Db, id: number, changes: MenuItemInput): MenuItem | undefined {
  const current = getMenuItem(db, id);
  if (!current) return undefined;
  return inTransaction(db, () => {
    const next = { ...current, ...changes };
    let base = current.priceCents;
    if (changes.sizes !== undefined || changes.priceCents !== undefined) {
      const sizes =
        changes.sizes ??
        (current.optionGroups.find((g) => g.name === "Size")?.options.map((o) => ({
          name: o.name,
          priceCents: current.priceCents + o.extraCents,
        })) ?? []);
      // A new base price for an item with sizes moves every size by the same amount.
      const shifted =
        changes.sizes === undefined && changes.priceCents !== undefined
          ? sizes.map((s) => ({ ...s, priceCents: s.priceCents - current.priceCents + changes.priceCents! }))
          : sizes;
      const model = priceModel({ priceCents: changes.priceCents ?? current.priceCents, sizes: shifted });
      base = model.base;
      replaceOptions(db, id, "Size", model.sizes);
    }
    if (changes.choices !== undefined) {
      replaceOptions(db, id, "Choice", changes.choices.map((name) => ({ name, extra: 0 })));
    }
    db.prepare(
      "UPDATE menu_items SET category_id = ?, code = ?, name = ?, alt_name = ?, price_cents = ?, spicy = ?, available = ? WHERE id = ?",
    ).run(
      next.categoryId,
      next.code,
      next.name,
      next.altName,
      base,
      next.spicy ? 1 : 0,
      next.available ? 1 : 0,
      id,
    );
    return getMenuItem(db, id)!;
  });
}

/** Takes an item off the menu. It is kept in the database because past orders point to it. */
export function removeMenuItem(db: Db, id: number): boolean {
  return db.prepare("UPDATE menu_items SET archived = 1 WHERE id = ? AND archived = 0").run(id).changes > 0;
}
