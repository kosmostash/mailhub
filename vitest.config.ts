import { defineConfig } from "vitest/config";

/**
 * Tests for the shared domain layer.
 *
 * KosmoJS owns the per-folder Vite configs (there is no root vite.config.ts by
 * design); this file configures Vitest only, and covers the `@/` code the
 * folders import rather than the folders themselves.
 */
export default defineConfig({
  resolve: {
    alias: { "@": new URL("./", import.meta.url).pathname.replace(/\/$/, "") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Every suite gets its own in-memory database and a predictable
    // installation config, so nothing leaks between files.
    env: {
      MAILHUB_DB: ":memory:",
      MAILHUB_SESSION_SECRET: "test-secret",
      NODE_ENV: "test",
    },
  },
});
