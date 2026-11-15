import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The UI always calls a relative /api path. In development Vite proxies it to
// the local FastAPI service; the presenting build is served by FastAPI itself.
const apiTarget = process.env.SABUT_API_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/demo": { target: apiTarget, changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/demo": { target: apiTarget, changeOrigin: true },
    },
  },
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 900 },
});
