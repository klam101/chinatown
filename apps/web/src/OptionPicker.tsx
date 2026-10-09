import { useState } from "react";
import type { MenuItem, MenuOption } from "../../../shared/types";
import { money } from "./api";

/**
 * Asks for the item's size and/or protein. The item goes into the order as soon as every
 * group has a pick, so a sized "or" dish takes two taps (e.g. Qt, then Chicken).
 */
export function OptionPicker({
  item,
  onAdd,
  onClose,
}: {
  item: MenuItem;
  onAdd: (options: MenuOption[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<(MenuOption | undefined)[]>(item.optionGroups.map(() => undefined));

  function pick(groupIndex: number, option: MenuOption) {
    const next = picked.map((p, i) => (i === groupIndex ? option : p));
    if (next.every(Boolean)) onAdd(next as MenuOption[]);
    else setPicked(next);
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={`Options for ${item.name}`} onClick={(e) => e.stopPropagation()}>
        <header>
          <strong>
            {item.code && <span className="item-code">{item.code}</span>} {item.name}
          </strong>
          <button className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {item.optionGroups.map((group, g) => (
          <section key={group.name}>
            <h3>{group.name === "Choice" ? "Choose" : group.name}</h3>
            <div className="options">
              {group.options.map((o) => (
                <button key={o.id} className={picked[g]?.id === o.id ? "option active" : "option"} onClick={() => pick(g, o)}>
                  <span>{o.name}</span>
                  {group.name === "Size" && <small>{money(item.priceCents + o.extraCents)}</small>}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
