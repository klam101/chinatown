import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import type { Printer } from "../src/printer.js";
import { renderEscPos, renderText, type TicketLine } from "../src/ticket.js";
import type { MenuCategory, OrderResult } from "../../../shared/types.js";

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
  const app = buildApp({ db: openDb(":memory:"), printer, taxRate });
  return { app, printer };
}

async function firstItems(app: ReturnType<typeof setup>["app"]) {
  const menu = (await app.inject("/api/menu")).json() as MenuCategory[];
  return menu.flatMap((c) => c.items);
}

describe("orders API", () => {
  it("serves the sample menu on first run", async () => {
    const { app } = setup();
    const items = await firstItems(app);
    expect(items.length).toBeGreaterThan(5);
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
    expect(printer.tickets[0]).toContain(`2 x ${a.name}`);
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

describe("ESC/POS rendering", () => {
  it("starts with a reset, ends with a cut, and replaces characters the printer cannot show", () => {
    const bytes = renderEscPos([{ text: "1 x Egg Roll 春卷", style: "tall", bold: true }]);
    expect([...bytes.subarray(0, 2)]).toEqual([0x1b, 0x40]);
    expect([...bytes.subarray(-4)]).toEqual([0x1d, 0x56, 0x42, 0x04]);
    expect(bytes.toString("ascii")).toContain("1 x Egg Roll ??");
  });
});
