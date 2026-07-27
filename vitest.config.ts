import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "roughjs/bin/rough": "roughjs/bin/rough.js",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    server: {
      deps: {
        // Excalidraw ships ESM. Inline it so Vite can apply the RoughJS alias.
        inline: ["@excalidraw/excalidraw", "roughjs"],
      },
    },
  },
});
