import { defineConfig } from "@kosmojs/dev";

export default defineConfig({
  frontend: {
    stack: "react",
    base: "/",
    fetch: true,
    ssr: false,
    ssg: false,
    tanstack: { query: true },
  },
  backend: {
    stack: "hono",
    base: "/hub/api",
  },
  validation: true,
});
