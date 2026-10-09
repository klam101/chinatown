# Requirements & Roadmap (snapshot)

The living version of this document is the shared Claude Doc:
https://claude.ai/code/artifact/d01dc4d9-07c8-490b-a427-590b9b187b53
When the two disagree, the Claude Doc wins. Update this snapshot when decisions change.

## Goal

Replace shouted orders with written kitchen tickets, so no order is forgotten when the
restaurant (a family Chinese takeout) gets busy. The cashier enters each order on a tablet,
the kitchen gets a printed ticket, and everyone can see which orders are open and which are done.

## Version 1 (MVP) must-haves

- Menu on the tablet with real items, sizes and prices, editable without a programmer
- Build an order with quantities, item notes ("no MSG", "extra spicy") and an order note
- Order type: walk-in or phone, with customer name / phone for pickup
- Short order number per order (restarts daily)
- Send prints a kitchen ticket: large text, order number, time, items, notes
- Reprint a ticket; edit or cancel an order after sending (prints CHANGED / CANCELLED ticket)
- Keeps working if the internet drops (everything runs on the local network)
- Order total shown to the cashier, with tax
- No payments: the existing register handles payment

## Roadmap

1. **Version 1:** orders become printed tickets. Gate: a full busy week with no lost or wrong tickets.
2. **Version 2:** kitchen screen (open orders oldest first, wait time), mark Ready, rush alerts,
   end-of-day counts. Gate: chefs use the screen every shift.
3. **Version 3:** card payments and customer receipts (premium feature), sales reports.
   Gate: daily totals match the cash and card records.
4. **Final:** online / phone-in orders in the same queue, customer pickup screen, per-station
   tickets, saved regular customers, Chinese and English tickets.

## Hardware

- Order tablet: Mast's iPad Mini for testing; must work on any iPad or Android tablet (browser).
- Hub: a small computer (Raspberry Pi or mini PC) on the restaurant network runs the server.
- Kitchen printer: 80 mm receipt printer on the network, Wi-Fi preferred (no cable across the
  workspace), Ethernet as fallback. Epson TM-m30III (thermal) or Epson TM-U220 (impact, for hot spots).

## Decisions (2026-10-09)

- Web app (installable PWA), not a native App Store app.
- The hub prints; the tablet never talks to the printer directly. Tickets are ESC/POS over TCP port 9100.
- MVP prints paper tickets; the kitchen screen waits for version 2.
- No payments in the MVP; card payments become a premium feature later.

## Open questions

- Where will the printer sit, and does the Wi-Fi reach it?
- Orders on a busy night, and how many chefs?
- Is there a menu file or printed menu to copy items and prices from?
- Tickets in Chinese, English, or both?
