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

/** What the menu editor sends to create or change an item. */
export interface MenuItemInput {
  categoryId?: number;
  code?: string;
  name?: string;
  altName?: string | null;
  /** The price for an item without sizes. */
  priceCents?: number;
  /** Each size with its full price, e.g. Pt $4.95 and Qt $7.60. Empty for one-price items. */
  sizes?: { name: string; priceCents: number }[];
  /** Protein or style picks, e.g. ["Chicken", "Roast Pork"]. */
  choices?: string[];
  spicy?: boolean;
  available?: boolean;
}

export interface Settings {
  restaurantName: string;
  /** Sales tax as a decimal, e.g. 0.08875. */
  taxRate: number;
  /** Kitchen printer address on the restaurant network; empty prints to the server log. */
  printerHost: string;
  printerPort: number;
}
