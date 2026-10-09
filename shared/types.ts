// Types shared by the server and the web app.

export type OrderType = "walk_in" | "phone";
export type OrderStatus = "open" | "ready" | "picked_up" | "cancelled";
export type PrintStatus = "printed" | "failed" | "not_configured";

export interface MenuItem {
  id: number;
  categoryId: number;
  name: string;
  /** Optional second-language name for tickets, e.g. Chinese. */
  altName: string | null;
  priceCents: number;
  available: boolean;
}

export interface MenuCategory {
  id: number;
  name: string;
  items: MenuItem[];
}

export interface NewOrderItem {
  menuItemId: number;
  quantity: number;
  note?: string;
}

export interface NewOrder {
  type: OrderType;
  customerName?: string;
  customerPhone?: string;
  note?: string;
  items: NewOrderItem[];
}

export interface OrderItem {
  id: number;
  menuItemId: number;
  name: string;
  altName: string | null;
  quantity: number;
  unitPriceCents: number;
  note: string | null;
}

export interface Order {
  id: number;
  /** Short number shown on the ticket; starts again at 1 each day. */
  number: number;
  businessDate: string;
  type: OrderType;
  status: OrderStatus;
  customerName: string | null;
  customerPhone: string | null;
  note: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  createdAt: string;
  items: OrderItem[];
}

export interface OrderResult {
  order: Order;
  print: { status: PrintStatus; error?: string };
}
