import type { NewOrder, Order, OrderItem, OrderStatus } from "../../../shared/types.js";
import type { Db } from "./db.js";
import { getMenuItem } from "./menu.js";

export class OrderError extends Error {}

/** The restaurant's local calendar date, YYYY-MM-DD. Order numbers restart each day. */
export function businessDate(now: Date): string {
  return now.toLocaleDateString("en-CA");
}

export function createOrder(db: Db, input: NewOrder, opts: { taxRate: number; now?: Date }): Order {
  if (!input.items?.length) throw new OrderError("An order needs at least one item");
  const now = opts.now ?? new Date();

  const lines = input.items.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      throw new OrderError("Quantity must be a whole number from 1 to 99");
    }
    const item = getMenuItem(db, line.menuItemId);
    if (!item) throw new OrderError(`Menu item ${line.menuItemId} does not exist`);
    if (!item.available) throw new OrderError(`${item.name} is not available`);

    const optionIds = line.optionIds ?? [];
    const chosen = item.optionGroups.map((group) => {
      const picks = group.options.filter((o) => optionIds.includes(o.id));
      if (picks.length !== 1) throw new OrderError(`Pick one ${group.name.toLowerCase()} for ${item.name}`);
      return picks[0];
    });
    if (chosen.length !== optionIds.length) throw new OrderError(`Unknown option for ${item.name}`);

    return {
      item,
      quantity: line.quantity,
      options: chosen.map((o) => o.name),
      unitPrice: item.priceCents + chosen.reduce((sum, o) => sum + o.extraCents, 0),
      note: line.note?.trim() || null,
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const tax = Math.round(subtotal * opts.taxRate);
  const date = businessDate(now);

  db.exec("BEGIN IMMEDIATE");
  try {
    const { next } = db
      .prepare("SELECT COALESCE(MAX(number), 0) + 1 AS next FROM orders WHERE business_date = ?")
      .get(date) as { next: number };
    const { lastInsertRowid: orderId } = db
      .prepare(
        `INSERT INTO orders (number, business_date, type, customer_name, customer_phone, note,
           subtotal_cents, tax_cents, total_cents, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        next,
        date,
        input.type,
        input.customerName?.trim() || null,
        input.customerPhone?.trim() || null,
        input.note?.trim() || null,
        subtotal,
        tax,
        subtotal + tax,
        now.toISOString(),
      );
    const insertItem = db.prepare(
      `INSERT INTO order_items (order_id, menu_item_id, code, name, alt_name, options, quantity, unit_price_cents, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const l of lines) {
      insertItem.run(
        orderId,
        l.item.id,
        l.item.code,
        l.item.name,
        l.item.altName,
        JSON.stringify(l.options),
        l.quantity,
        l.unitPrice,
        l.note,
      );
    }
    db.exec("COMMIT");
    return getOrder(db, Number(orderId))!;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

interface OrderRow {
  id: number;
  number: number;
  business_date: string;
  type: Order["type"];
  status: OrderStatus;
  customer_name: string | null;
  customer_phone: string | null;
  note: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  created_at: string;
}

function toOrder(db: Db, row: OrderRow): Order {
  const items = db
    .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id")
    .all(row.id) as unknown as {
    id: number;
    menu_item_id: number;
    code: string;
    name: string;
    alt_name: string | null;
    options: string;
    quantity: number;
    unit_price_cents: number;
    note: string | null;
  }[];
  return {
    id: row.id,
    number: row.number,
    businessDate: row.business_date,
    type: row.type,
    status: row.status,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    note: row.note,
    subtotalCents: row.subtotal_cents,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    createdAt: row.created_at,
    items: items.map(
      (i): OrderItem => ({
        id: i.id,
        menuItemId: i.menu_item_id,
        code: i.code,
        name: i.name,
        altName: i.alt_name,
        options: JSON.parse(i.options) as string[],
        quantity: i.quantity,
        unitPriceCents: i.unit_price_cents,
        note: i.note,
      }),
    ),
  };
}

export function getOrder(db: Db, id: number): Order | undefined {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow | undefined;
  return row && toOrder(db, row);
}

/** Orders for one business day, newest first. */
export function listOrders(db: Db, date: string): Order[] {
  const rows = db
    .prepare("SELECT * FROM orders WHERE business_date = ? ORDER BY id DESC")
    .all(date) as unknown as OrderRow[];
  return rows.map((r) => toOrder(db, r));
}

export function setOrderStatus(db: Db, id: number, status: OrderStatus): Order | undefined {
  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
  return getOrder(db, id);
}
