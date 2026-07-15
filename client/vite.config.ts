import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    port: 5173,
    open: false,
  },
  resolve: {
    alias: {
      "@fps/shared": path.resolve(root, "../shared/src/index.ts"),
    },
  },
});
