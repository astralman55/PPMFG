import { defineConfig } from "vitest/config";
import path from "node:path";

// Mirrors tsconfig.json's "@/*" path alias so Vitest can import the same
// app/ and lib/ files Next.js resolves at build time.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  // tsconfig.json sets jsx: "preserve" because Next's own compiler owns the
  // JSX transform at build/dev time. Vitest doesn't go through Next's
  // compiler, so it needs to be told explicitly to use the same automatic
  // runtime Next uses - otherwise esbuild falls back to the classic
  // React.createElement transform, which fails at test time since no file
  // in this codebase imports React by convention.
  esbuild: {
    jsx: "automatic",
  },
});
