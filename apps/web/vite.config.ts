import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the tablet loads the app from Vite (port 5173), which forwards /api to the hub server.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:3000" } },
});
