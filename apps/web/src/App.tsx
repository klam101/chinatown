import { useEffect, useState } from "react";
import type { MenuCategory } from "../../../shared/types";
import { api } from "./api";
import { OrderScreen } from "./OrderScreen";
import { OrdersList } from "./OrdersList";

type View = "new" | "today";

export function App() {
  const [view, setView] = useState<View>("new");
  const [menu, setMenu] = useState<MenuCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.menu().then(setMenu, (e: Error) => setError(e.message));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <nav>
          <button className={view === "new" ? "tab active" : "tab"} onClick={() => setView("new")}>
            New order
          </button>
          <button className={view === "today" ? "tab active" : "tab"} onClick={() => setView("today")}>
            Today's orders
          </button>
        </nav>
      </header>
      {error && <div className="banner error">Can't reach the hub: {error}</div>}
      {view === "new" && menu && <OrderScreen menu={menu} />}
      {view === "today" && <OrdersList />}
    </div>
  );
}
