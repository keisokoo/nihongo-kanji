import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  // Dev + preview over LAN (e.g. https://192.168.x.x:5173 from phone).
  // Required because crypto.subtle / service workers only work in secure
  // contexts. basicSsl() generates a self-signed cert; first-time browser
  // visit needs a trust prompt. Use `npm run preview` to test the real PWA
  // (with sw.js + precache) — `npm run dev` does NOT build the SW.
  server: {
    host: true,
    https: {},
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    https: {},
  },
  plugins: [
    basicSsl(),
    tailwindcss(),
    reactRouter(),
    // Manifest only — the SW is built separately by scripts/build-sw.mjs because
    // vite-plugin-pwa's SW step doesn't survive RR7's dual vite passes.
    VitePWA({
      // Disable both SW strategies; we build sw.js ourselves post-build.
      injectRegister: "auto",
      strategies: "injectManifest",
      srcDir: "app",
      filename: "sw.ts",
      // Skip workbox SW generation — only emit manifest + register script.
      disable: false,
      injectManifest: {
        injectionPoint: undefined,
      },
      registerType: "autoUpdate",
      manifest: {
        name: "Nihongo — 일본어 한자 학습",
        short_name: "Nihongo",
        description: "JLPT N5–N1 한자/단어/예문 학습 PWA",
        theme_color: "#0a0a0a",
        background_color: "#fafafa",
        display: "standalone",
        start_url: "/",
        scope: "/",
        lang: "ko",
        icons: [
          {
            src: "/pwa-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/pwa-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
