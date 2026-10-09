import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import type { MenuItemInput, NewOrder, Order, OrderResult, Settings } from "../../../shared/types.js";
import type { Db } from "./db.js";
import {
  createCategory,
  createMenuItem,
  getMenu,
  MenuError,
  removeMenuItem,
  updateCategory,
  updateMenuItem,
} from "./menu.js";
import { businessDate, createOrder, getOrder, listOrders, OrderError, setOrderStatus } from "./orders.js";
import { ConsolePrinter, NetworkPrinter, type Printer } from "./printer.js";
import { getSettings, updateSettings } from "./settings.js";
import { buildTicket, type TicketKind } from "./ticket.js";

export interface AppOptions {
  db: Db;
  /** Overrides the printer from settings (used by tests). */
  printer?: Printer;
  webDist?: string;
  logger?: boolean;
}

const priceCents = { type: "integer", minimum: 0, maximum: 1_000_000 } as const;
const menuItemProperties = {
  categoryId: { type: "integer" },
  code: { type: "string", maxLength: 10 },
  name: { type: "string", minLength: 1, maxLength: 80 },
  altName: { type: ["string", "null"], maxLength: 80 },
  priceCents,
  sizes: {
    type: "array",
    maxItems: 10,
    items: {
      type: "object",
      required: ["name", "priceCents"],
      properties: { name: { type: "string", minLength: 1, maxLength: 30 }, priceCents },
    },
  },
  choices: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 30 } },
  spicy: { type: "boolean" },
  available: { type: "boolean" },
} as const;

const categoryProperties = {
  name: { type: "string", minLength: 1, maxLength: 60 },
  note: { type: ["string", "null"], maxLength: 200 },
} as const;

const newOrderSchema = {
  type: "object",
  required: ["type", "items"],
  properties: {
    type: { enum: ["walk_in", "phone"] },
    customerName: { type: "string", maxLength: 80 },
    customerPhone: { type: "string", maxLength: 30 },
    note: { type: "string", maxLength: 300 },
    items: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: {
        type: "object",
        required: ["menuItemId", "quantity"],
        properties: {
          menuItemId: { type: "integer" },
          quantity: { type: "integer", minimum: 1, maximum: 99 },
          optionIds: { type: "array", maxItems: 10, items: { type: "integer" } },
          note: { type: "string", maxLength: 200 },
        },
      },
    },
  },
} as const;

const idParams = { type: "object", properties: { id: { type: "integer" } } } as const;

export function buildApp({ db, printer: printerOverride, webDist, logger = false }: AppOptions) {
  const app = Fastify({ logger });

  function currentPrinter(): Printer {
    if (printerOverride) return printerOverride;
    const { printerHost, printerPort } = getSettings(db);
    return printerHost ? new NetworkPrinter(printerHost, printerPort) : new ConsolePrinter();
  }

  async function printTicket(order: Order, kind: TicketKind): Promise<OrderResult["print"]> {
    const printer = currentPrinter();
    if (!printer.configured) {
      await printer.print(buildTicket(order, kind));
      return { status: "not_configured" };
    }
    try {
      await printer.print(buildTicket(order, kind));
      return { status: "printed" };
    } catch (err) {
      app.log.error({ err, orderId: order.id }, "ticket failed to print");
      return { status: "failed", error: (err as Error).message };
    }
  }

  app.setErrorHandler((err: Error & { validation?: unknown }, _req, reply) => {
    if (err instanceof OrderError || err instanceof MenuError || err.validation) return reply.code(400).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: "Something went wrong" });
  });

  app.get("/api/health", async () => ({ ok: true, printer: currentPrinter().configured ? "network" : "console" }));

  app.get("/api/settings", async () => getSettings(db));

  app.patch<{ Body: Partial<Settings> }>(
    "/api/settings",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            restaurantName: { type: "string", minLength: 1, maxLength: 80 },
            taxRate: { type: "number", minimum: 0, maximum: 0.5 },
            printerHost: { type: "string", maxLength: 255 },
            printerPort: { type: "integer", minimum: 1, maximum: 65535 },
          },
        },
      },
    },
    async (req) => updateSettings(db, req.body),
  );

  app.get("/api/menu", async () => getMenu(db));

  app.post<{ Body: { name: string; note?: string | null } }>(
    "/api/menu/categories",
    { schema: { body: { type: "object", required: ["name"], properties: categoryProperties } } },
    async (req, reply) => reply.code(201).send(createCategory(db, req.body)),
  );

  app.patch<{ Params: { id: number }; Body: { name?: string; note?: string | null } }>(
    "/api/menu/categories/:id",
    { schema: { params: idParams, body: { type: "object", properties: categoryProperties } } },
    async (req, reply) =>
      updateCategory(db, req.params.id, req.body) ? { ok: true } : reply.code(404).send({ error: "Category not found" }),
  );

  app.post<{ Body: MenuItemInput & { categoryId: number; name: string } }>(
    "/api/menu/items",
    { schema: { body: { type: "object", required: ["categoryId", "name"], properties: menuItemProperties } } },
    async (req, reply) => reply.code(201).send(createMenuItem(db, req.body)),
  );

  app.patch<{ Params: { id: number }; Body: MenuItemInput }>(
    "/api/menu/items/:id",
    { schema: { params: idParams, body: { type: "object", properties: menuItemProperties } } },
    async (req, reply) => updateMenuItem(db, req.params.id, req.body) ?? reply.code(404).send({ error: "Menu item not found" }),
  );

  app.delete<{ Params: { id: number } }>("/api/menu/items/:id", { schema: { params: idParams } }, async (req, reply) =>
    removeMenuItem(db, req.params.id) ? { ok: true } : reply.code(404).send({ error: "Menu item not found" }),
  );

  app.get("/api/orders", async () => listOrders(db, businessDate(new Date())));

  app.post<{ Body: NewOrder }>("/api/orders", { schema: { body: newOrderSchema } }, async (req, reply) => {
    const order = createOrder(db, req.body, { taxRate: getSettings(db).taxRate });
    const print = await printTicket(order, "new");
    return reply.code(201).send({ order, print } satisfies OrderResult);
  });

  app.post<{ Params: { id: number } }>("/api/orders/:id/reprint", { schema: { params: idParams } }, async (req, reply) => {
    const order = getOrder(db, req.params.id);
    if (!order) return reply.code(404).send({ error: "Order not found" });
    return { order, print: await printTicket(order, "reprint") } satisfies OrderResult;
  });

  app.post<{ Params: { id: number } }>("/api/orders/:id/cancel", { schema: { params: idParams } }, async (req, reply) => {
    const existing = getOrder(db, req.params.id);
    if (!existing) return reply.code(404).send({ error: "Order not found" });
    const order = setOrderStatus(db, existing.id, "cancelled")!;
    return { order, print: await printTicket(order, "cancelled") } satisfies OrderResult;
  });

  // In production the hub also serves the built tablet app.
  if (webDist && existsSync(webDist)) {
    app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/") ? reply.code(404).send({ error: "Not found" }) : reply.sendFile("index.html"),
    );
  }

  return app;
}
