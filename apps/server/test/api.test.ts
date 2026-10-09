import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import type { Printer } from "../src/printer.js";
import { renderEscPos, renderText, type TicketLine } from "../src/ticket.js";
import type { MenuCategory, MenuItem, OrderResult } from "../../../shared/types.js";

class FakePrinter implements Printer {
  configured = true;
  tickets: string[] = [];
  fail = false;
  async print(lines: TicketLine[]) {
    if (this.fail) throw new Error("Printer offline");
    this.tickets.push(renderText(lines));
  }
}

function setup(taxRate = 0) {
  const printer = new FakePrinter();
  const app = buildApp({ db: openDb(":memory:", { taxRate }), printer });
  return { app, printer };
}

async function allItems(app: ReturnType<typeof setup>["app"]) {
  const menu = (await app.inject("/api/menu")).json() as MenuCategory[];
  return menu.flatMap((c) => c.items);
}

/** Simple items with no sizes or choices, for tests that don't care about options. */
async function firstItems(app: ReturnType<typeof setup>["app"]) {
  return (await allItems(app)).filter((i) => i.optionGroups.length === 0);
}

async function byCode(app: ReturnType<typeof setup>["app"], code: string) {
  const item = (await allItems(app)).find((i) => i.code === code);
  if (!item) throw new Error(`No menu item ${code}`);
  return item;
}

const option = (item: MenuItem, name: string) =>
  item.optionGroups.flatMap((g) => g.options).find((o) => o.name === name)!.id;

describe("orders API", () => {
  it("serves the restaurant menu on first run", async () => {
    const { app } = setup();
    const menu = (await app.inject("/api/menu")).json() as MenuCategory[];
    expect(menu[0].name).toBe("Lunch Special");
    const items = menu.flatMap((c) => c.items);
    expect(items).toHaveLength(182);
    const codes = items.map((i) => i.code).filter(Boolean);
    expect(new Set(codes).size).toBe(codes.length);

    const tso = await byCode(app, "L6");
    expect(tso).toMatchObject({ name: "General Tso's Chicken", priceCents: 635, spicy: true, optionGroups: [] });

    const friedRice = await byCode(app, "19");
    expect(friedRice.priceCents).toBe(495);
    expect(friedRice.optionGroups.map((g) => [g.name, g.options.map((o) => `${o.name}+${o.extraCents}`)])).toEqual([
      ["Size", ["Pt+0", "Qt+265"]],
      ["Choice", ["Chicken+0", "Roast Pork+0"]],
    ]);
  });

  it("prices and prints the chosen size and protein", async () => {
    const { app, printer } = setup();
    const friedRice = await byCode(app, "19");
    const res = await app.inject({
      method: "POST",
      url: "/api/orders",
      payload: { type: "walk_in", items: [{ menuItemId: friedRice.id, quantity: 2, optionIds: [option(friedRice, "Qt"), option(friedRice, "Roast Pork")] }] },
    });
    expect(res.statusCode).toBe(201);
    const { order } = res.json() as OrderResult;
    expect(order.items[0]).toMatchObject({ code: "19", options: ["Qt", "Roast Pork"], unitPriceCents: 760 });
    expect(order.subtotalCents).toBe(1520);
    expect(printer.tickets[0]).toContain("2 x 19 Chicken or Roast Pork Fried Rice");
    expect(printer.tickets[0]).toContain("QT / ROAST PORK");
  });

  it("requires exactly one pick from each option group", async () => {
    const { app } = setup();
    const friedRice = await byCode(app, "19");
    const order = (optionIds: number[]) =>
      app.inject({ method: "POST", url: "/api/orders", payload: { type: "walk_in", items: [{ menuItemId: friedRice.id, quantity: 1, optionIds }] } });

    expect((await order([option(friedRice, "Qt")])).json().error).toBe("Pick one choice for Chicken or Roast Pork Fried Rice");
    expect((await order([option(friedRice, "Pt"), option(friedRice, "Qt"), option(friedRice, "Chicken")])).statusCode).toBe(400);
    const otherItem = await byCode(app, "20");
    expect((await order([option(friedRice, "Pt"), option(friedRice, "Chicken"), option(otherItem, "Beef")])).statusCode).toBe(400);
  });

  it("creates an order, numbers it, totals it and prints a ticket", async () => {
    const { app, printer } = setup(0.1);
    const [a, b] = await firstItems(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/orders",
      payload: {
        type: "phone",
        customerName: "Lee",
        customerPhone: "555-0100",
        note: "Pickup at 6",
        items: [
          { menuItemId: a.id, quantity: 2, note: "extra spicy" },
          { menuItemId: b.id, quantity: 1 },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const { order, print } = res.json() as OrderResult;
    expect(order.number).toBe(1);
    expect(order.subtotalCents).toBe(a.priceCents * 2 + b.priceCents);
    expect(order.taxCents).toBe(Math.round(order.subtotalCents * 0.1));
    expect(print.status).toBe("printed");
    expect(printer.tickets[0]).toContain("#1  PHONE");
    expect(printer.tickets[0]).toContain(`2 x ${a.code} ${a.name}`);
    expect(printer.tickets[0]).toContain(">> extra spicy");
    expect(printer.tickets[0]).toContain("NOTE: Pickup at 6");

    const second = (
      await app.inject({ method: "POST", url: "/api/orders", payload: { type: "walk_in", items: [{ menuItemId: a.id, quantity: 1 }] } })
    ).json() as OrderResult;
    expect(second.order.number).toBe(2);
  });

  it("rejects empty orders and unknown items", async () => {
    const { app } = setup();
    const empty = await app.inject({ method: "POST", url: "/api/orders", payload: { type: "walk_in", items: [] } });
    expect(empty.statusCode).toBe(400);
    const unknown = await app.inject({
      method: "POST",
      url: "/api/orders",
      payload: { type: "walk_in", items: [{ menuItemId: 9999, quantity: 1 }] },
    });
    expect(unknown.statusCode).toBe(400);
  });

  it("refuses items marked unavailable", async () => {
    const { app } = setup();
    const [a] = await firstItems(app);
    await app.inject({ method: "PATCH", url: `/api/menu/items/${a.id}`, payload: { available: false } });
    const res = await app.inject({ method: "POST", url: "/api/orders", payload: { type: "walk_in", items: [{ menuItemId: a.id, quantity: 1 }] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("not available");
  });

  it("still saves the order when the printer fails, and reprints later", async () => {
    const { app, printer } = setup();
    const [a] = await firstItems(app);
    printer.fail = true;
    const res = (
      await app.inject({ method: "POST", url: "/api/orders", payload: { type: "walk_in", items: [{ menuItemId: a.id, quantity: 1 }] } })
    ).json() as OrderResult;
    expect(res.print.status).toBe("failed");
    expect((await app.inject("/api/orders")).json()).toHaveLength(1);

    printer.fail = false;
    const reprint = (await app.inject({ method: "POST", url: `/api/orders/${res.order.id}/reprint` })).json() as OrderResult;
    expect(reprint.print.status).toBe("printed");
    expect(printer.tickets[0]).toContain("REPRINT");
  });

  it("prints a CANCELLED ticket when an order is cancelled", async () => {
    const { app, printer } = setup();
    const [a] = await firstItems(app);
    const { order } = (
      await app.inject({ method: "POST", url: "/api/orders", payload: { type: "walk_in", items: [{ menuItemId: a.id, quantity: 1 }] } })
    ).json() as OrderResult;
    const res = (await app.inject({ method: "POST", url: `/api/orders/${order.id}/cancel` })).json() as OrderResult;
    expect(res.order.status).toBe("cancelled");
    expect(printer.tickets[1]).toContain("CANCELLED");
  });
});

describe("menu editor and settings", () => {
  it("changes a one-price item's price, and new orders use it", async () => {
    const { app } = setup();
    const tso = await byCode(app, "L6");
    const res = await app.inject({ method: "PATCH", url: `/api/menu/items/${tso.id}`, payload: { priceCents: 1095 } });
    expect(res.json()).toMatchObject({ priceCents: 1095 });
    const order = (
      await app.inject({ method: "POST", url: "/api/orders", payload: { type: "walk_in", items: [{ menuItemId: tso.id, quantity: 1 }] } })
    ).json() as OrderResult;
    expect(order.order.totalCents).toBe(1095);
  });

  it("sets each size's full price", async () => {
    const { app } = setup();
    const friedRice = await byCode(app, "19");
    const res = await app.inject({
      method: "PATCH",
      url: `/api/menu/items/${friedRice.id}`,
      payload: { sizes: [{ name: "Pt", priceCents: 650 }, { name: "Qt", priceCents: 1050 }] },
    });
    const item = res.json() as MenuItem;
    expect(item.priceCents).toBe(650);
    expect(item.optionGroups[0].options.map((o) => [o.name, item.priceCents + o.extraCents])).toEqual([
      ["Pt", 650],
      ["Qt", 1050],
    ]);
    expect(item.optionGroups[1].options.map((o) => o.name)).toEqual(["Chicken", "Roast Pork"]);
  });

  it("adds an item with sizes and choices, then removes it from the menu", async () => {
    const { app } = setup();
    const [category] = (await app.inject("/api/menu")).json() as MenuCategory[];
    const created = await app.inject({
      method: "POST",
      url: "/api/menu/items",
      payload: {
        categoryId: category.id,
        code: "L31",
        name: "Salt & Pepper Shrimp or Chicken",
        sizes: [{ name: "Pt", priceCents: 900 }, { name: "Qt", priceCents: 1400 }],
        choices: ["Shrimp", "Chicken"],
        spicy: true,
      },
    });
    expect(created.statusCode).toBe(201);
    const item = created.json() as MenuItem;
    expect(item).toMatchObject({ code: "L31", priceCents: 900, spicy: true });
    expect(await byCode(app, "L31")).toBeTruthy();

    expect((await app.inject({ method: "DELETE", url: `/api/menu/items/${item.id}` })).statusCode).toBe(200);
    expect((await allItems(app)).find((i) => i.code === "L31")).toBeUndefined();
    const order = await app.inject({ method: "POST", url: "/api/orders", payload: { type: "walk_in", items: [{ menuItemId: item.id, quantity: 1 }] } });
    expect(order.statusCode).toBe(400);
  });

  it("rejects an item with a single size", async () => {
    const { app } = setup();
    const tso = await byCode(app, "L6");
    const res = await app.inject({ method: "PATCH", url: `/api/menu/items/${tso.id}`, payload: { sizes: [{ name: "Pt", priceCents: 500 }] } });
    expect(res.statusCode).toBe(400);
  });

  it("keeps past orders' prices when the menu price changes", async () => {
    const { app } = setup();
    const tso = await byCode(app, "L6");
    await app.inject({ method: "POST", url: "/api/orders", payload: { type: "walk_in", items: [{ menuItemId: tso.id, quantity: 1 }] } });
    await app.inject({ method: "PATCH", url: `/api/menu/items/${tso.id}`, payload: { priceCents: 2000 } });
    const [order] = (await app.inject("/api/orders")).json() as OrderResult["order"][];
    expect(order.totalCents).toBe(635);
  });

  it("stores settings, and tax uses the saved rate", async () => {
    const { app } = setup();
    const saved = await app.inject({ method: "PATCH", url: "/api/settings", payload: { restaurantName: "Golden Wok", taxRate: 0.1 } });
    expect(saved.json()).toMatchObject({ restaurantName: "Golden Wok", taxRate: 0.1, printerPort: 9100 });
    const tso = await byCode(app, "L6");
    const { order } = (
      await app.inject({ method: "POST", url: "/api/orders", payload: { type: "walk_in", items: [{ menuItemId: tso.id, quantity: 1 }] } })
    ).json() as OrderResult;
    expect(order.taxCents).toBe(64);
    const bad = await app.inject({ method: "PATCH", url: "/api/settings", payload: { taxRate: 8 } });
    expect(bad.statusCode).toBe(400);
  });
});

describe("ESC/POS rendering", () => {
  it("starts with a reset, ends with a cut, and replaces characters the printer cannot show", () => {
    const bytes = renderEscPos([{ text: "1 x Egg Roll 春卷", style: "tall", bold: true }]);
    expect([...bytes.subarray(0, 2)]).toEqual([0x1b, 0x40]);
    expect([...bytes.subarray(-4)]).toEqual([0x1d, 0x56, 0x42, 0x04]);
    expect(bytes.toString("ascii")).toContain("1 x Egg Roll ??");
  });
});
