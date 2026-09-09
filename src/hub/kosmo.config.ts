import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "@kosmojs/dev";

export default defineConfig({
  frontend: {
    stack: "react",
    base: "/",
    fetch: true,
    ssr: false,
    ssg: false,
    tanstack: { query: true },
    viteConfig: {
      // The React plugin reaches Vite through `stack`; anything else goes here.
      plugins: [tailwindcss()],
    },
  },
  backend: {
    stack: "hono",
    base: "/hub/api",
  },
  validation: true,
});
