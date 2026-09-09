import { defineConfig } from "@kosmojs/dev";

// The submission API: the contract client projects program against (spec §3).
// Private by design - LAN/DMZ only - so it carries no session auth, only the
// collection id in `x-collection-id`. Deployed on its own, or behind
// `dist/run.js` alongside the other folders.
export default defineConfig({
  backend: {
    stack: "hono",
    base: "/api",
    openapi: {
      outfile: "openapi.json",
      openapi: "3.1.0",
      info: {
        title: "MailHub Submission API",
        version: "1.0.0",
        summary: "Submit emails to MailHub and poll their delivery outcome.",
        description: [
          "Every request identifies its collection with an `x-collection-id` header.",
          "",
          "This API is meant to be reachable from your own projects' backends only",
          "(LAN/DMZ), never from the public internet.",
        ].join("\n"),
        license: { name: "MIT" },
      },
      servers: [
        { url: "http://localhost:4556/api", description: "Development server" },
        { url: "http://mailhub.internal/api", description: "Self-hosted install" },
      ],
    },
  },
  validation: true,
});
