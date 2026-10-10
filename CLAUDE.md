# Restaurant Orders

Tablet ordering and kitchen ticket system, built first for the owner's family Chinese takeout
restaurant and meant to become a SaaS product sold to many restaurants (like Toast).

The problem: the cashier shouts orders to the kitchen and chefs must remember them, which breaks
down when it gets busy. The cashier enters orders on a tablet instead, and a kitchen ticket
prints so chefs can see which orders are open and which are done.

The requirements and roadmap doc is the source of truth for scope and decisions:
https://claude.ai/code/artifact/d01dc4d9-07c8-490b-a427-590b9b187b53
`docs/requirements.md` is an older snapshot from before the cloud decision.

## Decisions

- Web app (installable PWA) that works on any tablet; tested on an iPad Mini. No native app.
- Cloud-based: one API and one Postgres database shared by all restaurants. Every row carries
  its restaurant id; logins have roles (owner, manager, cashier).
- No in-restaurant computer and no offline mode: the internet is reliable, and card payments
  stop without it anyway.
- Printing: an 80 mm Wi-Fi receipt printer that fetches tickets from the cloud (Epson Server
  Direct Print, e.g. TM-m30III, or Star CloudPRNT). Tickets may print a few seconds after Send.
- Roadmap: v1 printed kitchen tickets; v2 kitchen screen and Ready status; v3 card payments
  (premium feature) and reports; later online orders, pickup screen, stations, bilingual tickets.
  The current register keeps handling payments until v3.
- The family restaurant tests every phase before any other restaurant sees it.

## Planned stack

React + TypeScript + Vite (PWA, plain CSS) · Node + TypeScript + Fastify · Postgres · hosted
auth (e.g. Supabase Auth or Clerk) · a managed host for API and database · Vitest.

Next step: build the frontend first with mock data (login, pick restaurant, staff and roles,
plus the existing screens), then list every API call those screens need as the backend plan.

## Current code

The code below is the earlier local version: the server runs on a computer in the restaurant,
stores data in SQLite and prints directly over the network. It is being moved to the cloud
design above.

## Layout

- `apps/server` – Node.js + TypeScript backend (Fastify). Runs on the hub (local version).
  - `src/app.ts` routes, `src/orders.ts` order logic, `src/menu.ts` menu,
    `src/ticket.ts` ticket layout + ESC/POS bytes, `src/printer.ts` network/console printers,
    `src/db.ts` SQLite schema (built-in `node:sqlite`, no native modules),
    `src/menu-data.ts` starter menu (seeded into an empty database only), `src/settings.ts`
    restaurant settings (name, tax rate, printer) stored in the database.
- `apps/web` – React + TypeScript tablet app (Vite), installable as a PWA.
- `shared/types.ts` – types used by both sides.

## Commands

- `npm install` – install everything (npm workspaces)
- `npm run dev` – server on :3000 and web app on :5173 (`--host`, so the iPad can open it)
- `npm test` – server tests (Vitest)
- `npm run typecheck` – both apps
- `npm run build && npm start` – production: the server also serves the built web app on :3000

## Conventions

- Money is integer cents. Order numbers restart each business day.
- Menu items keep the paper menu's number (`code`, e.g. "L6", "19"). Sizes (Pt/Qt) and protein
  picks ("Chicken or Roast Pork") are option groups; the order must pick one option per group.
- No migrations yet: a database with an older `user_version` is rebuilt on start. Replace this
  with real migrations before the restaurant has live data.
- An order is always saved even if printing fails; the API returns `print.status` and the
  cashier can reprint. Never lose an order because of the printer.
- No printer configured (`PRINTER_HOST` empty) prints tickets to the server log.
- Nothing restaurant-specific in code: menu, prices, tax and printer live in the database and
  are edited in the app (Menu and Settings tabs). The product is meant to be sold to many
  restaurants, so new per-restaurant values go in settings, not constants or env vars.
- Node 22.13+ is required (`node:sqlite`).
