# Chinatown Orders

Take orders on a tablet, print kitchen tickets automatically. Built for a takeout restaurant
where orders used to be shouted to the kitchen.

- **Tablet app** (any iPad or Android tablet, in the browser): menu buttons, quantities,
  item notes, walk-in or phone, send to kitchen, reprint and cancel.
- **Hub server** (a small computer on the restaurant network): stores orders in SQLite and
  prints tickets on a network receipt printer. Works without internet.

See [docs/requirements.md](docs/requirements.md) for the goals and roadmap.

## Run it on your computer

Requires Node.js 22.13 or newer.

```sh
npm install
npm run dev
```

Open http://localhost:5173. To try it on the iPad, connect it to the same Wi-Fi and open
`http://<your-computer's-IP>:5173`. Without a printer, tickets appear in the terminal.

## Connect a printer

Copy `.env.example` to `.env` and set the printer's IP address (print a self-test page
from the printer to find it):

```
PRINTER_HOST=192.168.1.50
PRINTER_PORT=9100
```

## Run it in the restaurant

```sh
npm run build
npm start
```

The hub then serves the app at `http://<hub-IP>:3000`. On the iPad, open that address in
Safari and choose Share → Add to Home Screen.

## Tests

```sh
npm test
```
