import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
      },
      manifest: {
        name: "일본어 단어 암기",
        short_name: "일본어단어",
        start_url: ".",
        display: "standalone",
        background_color: "#0f0f10",
        theme_color: "#0f0f10",
      },
    }),
  ],
});
