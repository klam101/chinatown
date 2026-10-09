// Types shared by the server and the web app.

export type OrderType = "walk_in" | "phone";
export type OrderStatus = "open" | "ready" | "picked_up" | "cancelled";
export type PrintStatus = "printed" | "failed" | "not_configured";

export interface MenuOption {
  id: number;
  name: string;
  /** Added to the item's base price when chosen (sizes cost more, proteins usually don't). */
  extraCents: number;
}

/** A required pick of exactly one option, such as size (Pt/Qt) or protein (Chicken/Roast Pork). */
export interface MenuOptionGroup {
  name: string;
  options: MenuOption[];
}

export interface MenuItem {
  id: number;
  categoryId: number;
  /** The number printed on the paper menu, e.g. "L6" or "19". Empty when there is none. */
  code: string;
  name: string;
  /** Optional second-language name for tickets, e.g. Chinese. */
  altName: string | null;
  /** Price before options; the cheapest size when the item has sizes. */
  priceCents: number;
  spicy: boolean;
  available: boolean;
  optionGroups: MenuOptionGroup[];
}

export interface MenuCategory {
  id: number;
  name: string;
  note: string | null;
  items: MenuItem[];
}

export interface NewOrderItem {
  menuItemId: number;
  quantity: number;
  /** One option id from each of the item's option groups. */
  optionIds?: number[];
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
  code: string;
  name: string;
  altName: string | null;
  /** Chosen option names, e.g. ["Qt", "Chicken"]. */
  options: string[];
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
