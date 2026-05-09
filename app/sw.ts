/// <reference lib="webworker" />
/**
 * Service worker for the Nihongo PWA.
 *
 * Strategy:
 * - Precache the client app shell + bundled seed JSONs (so first-load assets
 *   work offline once visited).
 * - Runtime cache the Google Fonts CSS/font files (CSS for ~7 days, fonts for
 *   ~1 year — both immutable URLs once published).
 * - Do NOT cache Anthropic / Gemini API calls — those are auth'd, dynamic, and
 *   user-specific. They simply pass through to the network.
 * - SPA navigation fallback to /index.html so deep links work offline.
 */

import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

// Precache (manifest injected by vite-plugin-pwa).
precacheAndRoute(self.__WB_MANIFEST);

// SPA shell fallback — any navigation request resolves to /index.html.
const spaFallback = createHandlerBoundToURL("/index.html");
registerRoute(new NavigationRoute(spaFallback));

// Google Fonts stylesheet
registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com",
  new StaleWhileRevalidate({
    cacheName: "google-fonts-css",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  }),
);

// Google Fonts files
registerRoute(
  ({ url }) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: "google-fonts-files",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 32,
        maxAgeSeconds: 365 * 24 * 60 * 60,
      }),
    ],
  }),
);

// Activate the new SW immediately on update; clients reload via registerSW.
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});
