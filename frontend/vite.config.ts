import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Dev server runs on 8080 so the Discord OAuth redirect URI
// (http://localhost:8080/api/auth/callback) is identical in dev and in the
// Docker/nginx deployment. `/api` and `/health` proxy to the backend.
// Change this if your backend dev server runs elsewhere.
const backend = "http://localhost:3000";

export default defineConfig(({ mode }) => {
  const base = loadEnv(mode, ".", "VITE_").VITE_BASE_PATH || "/";
  return {
    base: base.endsWith("/") ? base : `${base}/`,
    plugins: [react()],
    server: {
      port: 8080,
      proxy: {
        "/api": { target: backend, changeOrigin: true },
        "/health": { target: backend, changeOrigin: true },
      },
    },
  };
});
