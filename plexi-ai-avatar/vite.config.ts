import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative base so the static build works on GitHub Pages / Cloudflare Pages sub-paths.
  base: "./",
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/three/") || id.includes("@react-three")) return "three";
          if (id.includes("@elevenlabs") || id.includes("livekit")) return "voice";
        },
      },
    },
  },
});
