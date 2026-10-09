# Restaurant Orders

Tablet ordering and kitchen ticket system for a family-owned Chinese takeout restaurant.
The cashier enters orders on a tablet; a hub computer in the restaurant saves them and prints
kitchen tickets on a network receipt printer. Read `docs/requirements.md` for scope, roadmap
and decisions before proposing features.

## Layout

- `apps/server` – Node.js + TypeScript backend (Fastify). Runs on the hub.
  - `src/app.ts` routes, `src/orders.ts` order logic, `src/menu.ts` menu,
    `src/ticket.ts` ticket layout + ESC/POS bytes, `src/printer.ts` network/console printers,
    `src/db.ts` SQLite schema (built-in `node:sqlite`, no native modules).
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
- An order is always saved even if printing fails; the API returns `print.status` and the
  cashier can reprint. Never lose an order because of the printer.
- No printer configured (`PRINTER_HOST` empty) prints tickets to the server log.
- Keep it working offline: no cloud calls in the order path.
- Node 22.13+ is required (`node:sqlite`).
