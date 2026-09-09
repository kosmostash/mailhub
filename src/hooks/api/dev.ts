import { getRequestListener } from "@hono/node-server";

import { closeDb } from "@/db";

import { devSetup } from "_/api:factory";

import app from "./app";

export default devSetup({
  requestHandler() {
    return getRequestListener(app.fetch);
  },
  teardownHandler() {
    closeDb();
  },
});

process.on("unhandledRejection", (reason) => {
  console.error("💥 UNHANDLED REJECTION");
  console.error("Reason:", reason);
  process.exit(1);
});
