import { useEffect, useState } from "react";
import type { Settings } from "../../../shared/types";
import { api } from "./api";

export function SettingsScreen({ onSaved }: { onSaved: (settings: Settings) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState({ restaurantName: "", taxPercent: "", printerHost: "", printerPort: "" });
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    api.settings().then((s) => {
      setSettings(s);
      setForm({
        restaurantName: s.restaurantName,
        taxPercent: String(Math.round(s.taxRate * 1e5) / 1e3),
        printerHost: s.printerHost,
        printerPort: String(s.printerPort),
      });
    });
  }, []);

  async function save() {
    const taxPercent = Number(form.taxPercent);
    const printerPort = Number(form.printerPort);
    if (!form.restaurantName.trim()) return setMessage({ kind: "error", text: "Enter the restaurant's name" });
    if (form.taxPercent.trim() === "" || !(taxPercent >= 0 && taxPercent <= 50))
      return setMessage({ kind: "error", text: "Enter the sales tax as a percent, like 8.875" });
    if (!Number.isInteger(printerPort) || printerPort < 1 || printerPort > 65535)
      return setMessage({ kind: "error", text: "The printer port is usually 9100" });
    try {
      const saved = await api.saveSettings({
        restaurantName: form.restaurantName.trim(),
        taxRate: Math.round(taxPercent * 1000) / 100000,
        printerHost: form.printerHost.trim(),
        printerPort,
      });
      setSettings(saved);
      onSaved(saved);
      setMessage({ kind: "ok", text: "Settings saved" });
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    }
  }

  if (!settings) return null;
  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <main className="settings">
      <label>
        Restaurant name
        <input {...field("restaurantName")} />
      </label>
      <label>
        Sales tax (%)
        <input inputMode="decimal" {...field("taxPercent")} />
      </label>
      <label>
        Kitchen printer address
        <input placeholder="e.g. 192.168.1.50 (empty: tickets go to the server log)" {...field("printerHost")} />
      </label>
      <label>
        Printer port
        <input inputMode="numeric" {...field("printerPort")} />
      </label>
      {message && <div className={`banner ${message.kind}`}>{message.text}</div>}
      <button className="primary" onClick={save}>
        Save settings
      </button>
    </main>
  );
}
