import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages는 /nihongo-vocab/ 하위 경로로 서빙되므로 빌드 시 base를 맞춘다.
// (dev 서버는 base "/" 로 두어 로컬 개발 경로를 깔끔하게 유지)
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/nihongo-vocab/" : "/",
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
}));
