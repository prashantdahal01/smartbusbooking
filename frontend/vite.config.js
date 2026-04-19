import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // The Three.js hero is intentionally code-split and loaded lazily.
    chunkSizeWarningLimit: 1200,
  },
});
