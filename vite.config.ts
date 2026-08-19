import { defineConfig, loadEnv, mergeConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Manual replacement for @lovable.dev/vite-tanstack-config. That package was
// a thin wrapper — this composes the same underlying plugins directly, minus
// the Lovable-sandbox-only behavior (HMR gate, dev-server bridge, asset
// proxy), which only ever activated inside Lovable's own preview anyway.
//
// Set NITRO_PRESET (or edit the default below) to match your host:
//   vercel | netlify | cloudflare-module | node-server | ...
// See: https://nitro.build/deploy

export default defineConfig(async ({ command, mode }) => {
  const plugins = [];

  if (mode === "development") {
    const { devtools } = await import("@tanstack/devtools-vite");
    plugins.push(
      devtools({
        logging: false,
        eventBusConfig: { enabled: false },
        enhancedLogs: { enabled: false },
        consolePiping: { enabled: false },
        removeDevtoolsOnBuild: false,
        injectSource: { enabled: true },
      }),
    );
  }

  const tailwindcss = (await import("@tailwindcss/vite")).default;
  plugins.push(tailwindcss());

  const tsConfigPaths = (await import("vite-tsconfig-paths")).default;
  plugins.push(tsConfigPaths({ projects: ["./tsconfig.json"] }));

  const { tanstackStart } = await import("@tanstack/react-start/plugin/vite");
  plugins.push(
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
  );

  // Nitro build target. Defaults to Node; override via NITRO_PRESET env var
  // or just hardcode the preset for your host (e.g. "vercel").
  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    plugins.push(
      nitro({
        preset: process.env.NITRO_PRESET || "node-server",
      }),
    );
  }

  const viteReact = (await import("@vitejs/plugin-react")).default;
  plugins.push(viteReact());

  plugins.push(
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      strategies: "generateSW",
      filename: "sw.js",
      devOptions: { enabled: false },
      manifest: false,
      workbox: {
        navigateFallback: null,
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//, /^\/_serverFn\//],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "serai-pages",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.origin === self.location.origin &&
              /\.(png|jpg|jpeg|svg|webp|ico|woff2)$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "serai-assets",
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "serai-fonts" },
          },
        ],
      },
    }),
  );

  // Inline VITE_* env vars into import.meta.env at build time — same
  // behavior the wrapper's envDefine option provided.
  const loadedEnv = loadEnv(mode, process.cwd(), "VITE_");
  const define: Record<string, string> = {};
  for (const [key, value] of Object.entries(loadedEnv)) {
    define[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  return mergeConfig(
    {
      define,
      css: { transformer: "lightningcss" },
      resolve: {
        alias: { "@": `${process.cwd()}/src` },
        dedupe: [
          "react",
          "react-dom",
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
          "@tanstack/react-query",
          "@tanstack/query-core",
        ],
      },
      optimizeDeps: {
        include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
        ignoreOutdatedRequests: true,
      },
      server: { host: "::", port: 8080 },
      plugins,
    },
    {},
  );
});
