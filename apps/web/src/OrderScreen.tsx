import { useState } from "react";
import type { MenuCategory, MenuItem, MenuOption, OrderType } from "../../../shared/types";
import { api, money } from "./api";
import { OptionPicker } from "./OptionPicker";

interface CartLine {
  key: number;
  item: MenuItem;
  options: MenuOption[];
  quantity: number;
  note: string;
}

const unitPrice = (l: Pick<CartLine, "item" | "options">) =>
  l.item.priceCents + l.options.reduce((sum, o) => sum + o.extraCents, 0);
const sameOptions = (a: MenuOption[], b: MenuOption[]) =>
  a.length === b.length && a.every((o, i) => o.id === b[i].id);

/** Lowest and highest price, for items whose price depends on size. */
function priceLabel(item: MenuItem): string {
  const size = item.optionGroups.find((g) => g.name === "Size");
  if (!size) return money(item.priceCents);
  const extras = size.options.map((o) => o.extraCents);
  return `${money(item.priceCents + Math.min(...extras))}–${money(item.priceCents + Math.max(...extras))}`;
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
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const category = menu.find((c) => c.id === categoryId) ?? menu[0];
  const subtotal = cart.reduce((sum, l) => sum + unitPrice(l) * l.quantity, 0);

  // Searching by menu number ("L6", "19") or name looks across the whole menu.
  const query = search.trim().toLowerCase();
  const shownItems = query
    ? menu
        .flatMap((c) => c.items)
        .filter((i) => i.code.toLowerCase() === query || (query.length > 1 && i.name.toLowerCase().includes(query)))
    : (category?.items ?? []);

  function tap(item: MenuItem) {
    setMessage(null);
    if (item.optionGroups.length) setPicking(item);
    else add(item, []);
  }

  function add(item: MenuItem, options: MenuOption[]) {
    setPicking(null);
    setSearch("");
    setCart((lines) => {
      const same = lines.find((l) => l.item.id === item.id && sameOptions(l.options, options) && !l.note);
      if (same) return lines.map((l) => (l === same ? { ...l, quantity: l.quantity + 1 } : l));
      return [...lines, { key: nextKey++, item, options, quantity: 1, note: "" }];
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
        items: cart.map((l) => ({
          menuItemId: l.item.id,
          quantity: l.quantity,
          optionIds: l.options.map((o) => o.id),
          note: l.note,
        })),
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
        <input
          className="search"
          type="search"
          placeholder="Menu number or name, e.g. L6 or lo mein"
          autoCapitalize="characters"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!query && (
          <div className="categories">
            {menu.map((c) => (
              <button key={c.id} className={c.id === category?.id ? "chip active" : "chip"} onClick={() => setCategoryId(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}
        {!query && category?.note && <p className="category-note">{category.note}</p>}
        <div className="items">
          {query && shownItems.length === 0 && <p className="empty">No menu item matches "{search}"</p>}
          {shownItems.map((item) => (
            <button key={item.id} className="item" disabled={!item.available} onClick={() => tap(item)}>
              <span className="item-head">
                {item.code && <span className="item-code">{item.code}</span>}
                {item.spicy && <span className="spicy" title="Hot & spicy">★</span>}
              </span>
              <span className="item-name">{item.name}</span>
              {item.altName && <span className="item-alt">{item.altName}</span>}
              <span className="item-price">{item.available ? priceLabel(item) : "Sold out"}</span>
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
                  <span>
                    {l.item.code && <span className="line-code">{l.item.code}</span>}
                    {l.item.name}
                  </span>
                  {l.options.length > 0 && <span className="line-options">{l.options.map((o) => o.name).join(" · ")}</span>}
                  {l.note && <span className="line-note">{l.note}</span>}
                </button>
                <span className="line-price">{money(unitPrice(l) * l.quantity)}</span>
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
      {picking && <OptionPicker item={picking} onAdd={(options) => add(picking, options)} onClose={() => setPicking(null)} />}
    </main>
  );
}
