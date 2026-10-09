import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import type { NewOrder, Order, OrderResult } from "../../../shared/types.js";
import type { Db } from "./db.js";
import { createMenuItem, getMenu, updateMenuItem } from "./menu.js";
import { businessDate, createOrder, getOrder, listOrders, OrderError, setOrderStatus } from "./orders.js";
import type { Printer } from "./printer.js";
import { buildTicket, type TicketKind } from "./ticket.js";

export interface AppOptions {
  db: Db;
  printer: Printer;
  taxRate: number;
  webDist?: string;
  logger?: boolean;
}

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
          note: { type: "string", maxLength: 200 },
        },
      },
    },
  },
} as const;

const idParams = { type: "object", properties: { id: { type: "integer" } } } as const;

export function buildApp({ db, printer, taxRate, webDist, logger = false }: AppOptions) {
  const app = Fastify({ logger });

  async function printTicket(order: Order, kind: TicketKind): Promise<OrderResult["print"]> {
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
    if (err instanceof OrderError || err.validation) return reply.code(400).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: "Something went wrong" });
  });

  app.get("/api/health", async () => ({ ok: true, printer: printer.configured ? "network" : "console" }));

  app.get("/api/menu", async () => getMenu(db));

  app.post<{ Body: { categoryId: number; name: string; altName?: string; priceCents: number } }>(
    "/api/menu/items",
    {
      schema: {
        body: {
          type: "object",
          required: ["categoryId", "name", "priceCents"],
          properties: {
            categoryId: { type: "integer" },
            name: { type: "string", minLength: 1, maxLength: 80 },
            altName: { type: "string", maxLength: 80 },
            priceCents: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    async (req, reply) => reply.code(201).send(createMenuItem(db, req.body)),
  );

  app.patch<{ Params: { id: number }; Body: { name?: string; altName?: string | null; priceCents?: number; available?: boolean } }>(
    "/api/menu/items/:id",
    {
      schema: {
        params: idParams,
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 80 },
            altName: { type: ["string", "null"], maxLength: 80 },
            priceCents: { type: "integer", minimum: 0 },
            available: { type: "boolean" },
          },
        },
      },
    },
    async (req, reply) => {
      const item = updateMenuItem(db, req.params.id, req.body);
      return item ?? reply.code(404).send({ error: "Menu item not found" });
    },
  );

  app.get("/api/orders", async () => listOrders(db, businessDate(new Date())));

  app.post<{ Body: NewOrder }>("/api/orders", { schema: { body: newOrderSchema } }, async (req, reply) => {
    const order = createOrder(db, req.body, { taxRate });
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
