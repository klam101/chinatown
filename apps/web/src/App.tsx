import { useCallback, useEffect, useState } from "react";
import type { MenuCategory } from "../../../shared/types";
import { api } from "./api";
import { MenuEditor } from "./MenuEditor";
import { OrderScreen } from "./OrderScreen";
import { OrdersList } from "./OrdersList";
import { SettingsScreen } from "./SettingsScreen";

type View = "new" | "today" | "menu" | "settings";

const TABS: { view: View; label: string }[] = [
  { view: "new", label: "New order" },
  { view: "today", label: "Today's orders" },
  { view: "menu", label: "Menu" },
  { view: "settings", label: "Settings" },
];

export function App() {
  const [view, setView] = useState<View>("new");
  const [menu, setMenu] = useState<MenuCategory[] | null>(null);
  const [restaurantName, setRestaurantName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadMenu = useCallback(
    () =>
      api.menu().then(
        (m) => {
          setMenu(m);
          setError(null);
        },
        (e: Error) => setError(e.message),
      ),
    [],
  );

  useEffect(() => {
    loadMenu();
    api.settings().then((s) => setRestaurantName(s.restaurantName), () => {});
  }, [loadMenu, view]);

  return (
    <div className="app">
      <header className="topbar">
        <nav>
          {TABS.map((t) => (
            <button key={t.view} className={view === t.view ? "tab active" : "tab"} onClick={() => setView(t.view)}>
              {t.label}
            </button>
          ))}
        </nav>
        <span className="restaurant-name">{restaurantName}</span>
      </header>
      {error && <div className="banner error">Can't reach the hub: {error}</div>}
      {view === "new" && menu && <OrderScreen menu={menu} />}
      {view === "today" && <OrdersList />}
      {view === "menu" && menu && <MenuEditor menu={menu} onChanged={loadMenu} />}
      {view === "settings" && <SettingsScreen onSaved={(s) => setRestaurantName(s.restaurantName)} />}
    </div>
  );
}
