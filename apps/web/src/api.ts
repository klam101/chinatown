import type { MenuCategory, NewOrder, Order, OrderResult } from "../../../shared/types";

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
};

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
