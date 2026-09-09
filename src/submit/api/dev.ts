import { getRequestListener } from "@hono/node-server";

import { closeDb } from "@/db";
import { closeTransports } from "@/domain/delivery";
import { close as closeSystemMail } from "@/domain/systemMail";

import { devSetup } from "_/api:factory";

import app from "./app";

export default devSetup({
  requestHandler() {
    return getRequestListener(app.fetch);
  },
  // The API program restarts as a whole on every reload; without this the
  // SQLite handle and any provider socket would leak across restarts.
  async teardownHandler() {
    await closeTransports();
    closeSystemMail();
    closeDb();
  },
});

process.on("unhandledRejection", (reason) => {
  console.error("💥 UNHANDLED REJECTION");
  console.error("Reason:", reason);
  process.exit(1);
});
