import { useEffect, useState } from "react";
import type { Order } from "../../../shared/types";
import { api, money } from "./api";

export function OrdersList() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => api.orders().then(setOrders, (e: Error) => setMessage(e.message));
  useEffect(() => {
    load();
  }, []);

  async function reprint(order: Order) {
    const { print } = await api.reprint(order.id);
    setMessage(print.status === "failed" ? `Ticket #${order.number} still did not print: ${print.error}` : `Ticket #${order.number} reprinted`);
  }

  async function cancel(order: Order) {
    if (!confirm(`Cancel order #${order.number}? A CANCELLED ticket will print.`)) return;
    await api.cancel(order.id);
    setMessage(`Order #${order.number} cancelled`);
    load();
  }

  return (
    <main className="orders-list">
      {message && <div className="banner ok">{message}</div>}
      {orders.length === 0 && <p className="empty">No orders yet today.</p>}
      {orders.map((o) => (
        <article key={o.id} className={`order-card ${o.status}`}>
          <header>
            <strong>#{o.number}</strong>
            <span>{o.type === "phone" ? "Phone" : "Walk-in"}</span>
            <span>{new Date(o.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
            {o.customerName && <span>{o.customerName}</span>}
            <span className="status">{o.status === "cancelled" ? "Cancelled" : ""}</span>
            <strong className="right">{money(o.totalCents)}</strong>
          </header>
          <ul>
            {o.items.map((i) => (
              <li key={i.id}>
                {i.quantity} × {i.name}
                {i.note && <em> ({i.note})</em>}
              </li>
            ))}
          </ul>
          {o.status !== "cancelled" && (
            <footer>
              <button className="secondary" onClick={() => reprint(o)}>
                Reprint ticket
              </button>
              <button className="danger" onClick={() => cancel(o)}>
                Cancel order
              </button>
            </footer>
          )}
        </article>
      ))}
    </main>
  );
}
