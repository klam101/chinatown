import { useState } from "react";
import type { MenuCategory, MenuItem, OrderType } from "../../../shared/types";
import { api, money } from "./api";

interface CartLine {
  key: number;
  item: MenuItem;
  quantity: number;
  note: string;
}

const QUICK_NOTES = ["Extra spicy", "No onion", "No MSG", "Sauce on side"];

let nextKey = 1;

export function OrderScreen({ menu }: { menu: MenuCategory[] }) {
  const [categoryId, setCategoryId] = useState(menu[0]?.id);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [type, setType] = useState<OrderType>("walk_in");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [editingKey, setEditingKey] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const category = menu.find((c) => c.id === categoryId) ?? menu[0];
  const subtotal = cart.reduce((sum, l) => sum + l.item.priceCents * l.quantity, 0);

  function add(item: MenuItem) {
    setMessage(null);
    setCart((lines) => {
      const same = lines.find((l) => l.item.id === item.id && !l.note);
      if (same) return lines.map((l) => (l === same ? { ...l, quantity: l.quantity + 1 } : l));
      return [...lines, { key: nextKey++, item, quantity: 1, note: "" }];
    });
  }

  function change(key: number, delta: number) {
    setCart((lines) =>
      lines.flatMap((l) => (l.key !== key ? [l] : l.quantity + delta <= 0 ? [] : [{ ...l, quantity: l.quantity + delta }])),
    );
  }

  function setLineNote(key: number, value: string) {
    setCart((lines) => lines.map((l) => (l.key === key ? { ...l, note: value } : l)));
  }

  function clear() {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setNote("");
    setType("walk_in");
    setEditingKey(null);
  }

  async function send() {
    setSending(true);
    setMessage(null);
    try {
      const { order, print } = await api.createOrder({
        type,
        customerName,
        customerPhone,
        note,
        items: cart.map((l) => ({ menuItemId: l.item.id, quantity: l.quantity, note: l.note })),
      });
      clear();
      if (print.status === "failed") {
        setMessage({ kind: "error", text: `Order #${order.number} saved, but the ticket did NOT print. Reprint it from Today's orders.` });
      } else {
        setMessage({ kind: "ok", text: `Order #${order.number} sent to the kitchen. Total ${money(order.totalCents)}` });
      }
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="order-screen">
      <section className="menu">
        <div className="categories">
          {menu.map((c) => (
            <button key={c.id} className={c.id === category?.id ? "chip active" : "chip"} onClick={() => setCategoryId(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="items">
          {category?.items.map((item) => (
            <button key={item.id} className="item" disabled={!item.available} onClick={() => add(item)}>
              <span className="item-name">{item.name}</span>
              {item.altName && <span className="item-alt">{item.altName}</span>}
              <span className="item-price">{item.available ? money(item.priceCents) : "Sold out"}</span>
            </button>
          ))}
        </div>
      </section>

      <aside className="cart">
        <div className="segmented">
          <button className={type === "walk_in" ? "active" : ""} onClick={() => setType("walk_in")}>
            Walk-in
          </button>
          <button className={type === "phone" ? "active" : ""} onClick={() => setType("phone")}>
            Phone
          </button>
        </div>
        <div className="customer">
          <input placeholder="Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          <input placeholder="Phone" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
        </div>

        <ul className="lines">
          {cart.length === 0 && <li className="empty">Tap menu items to add them</li>}
          {cart.map((l) => (
            <li key={l.key} className="line">
              <div className="line-main">
                <button className="qty" onClick={() => change(l.key, -1)} aria-label="Remove one">
                  −
                </button>
                <span className="qty-count">{l.quantity}</span>
                <button className="qty" onClick={() => change(l.key, 1)} aria-label="Add one">
                  +
                </button>
                <button className="line-name" onClick={() => setEditingKey(editingKey === l.key ? null : l.key)}>
                  {l.item.name}
                  {l.note && <span className="line-note">{l.note}</span>}
                </button>
                <span className="line-price">{money(l.item.priceCents * l.quantity)}</span>
              </div>
              {editingKey === l.key && (
                <div className="note-editor">
                  {QUICK_NOTES.map((q) => (
                    <button key={q} className="chip small" onClick={() => setLineNote(l.key, l.note ? `${l.note}, ${q}` : q)}>
                      {q}
                    </button>
                  ))}
                  <input placeholder="Note for this item" value={l.note} onChange={(e) => setLineNote(l.key, e.target.value)} />
                </div>
              )}
            </li>
          ))}
        </ul>

        <input className="order-note" placeholder="Note for the whole order" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="total">
          <span>Subtotal (before tax)</span>
          <strong>{money(subtotal)}</strong>
        </div>
        {message && <div className={`banner ${message.kind}`}>{message.text}</div>}
        <div className="actions">
          <button className="secondary" onClick={clear} disabled={sending || cart.length === 0}>
            Clear
          </button>
          <button className="primary" onClick={send} disabled={sending || cart.length === 0}>
            {sending ? "Sending…" : "Send to kitchen"}
          </button>
        </div>
      </aside>
    </main>
  );
}
