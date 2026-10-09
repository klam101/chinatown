import type { MenuCategory, MenuItem, MenuItemInput, NewOrder, Order, OrderResult, Settings } from "../../../shared/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  menu: () => request<MenuCategory[]>("/api/menu"),
  orders: () => request<Order[]>("/api/orders"),
  createOrder: (order: NewOrder) => request<OrderResult>("/api/orders", { method: "POST", body: JSON.stringify(order) }),
  reprint: (id: number) => request<OrderResult>(`/api/orders/${id}/reprint`, { method: "POST" }),
  cancel: (id: number) => request<OrderResult>(`/api/orders/${id}/cancel`, { method: "POST" }),
  settings: () => request<Settings>("/api/settings"),
  saveSettings: (changes: Partial<Settings>) =>
    request<Settings>("/api/settings", { method: "PATCH", body: JSON.stringify(changes) }),
  addCategory: (name: string) => request<MenuCategory>("/api/menu/categories", { method: "POST", body: JSON.stringify({ name }) }),
  saveCategory: (id: number, changes: { name?: string; note?: string | null }) =>
    request<{ ok: true }>(`/api/menu/categories/${id}`, { method: "PATCH", body: JSON.stringify(changes) }),
  addItem: (item: MenuItemInput & { categoryId: number; name: string }) =>
    request<MenuItem>("/api/menu/items", { method: "POST", body: JSON.stringify(item) }),
  saveItem: (id: number, changes: MenuItemInput) =>
    request<MenuItem>(`/api/menu/items/${id}`, { method: "PATCH", body: JSON.stringify(changes) }),
  removeItem: (id: number) => request<{ ok: true }>(`/api/menu/items/${id}`, { method: "DELETE" }),
};

/** Parses a typed dollar amount ("7.6", "$7.60") into cents; null when it isn't a price. */
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[$\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
