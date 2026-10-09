import { Socket } from "node:net";
import { renderEscPos, renderText, type TicketLine } from "./ticket.js";

export interface Printer {
  /** True when a real printer is configured. */
  readonly configured: boolean;
  print(lines: TicketLine[]): Promise<void>;
}

/** Sends tickets to a network receipt printer on raw port 9100 (Wi-Fi or Ethernet). */
export class NetworkPrinter implements Printer {
  readonly configured = true;
  constructor(
    private host: string,
    private port = 9100,
    private timeoutMs = 5000,
  ) {}

  print(lines: TicketLine[]): Promise<void> {
    const data = renderEscPos(lines);
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      socket.setTimeout(this.timeoutMs);
      socket.once("timeout", () => socket.destroy(new Error(`Printer at ${this.host} did not respond`)));
      socket.once("error", reject);
      socket.connect(this.port, this.host, () => socket.end(data, () => resolve()));
    });
  }
}

/** Used when no printer is set up: shows each ticket in the server log instead. */
export class ConsolePrinter implements Printer {
  readonly configured = false;
  async print(lines: TicketLine[]): Promise<void> {
    console.log("\n[ticket]\n" + renderText(lines));
  }
}
