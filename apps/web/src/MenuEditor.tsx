import { useState } from "react";
import type { MenuCategory, MenuItem, MenuItemInput } from "../../../shared/types";
import { api, parseMoney } from "./api";

interface Draft {
  code: string;
  name: string;
  price: string;
  sizes: { name: string; price: string }[];
  choices: string;
  spicy: boolean;
  available: boolean;
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

function toDraft(item?: MenuItem): Draft {
  if (!item) return { code: "", name: "", price: "", sizes: [], choices: "", spicy: false, available: true };
  const size = item.optionGroups.find((g) => g.name === "Size");
  const choice = item.optionGroups.find((g) => g.name === "Choice");
  return {
    code: item.code,
    name: item.name,
    price: dollars(item.priceCents),
    sizes: size?.options.map((o) => ({ name: o.name, price: dollars(item.priceCents + o.extraCents) })) ?? [],
    choices: choice?.options.map((o) => o.name).join(", ") ?? "",
    spicy: item.spicy,
    available: item.available,
  };
}

/** Turns the form into an API payload, or an error message to show. */
function toInput(d: Draft): MenuItemInput | string {
  if (!d.name.trim()) return "Give the dish a name";
  const input: MenuItemInput = {
    code: d.code.trim(),
    name: d.name.trim(),
    spicy: d.spicy,
    available: d.available,
    choices: d.choices.split(",").map((c) => c.trim()).filter(Boolean),
  };
  if (d.sizes.length) {
    if (d.sizes.length < 2) return "Use at least two sizes, or remove sizes for a single price";
    const sizes = d.sizes.map((s) => ({ name: s.name.trim(), priceCents: parseMoney(s.price) }));
    if (sizes.some((s) => !s.name)) return "Every size needs a name, like Pt or Qt";
    if (sizes.some((s) => s.priceCents === null)) return "Every size needs a price, like 7.60";
    input.sizes = sizes as { name: string; priceCents: number }[];
  } else {
    const price = parseMoney(d.price);
    if (price === null) return "Enter a price, like 7.60";
    input.priceCents = price;
    input.sizes = [];
  }
  return input;
}

function ItemEditor({
  item,
  categoryId,
  onSaved,
  onCancel,
}: {
  item?: MenuItem;
  categoryId: number;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(item));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(item));
  const set = (changes: Partial<Draft>) => setDraft((d) => ({ ...d, ...changes }));
  const setSize = (i: number, changes: Partial<Draft["sizes"][number]>) =>
    set({ sizes: draft.sizes.map((s, k) => (k === i ? { ...s, ...changes } : s)) });

  async function save() {
    const input = toInput(draft);
    if (typeof input === "string") return setError(input);
    setSaving(true);
    setError(null);
    try {
      if (item) await api.saveItem(item.id, input);
      else await api.addItem({ ...input, categoryId, name: input.name! });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!item || !confirm(`Remove ${item.code} ${item.name} from the menu?`)) return;
    await api.removeItem(item.id);
    onSaved();
  }

  return (
    <article className={`edit-item${draft.available ? "" : " sold-out"}`}>
      <div className="edit-row">
        <input className="edit-code" placeholder="No." value={draft.code} onChange={(e) => set({ code: e.target.value })} />
        <input className="edit-name" placeholder="Dish name" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        <button className={draft.spicy ? "chip small active" : "chip small"} onClick={() => set({ spicy: !draft.spicy })}>
          ★ Spicy
        </button>
        <button className={draft.available ? "chip small" : "chip small active"} onClick={() => set({ available: !draft.available })}>
          Sold out
        </button>
      </div>

      <div className="edit-row">
        <span className="edit-label">Price</span>
        {draft.sizes.length === 0 ? (
          <>
            <span className="money-input">
              $<input inputMode="decimal" value={draft.price} onChange={(e) => set({ price: e.target.value })} />
            </span>
            <button
              className="link"
              onClick={() => set({ sizes: [{ name: "Pt", price: draft.price }, { name: "Qt", price: draft.price }] })}
            >
              + Sizes (Pt/Qt)
            </button>
          </>
        ) : (
          <>
            {draft.sizes.map((s, i) => (
              <span key={i} className="size-input">
                <input className="size-name" value={s.name} onChange={(e) => setSize(i, { name: e.target.value })} />
                <span className="money-input">
                  $<input inputMode="decimal" value={s.price} onChange={(e) => setSize(i, { price: e.target.value })} />
                </span>
                <button className="link" aria-label={`Remove size ${s.name}`} onClick={() => set({ sizes: draft.sizes.filter((_, k) => k !== i) })}>
                  ×
                </button>
              </span>
            ))}
            <button className="link" onClick={() => set({ sizes: [...draft.sizes, { name: "", price: "" }] })}>
              + Size
            </button>
          </>
        )}
      </div>

      <div className="edit-row">
        <span className="edit-label">Choices</span>
        <input
          className="edit-choices"
          placeholder="Optional, e.g. Chicken, Roast Pork"
          value={draft.choices}
          onChange={(e) => set({ choices: e.target.value })}
        />
      </div>

      {error && <div className="banner error">{error}</div>}
      {(dirty || !item) && (
        <div className="edit-actions">
          <button className="secondary" onClick={() => (item ? setDraft(toDraft(item)) : onCancel?.())}>
            Cancel
          </button>
          <button className="primary" onClick={save} disabled={saving}>
            {item ? "Save" : "Add to menu"}
          </button>
        </div>
      )}
      {item && !dirty && (
        <div className="edit-actions">
          <button className="link danger-link" onClick={remove}>
            Remove from menu
          </button>
        </div>
      )}
    </article>
  );
}

export function MenuEditor({ menu, onChanged }: { menu: MenuCategory[]; onChanged: () => Promise<void> }) {
  const [categoryId, setCategoryId] = useState(menu[0]?.id);
  const [adding, setAdding] = useState(false);
  const category = menu.find((c) => c.id === categoryId) ?? menu[0];

  async function addCategory() {
    const name = prompt("Name of the new menu section");
    if (!name?.trim()) return;
    const created = await api.addCategory(name.trim());
    await onChanged();
    setCategoryId(created.id);
  }

  async function saveCategory(changes: { name?: string; note?: string | null }) {
    if (!category) return;
    await api.saveCategory(category.id, changes);
    await onChanged();
  }

  return (
    <main className="menu-editor">
      <div className="categories">
        {menu.map((c) => (
          <button key={c.id} className={c.id === category?.id ? "chip active" : "chip"} onClick={() => { setCategoryId(c.id); setAdding(false); }}>
            {c.name}
          </button>
        ))}
        <button className="chip" onClick={addCategory}>
          + Section
        </button>
      </div>

      {category && (
        <>
          <div className="edit-row category-fields">
            <input
              key={`name-${category.id}`}
              className="edit-name"
              defaultValue={category.name}
              aria-label="Section name"
              onBlur={(e) => e.target.value.trim() && e.target.value !== category.name && saveCategory({ name: e.target.value.trim() })}
            />
            <input
              key={`note-${category.id}`}
              className="edit-choices"
              defaultValue={category.note ?? ""}
              placeholder="Note shown to the cashier, e.g. served with fried rice"
              aria-label="Section note"
              onBlur={(e) => e.target.value !== (category.note ?? "") && saveCategory({ note: e.target.value.trim() || null })}
            />
          </div>
          <p className="category-note">
            {category.items.length} dishes. Price changes apply to new orders; past orders keep what was charged. Sold-out dishes stay on the order screen, greyed out.
          </p>
          <div className="edit-list">
            {category.items.map((item) => (
              <ItemEditor key={`${item.id}-${JSON.stringify(item)}`} item={item} categoryId={category.id} onSaved={onChanged} />
            ))}
            {adding ? (
              <ItemEditor
                categoryId={category.id}
                onSaved={async () => {
                  setAdding(false);
                  await onChanged();
                }}
                onCancel={() => setAdding(false)}
              />
            ) : (
              <button className="secondary add-item" onClick={() => setAdding(true)}>
                + Add a dish to {category.name}
              </button>
            )}
          </div>
        </>
      )}
    </main>
  );
}
