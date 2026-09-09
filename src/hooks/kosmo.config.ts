import { defineConfig } from "@kosmojs/dev";

// Delivery-event webhooks (spec §3.4). Public by nature - providers call in from
// the internet - so this folder is separated from the private submission API and
// protects itself with provider signature verification instead of a collection id.
export default defineConfig({
  backend: {
    stack: "hono",
    base: "/api/webhooks",
  },
  validation: true,
});
