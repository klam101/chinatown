import type { Order } from "../../../shared/types.js";

/** Characters per line on an 80 mm printer in its normal font. */
export const LINE_WIDTH = 42;

export type LineStyle = "normal" | "tall" | "big";
export interface TicketLine {
  text: string;
  style?: LineStyle;
  bold?: boolean;
}

export type TicketKind = "new" | "reprint" | "cancelled";

const RULE: TicketLine = { text: "-".repeat(LINE_WIDTH) };

/** Lays out a kitchen ticket. Rendering to printer bytes or plain text is separate. */
export function buildTicket(order: Order, kind: TicketKind = "new"): TicketLine[] {
  const lines: TicketLine[] = [];
  if (kind === "cancelled") lines.push({ text: "*** CANCELLED ***", style: "big", bold: true });
  if (kind === "reprint") lines.push({ text: "REPRINT", bold: true });

  const type = order.type === "phone" ? "PHONE" : "WALK-IN";
  lines.push({ text: `#${order.number}  ${type}`, style: "big", bold: true });

  const time = new Date(order.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  lines.push({ text: `${time}  ${order.businessDate}` });
  const customer = [order.customerName, order.customerPhone].filter(Boolean).join("  ");
  if (customer) lines.push({ text: customer, bold: true });
  lines.push(RULE);

  for (const item of order.items) {
    lines.push({ text: `${item.quantity} x ${item.name}`, style: "tall", bold: true });
    if (item.note) lines.push({ text: `   >> ${item.note}`, style: "tall" });
  }

  lines.push(RULE);
  if (order.note) lines.push({ text: `NOTE: ${order.note}`, style: "tall", bold: true });
  return lines;
}

export function renderText(lines: TicketLine[]): string {
  return lines.map((l) => l.text).join("\n") + "\n";
}

const ESC = 0x1b;
const GS = 0x1d;
const SIZE: Record<LineStyle, number> = { normal: 0x00, tall: 0x01, big: 0x11 };

/** Turns ticket lines into ESC/POS bytes, the command language almost every receipt printer speaks. */
export function renderEscPos(lines: TicketLine[]): Buffer {
  const parts: Buffer[] = [Buffer.from([ESC, 0x40])]; // reset printer
  for (const line of lines) {
    parts.push(Buffer.from([GS, 0x21, SIZE[line.style ?? "normal"]]));
    parts.push(Buffer.from([ESC, 0x45, line.bold ? 1 : 0]));
    // The default code page has no Chinese; non-ASCII becomes "?" until we add a GB18030 mode.
    parts.push(Buffer.from(line.text.replace(/[^\x20-\x7e]/g, "?") + "\n", "ascii"));
  }
  parts.push(Buffer.from([GS, 0x21, 0, ESC, 0x45, 0]));
  parts.push(Buffer.from([GS, 0x56, 0x42, 0x04])); // feed 4 lines, then partial cut
  return Buffer.concat(parts);
}
